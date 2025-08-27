import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createServer } from "./server";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    fs: {
      allow: ["./client", "./shared"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    outDir: "dist/spa",
  },
  plugins: [react(), expressPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}));

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve", // Only apply during development (serve mode)
    configureServer(viteServer) {
      const httpServer = createServer();

      // Extract the Express app from the HTTP server
      const expressApp = (httpServer as any).app || httpServer;

      // Add Express app as middleware to Vite dev server
      viteServer.middlewares.use(expressApp);

      // Handle WebSocket upgrade on the Vite server
      const originalServer = viteServer.httpServer;
      if (originalServer) {
        originalServer.on('upgrade', (request, socket, head) => {
          if (request.url?.startsWith('/')) {
            // Forward WebSocket upgrades to our HTTP server
            (httpServer as any).emit('upgrade', request, socket, head);
          }
        });
      }
    },
  };
}
