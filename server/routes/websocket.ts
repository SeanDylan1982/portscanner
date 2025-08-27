import { WebSocket, WebSocketServer } from 'ws';
import { PortInfo, PortUpdateMessage } from '@shared/api';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
 * Parse a single netstat line (simplified version)
 */
function parsePortLine(line: string): PortInfo | null {
  if (!line.trim()) return null;

  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 5) {
      const protocol = parts[0].toLowerCase() as "tcp" | "udp";
      const localAddress = parts[1];
      const state = parts[3];
      const pid = parts[4] ? parseInt(parts[4]) : undefined;

      const [address, portStr] = localAddress.split(':');
      const port = parseInt(portStr);

      if (!isNaN(port)) {
        return {
          port,
          protocol,
          state: state as any,
          pid,
          address: address || '0.0.0.0',
        };
      }
    }
  } else {
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
          return {
            port,
            protocol,
            state: state as any,
            address: address || '0.0.0.0',
          };
        }
      }
    }
  }

  return null;
}

/**
 * Get current ports
 */
async function getCurrentPorts(): Promise<Map<string, PortInfo>> {
  try {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'netstat -ano' : 'netstat -tulpn';
    
    const { stdout } = await execAsync(command);
    const lines = stdout.split('\n').slice(1);
    const portsMap = new Map<string, PortInfo>();

    for (const line of lines) {
      const port = parsePortLine(line);
      if (port) {
        const key = `${port.port}-${port.protocol}-${port.address}`;
        portsMap.set(key, port);
      }
    }

    return portsMap;
  } catch (error) {
    console.error('Error getting current ports:', error);
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
          type: 'port_added',
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
          type: 'port_removed',
          port,
          timestamp,
        };
        broadcastMessage(message);
      }
    }

    // Update the last known state
    portTracker.lastPorts = currentPorts;
  } catch (error) {
    console.error('Error checking for port changes:', error);
  }
}

/**
 * Broadcast message to all connected clients
 */
function broadcastMessage(message: PortUpdateMessage) {
  const messageStr = JSON.stringify(message);
  
  portTracker.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
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

  // Poll for changes every 2 seconds
  portTracker.pollInterval = setInterval(checkForPortChanges, 2000);
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
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket client connected');
    
    // Add client to the set
    portTracker.clients.add(ws);

    // Start monitoring if this is the first client
    if (portTracker.clients.size === 1) {
      startPortMonitoring();
    }

    // Handle client disconnect
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      portTracker.clients.delete(ws);

      // Stop monitoring if no clients left
      if (portTracker.clients.size === 0) {
        stopPortMonitoring();
      }
    });

    // Handle client messages (for future commands)
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received WebSocket message:', message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    // Send initial port state
    getCurrentPorts().then((ports) => {
      for (const [, port] of ports) {
        const message: PortUpdateMessage = {
          type: 'port_added',
          port,
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(message));
      }
    });
  });

  return wss;
}
