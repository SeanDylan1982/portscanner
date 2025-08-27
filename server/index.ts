import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer as createHttpServer } from "http";
import { handleDemo } from "./routes/demo";
import { handleGetPorts, handleKillProcess, handleGetPortDetails } from "./routes/ports";
import { setupWebSocketServer } from "./routes/websocket";

export function createServer() {
  const app = express();
  const server = createHttpServer(app);

  // Setup WebSocket server
  setupWebSocketServer(server);

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Port management API routes
  app.get("/api/ports", handleGetPorts);
  app.get("/api/ports/:port", handleGetPortDetails);
  app.post("/api/ports/kill", handleKillProcess);

  return server;
}
