import { RequestHandler } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { PortInfo, PortsResponse, KillProcessRequest, ProcessOperationResponse } from "@shared/api";

const execAsync = promisify(exec);

/**
 * Parse netstat output to extract port information
 */
function parseNetstatOutput(output: string): PortInfo[] {
  const lines = output.split('\n').slice(1); // Skip header
  const ports: PortInfo[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Different parsing for different OS
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Windows netstat format
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const protocol = parts[0].toLowerCase() as "tcp" | "udp";
        const localAddress = parts[1];
        const foreignAddress = parts[2];
        const state = parts[3];
        const pid = parts[4] ? parseInt(parts[4]) : undefined;

        const [address, portStr] = localAddress.split(':');
        const port = parseInt(portStr);

        if (!isNaN(port)) {
          ports.push({
            port,
            protocol,
            state: state as any,
            pid,
            address: address || '0.0.0.0',
            foreignAddress: foreignAddress !== '*:*' ? foreignAddress : undefined,
          });
        }
      }
    } else {
      // Unix-like systems
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 6) {
        const protocol = parts[0].toLowerCase() as "tcp" | "udp";
        const localAddress = parts[3];
        const state = parts[5];

        const lastColonIndex = localAddress.lastIndexOf(':');
        if (lastColonIndex > 0) {
          const address = localAddress.substring(0, lastColonIndex);
          const portStr = localAddress.substring(lastColonIndex + 1);
          const port = parseInt(portStr);

          if (!isNaN(port)) {
            ports.push({
              port,
              protocol,
              state: state as any,
              address: address || '0.0.0.0',
            });
          }
        }
      }
    }
  }

  return ports;
}

/**
 * Get process information for a given PID
 */
async function getProcessInfo(pid: number): Promise<{ name?: string; path?: string }> {
  try {
    const isWindows = process.platform === 'win32';
    const command = isWindows 
      ? `tasklist /FI "PID eq ${pid}" /FO CSV /NH`
      : `ps -p ${pid} -o comm=,args=`;
    
    const { stdout } = await execAsync(command);
    
    if (isWindows) {
      const lines = stdout.trim().split('\n');
      if (lines.length > 0) {
        const parts = lines[0].split(',');
        if (parts.length >= 2) {
          return {
            name: parts[0].replace(/"/g, ''),
            path: parts[1]?.replace(/"/g, ''),
          };
        }
      }
    } else {
      const lines = stdout.trim().split('\n');
      if (lines.length > 0) {
        const parts = lines[0].trim().split(/\s+/, 2);
        return {
          name: parts[0],
          path: parts[1],
        };
      }
    }
  } catch (error) {
    // Process might have ended
  }
  
  return {};
}

/**
 * Get all open ports
 */
export const handleGetPorts: RequestHandler = async (req, res) => {
  try {
    const isWindows = process.platform === 'win32';
    const command = isWindows 
      ? 'netstat -ano'
      : 'netstat -tulpn';

    const { stdout } = await execAsync(command);
    let ports = parseNetstatOutput(stdout);

    // Get process information for each port
    for (const port of ports) {
      if (port.pid) {
        const processInfo = await getProcessInfo(port.pid);
        port.processName = processInfo.name;
        port.processPath = processInfo.path;
      }
    }

    // Remove duplicates and sort by port number
    const uniquePorts = Array.from(
      new Map(ports.map(p => [`${p.port}-${p.protocol}-${p.address}`, p])).values()
    ).sort((a, b) => a.port - b.port);

    const response: PortsResponse = {
      ports: uniquePorts,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting ports:', error);
    res.status(500).json({ error: 'Failed to get port information' });
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
        message: 'PID is required' 
      });
    }

    const isWindows = process.platform === 'win32';
    const command = isWindows 
      ? `taskkill /PID ${pid} /F`
      : `kill -9 ${pid}`;

    await execAsync(command);

    const response: ProcessOperationResponse = {
      success: true,
      message: `Process ${pid} killed successfully`,
      port,
      pid,
    };

    res.json(response);
  } catch (error) {
    console.error('Error killing process:', error);
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
      return res.status(400).json({ error: 'Valid port number is required' });
    }

    const isWindows = process.platform === 'win32';
    const command = isWindows 
      ? `netstat -ano | findstr :${portNumber}`
      : `netstat -tulpn | grep :${portNumber}`;

    const { stdout } = await execAsync(command);
    const ports = parseNetstatOutput(stdout);

    // Get process information
    for (const port of ports) {
      if (port.pid) {
        const processInfo = await getProcessInfo(port.pid);
        port.processName = processInfo.name;
        port.processPath = processInfo.path;
      }
    }

    res.json({ ports, timestamp: Date.now() });
  } catch (error) {
    console.error('Error getting port details:', error);
    res.status(500).json({ error: 'Failed to get port details' });
  }
};
