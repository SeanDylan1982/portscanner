import { RequestHandler } from "express";
import { readFile } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import {
  PortInfo,
  PortsResponse,
  KillProcessRequest,
  ProcessOperationResponse,
} from "@shared/api";

const execAsync = promisify(exec);

/**
 * Convert hex address to IP address
 */
function hexToIp(hex: string): string {
  if (hex.length === 8) {
    // IPv4
    const ip = [];
    for (let i = 6; i >= 0; i -= 2) {
      ip.push(parseInt(hex.substr(i, 2), 16));
    }
    return ip.join(".");
  } else if (hex.length === 32) {
    // IPv6 - simplified conversion
    const ip = [];
    for (let i = 0; i < 32; i += 4) {
      ip.push(hex.substr(i, 4));
    }
    return ip.join(":").replace(/:(0000:)+/g, "::");
  }
  return hex;
}

/**
 * Convert hex port to decimal
 */
function hexToPort(hex: string): number {
  return parseInt(hex, 16);
}

/**
 * Parse /proc/net/tcp or /proc/net/udp file
 */
function parseProcNet(data: string, protocol: "tcp" | "udp"): PortInfo[] {
  const lines = data.trim().split("\n").slice(1); // Skip header
  const ports: PortInfo[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 10) continue;

    try {
      const localAddress = parts[1];
      const remoteAddress = parts[2];
      const state = parts[3];
      const uid = parts[7];
      const inode = parts[9];

      const [localHex, localPortHex] = localAddress.split(":");
      const [remoteHex, remotePortHex] = remoteAddress.split(":");

      const port = hexToPort(localPortHex);
      const address = hexToIp(localHex);
      const foreignAddress =
        remoteHex !== "00000000"
          ? `${hexToIp(remoteHex)}:${hexToPort(remotePortHex)}`
          : undefined;

      // Convert state for TCP
      let stateStr = "UNKNOWN";
      if (protocol === "tcp") {
        const stateMap: { [key: string]: string } = {
          "01": "ESTABLISHED",
          "02": "SYN_SENT",
          "03": "SYN_RECV",
          "04": "FIN_WAIT1",
          "05": "FIN_WAIT2",
          "06": "TIME_WAIT",
          "07": "CLOSE",
          "08": "CLOSE_WAIT",
          "09": "LAST_ACK",
          "0A": "LISTENING",
          "0B": "CLOSING",
        };
        stateStr = stateMap[state] || "UNKNOWN";
      } else {
        stateStr = "LISTENING"; // UDP is always listening
      }

      ports.push({
        port,
        protocol,
        state: stateStr as any,
        address,
        foreignAddress,
      });
    } catch (error) {
      // Skip malformed lines
      continue;
    }
  }

  return ports;
}

/**
 * Get process information for a given inode
 */
async function getProcessInfoByInode(
  inode: string,
): Promise<{ pid?: number; name?: string; path?: string }> {
  try {
    // Find processes that have this socket inode
    const { stdout } = await execAsync(
      `find /proc/*/fd -lname "*socket:[${inode}]*" 2>/dev/null | head -1`,
    );
    if (!stdout.trim()) return {};

    const pidMatch = stdout.match(/\/proc\/(\d+)\//);
    if (!pidMatch) return {};

    const pid = parseInt(pidMatch[1]);

    // Get process name and path
    try {
      const [cmdline, exe] = await Promise.all([
        readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => ""),
        readFile(`/proc/${pid}/exe`, "utf8").catch(() => ""),
      ]);

      const name = cmdline.split("\0")[0].split("/").pop() || `pid:${pid}`;

      return {
        pid,
        name,
        path: exe || cmdline.split("\0")[0],
      };
    } catch {
      return { pid };
    }
  } catch {
    return {};
  }
}

/**
 * Get process information for ports using a more efficient method
 */
async function enrichPortsWithProcessInfo(
  ports: PortInfo[],
): Promise<PortInfo[]> {
  // For each unique port, try to find the process
  const portMap = new Map<string, PortInfo>();

  for (const port of ports) {
    const key = `${port.protocol}-${port.port}`;
    if (!portMap.has(key)) {
      portMap.set(key, port);
    }
  }

  // Try to get process info using lsof-like approach with /proc
  for (const [key, port] of portMap) {
    try {
      // For listening ports, try to find the process more directly
      if (port.state === "LISTENING") {
        const { stdout } = await execAsync(
          `grep -l ":${port.port.toString(16).toUpperCase().padStart(4, "0")}" /proc/*/net/${port.protocol} 2>/dev/null | head -1`,
        );
        if (stdout.trim()) {
          const pidMatch = stdout.match(/\/proc\/(\d+)\//);
          if (pidMatch) {
            const pid = parseInt(pidMatch[1]);
            try {
              const cmdline = await readFile(`/proc/${pid}/cmdline`, "utf8");
              const name =
                cmdline.split("\0")[0].split("/").pop() || `pid:${pid}`;

              port.pid = pid;
              port.processName = name;
              port.processPath = cmdline.split("\0")[0];
            } catch {
              port.pid = pid;
            }
          }
        }
      }
    } catch {
      // Continue without process info
    }
  }

  return ports;
}

/**
 * Get all open ports using /proc/net
 */
export const handleGetPorts: RequestHandler = async (req, res) => {
  try {
    const [tcpData, udpData] = await Promise.all([
      readFile("/proc/net/tcp", "utf8").catch(() => ""),
      readFile("/proc/net/udp", "utf8").catch(() => ""),
    ]);

    let ports: PortInfo[] = [];

    if (tcpData) {
      const tcpPorts = parseProcNet(tcpData, "tcp");
      ports = ports.concat(tcpPorts);
    }

    if (udpData) {
      const udpPorts = parseProcNet(udpData, "udp");
      ports = ports.concat(udpPorts);
    }

    // Enrich with process information
    ports = await enrichPortsWithProcessInfo(ports);

    // Remove duplicates and sort by port number
    const uniquePorts = Array.from(
      new Map(
        ports.map((p) => [`${p.port}-${p.protocol}-${p.address}`, p]),
      ).values(),
    ).sort((a, b) => a.port - b.port);

    const response: PortsResponse = {
      ports: uniquePorts,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    console.error("Error getting ports:", error);
    res.status(500).json({ error: "Failed to get port information" });
  }
};

/**
 * Kill a process by PID
 */
export const handleKillProcess: RequestHandler = async (req, res) => {
  try {
    const { pid, port }: KillProcessRequest = req.body;

    if (!pid) {
      return res.status(400).json({
        success: false,
        message: "PID is required",
      });
    }

    // Use kill command to terminate the process
    await execAsync(`kill -9 ${pid}`);

    const response: ProcessOperationResponse = {
      success: true,
      message: `Process ${pid} killed successfully`,
      port,
      pid,
    };

    res.json(response);
  } catch (error) {
    console.error("Error killing process:", error);
    const response: ProcessOperationResponse = {
      success: false,
      message: `Failed to kill process: ${error}`,
    };
    res.status(500).json(response);
  }
};

/**
 * Get detailed information about a specific port
 */
export const handleGetPortDetails: RequestHandler = async (req, res) => {
  try {
    const { port: portNumber } = req.params;

    if (!portNumber || isNaN(parseInt(portNumber))) {
      return res.status(400).json({ error: "Valid port number is required" });
    }

    const port = parseInt(portNumber);

    // Get all ports and filter by the specific port
    const [tcpData, udpData] = await Promise.all([
      readFile("/proc/net/tcp", "utf8").catch(() => ""),
      readFile("/proc/net/udp", "utf8").catch(() => ""),
    ]);

    let ports: PortInfo[] = [];

    if (tcpData) {
      const tcpPorts = parseProcNet(tcpData, "tcp").filter(
        (p) => p.port === port,
      );
      ports = ports.concat(tcpPorts);
    }

    if (udpData) {
      const udpPorts = parseProcNet(udpData, "udp").filter(
        (p) => p.port === port,
      );
      ports = ports.concat(udpPorts);
    }

    // Enrich with process information
    ports = await enrichPortsWithProcessInfo(ports);

    res.json({ ports, timestamp: Date.now() });
  } catch (error) {
    console.error("Error getting port details:", error);
    res.status(500).json({ error: "Failed to get port details" });
  }
};
