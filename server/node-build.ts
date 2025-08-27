import path from "path";
import { createServer } from "./index";
import express from "express";

const server = createServer();
const app = server; // The server now includes the Express app
const port = process.env.PORT || 3000;

// In production, serve the built SPA files
const __dirname = import.meta.dirname;
const distPath = path.join(__dirname, "../spa");

// Serve static files - need to access the Express app from the server
const expressApp = (server as any).app || server;
expressApp.use(express.static(distPath));

// Handle React Router - serve index.html for all non-API routes
expressApp.get("*", (req: any, res: any) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  res.sendFile(path.join(distPath, "index.html"));
});

server.listen(port, () => {
  console.log(`🚀 Port Manager server running on port ${port}`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);
  console.log(`🌐 WebSocket: ws://localhost:${port}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
