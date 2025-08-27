/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

/**
 * Port information interface
 */
export interface PortInfo {
  port: number;
  protocol: "tcp" | "udp";
  state:
    | "LISTENING"
    | "ESTABLISHED"
    | "TIME_WAIT"
    | "CLOSE_WAIT"
    | "SYN_SENT"
    | "SYN_RECV"
    | "FIN_WAIT1"
    | "FIN_WAIT2"
    | "LAST_ACK"
    | "CLOSED";
  pid?: number;
  processName?: string;
  address: string;
  foreignAddress?: string;
  processPath?: string;
  uptime?: number;
}

/**
 * Response type for listing ports
 */
export interface PortsResponse {
  ports: PortInfo[];
  timestamp: number;
}

/**
 * Request type for killing a process
 */
export interface KillProcessRequest {
  pid: number;
  port: number;
}

/**
 * Response type for process operations
 */
export interface ProcessOperationResponse {
  success: boolean;
  message: string;
  port?: number;
  pid?: number;
}

/**
 * WebSocket message types for real-time updates
 */
export interface PortUpdateMessage {
  type: "port_added" | "port_removed" | "port_changed";
  port: PortInfo;
  timestamp: number;
}

/**
 * Port filter options
 */
export interface PortFilter {
  protocol?: "tcp" | "udp" | "all";
  state?: string;
  portRange?: { min: number; max: number };
}
