import { WebSocket, WebSocketServer } from "ws";
import { PortInfo, PortUpdateMessage } from "@shared/api";
import { readFile } from "fs/promises";

interface PortTracker {
  lastPorts: Map<string, PortInfo>;
  clients: Set<WebSocket>;
  pollInterval?: NodeJS.Timeout;
}

const portTracker: PortTracker = {
  lastPorts: new Map(),
  clients: new Set(),
};

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
 * Get current ports using /proc/net
 */
async function getCurrentPorts(): Promise<Map<string, PortInfo>> {
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

    const portsMap = new Map<string, PortInfo>();
    for (const port of ports) {
      const key = `${port.port}-${port.protocol}-${port.address}`;
      portsMap.set(key, port);
    }

    return portsMap;
  } catch (error) {
    console.error("Error getting current ports:", error);
    return new Map();
  }
}

/**
 * Compare ports and send updates
 */
async function checkForPortChanges() {
  try {
    const currentPorts = await getCurrentPorts();
    const timestamp = Date.now();

    // Check for new ports
    for (const [key, port] of currentPorts) {
      if (!portTracker.lastPorts.has(key)) {
        const message: PortUpdateMessage = {
          type: "port_added",
          port,
          timestamp,
        };
        broadcastMessage(message);
      }
    }

    // Check for removed ports
    for (const [key, port] of portTracker.lastPorts) {
      if (!currentPorts.has(key)) {
        const message: PortUpdateMessage = {
          type: "port_removed",
          port,
          timestamp,
        };
        broadcastMessage(message);
      }
    }

    // Update the last known state
    portTracker.lastPorts = currentPorts;
  } catch (error) {
    console.error("Error checking for port changes:", error);
  }
}

/**
 * Broadcast message to all connected clients
 */
function broadcastMessage(message: PortUpdateMessage) {
  const messageStr = JSON.stringify(message);

  // Create a copy of clients to avoid issues with concurrent modification
  const clients = Array.from(portTracker.clients);

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(messageStr);
      } catch (error) {
        console.error("Error sending WebSocket message:", error);
        // Remove client if there's an error
        portTracker.clients.delete(client);
      }
    } else {
      // Remove client if not open
      portTracker.clients.delete(client);
    }
  });
}

/**
 * Start port monitoring
 */
function startPortMonitoring() {
  if (portTracker.pollInterval) {
    clearInterval(portTracker.pollInterval);
  }

  // Initialize with current ports
  getCurrentPorts().then((ports) => {
    portTracker.lastPorts = ports;
  });

  // Poll for changes every 3 seconds (less frequent to reduce load)
  portTracker.pollInterval = setInterval(checkForPortChanges, 3000);
}

/**
 * Stop port monitoring
 */
function stopPortMonitoring() {
  if (portTracker.pollInterval) {
    clearInterval(portTracker.pollInterval);
    portTracker.pollInterval = undefined;
  }
}

/**
 * Setup WebSocket server
 */
export function setupWebSocketServer(server: any) {
  const wss = new WebSocketServer({
    server,
    perMessageDeflate: false, // Disable compression to avoid frame issues
    maxPayload: 16 * 1024, // 16KB max payload
  });

  wss.on("connection", (ws: WebSocket) => {
    console.log("New WebSocket client connected");

    // Add client to the set
    portTracker.clients.add(ws);

    // Start monitoring if this is the first client
    if (portTracker.clients.size === 1) {
      startPortMonitoring();
    }

    // Handle client disconnect
    ws.on("close", () => {
      console.log("WebSocket client disconnected");
      portTracker.clients.delete(ws);

      // Stop monitoring if no clients left
      if (portTracker.clients.size === 0) {
        stopPortMonitoring();
      }
    });

    // Handle errors
    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      portTracker.clients.delete(ws);
    });

    // Handle client messages (for future commands)
    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log("Received WebSocket message:", message);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    });

    // Send initial port state
    getCurrentPorts().then((ports) => {
      for (const [, port] of ports) {
        const message: PortUpdateMessage = {
          type: "port_added",
          port,
          timestamp: Date.now(),
        };
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
          }
        } catch (error) {
          console.error("Error sending initial port data:", error);
        }
      }
    });
  });

  return wss;
}
