import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import http from "node:http";
// PORT is only required for the dev/preview server — the production build
// generates static files and never needs to bind to a port.
const isBuild = process.env.NODE_ENV === "production";

const rawPort = process.env.PORT;
if (!rawPort && !isBuild) {
  throw new Error("PORT environment variable is required but was not provided.");
}
const port = rawPort ? Number(rawPort) : 5173;
if (!isBuild && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

const buildId = new Date().toISOString().slice(5, 16).replace("T", " ");

export default defineConfig({
  base: basePath,
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    tailwindcss(),
    // Expo Go proxy: forward Expo-specific requests to the Mobile dev server.
    // expo.picard.replit.dev routes to this Marketplace service (port 5173)
    // because Marketplace owns the root path "/". We detect Expo Go requests
    // by their headers and proxy them to the Mobile proxy on port 18115.
    ...(!isBuild
      ? [
          {
            name: "expo-go-proxy",
            configureServer(server: { middlewares: { use: (fn: (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void) => void } }) {
              server.middlewares.use((req, res, next) => {
                const headers = req.headers as Record<string, string | string[] | undefined>;
                const accept = (headers["accept"] ?? "") as string;
                const url = req.url ?? "";

                const isExpo =
                  !!headers["expo-platform"] ||
                  !!headers["expo-sdk-version"] ||
                  !!headers["expo-runtime-version"] ||
                  accept.includes("expo+json") ||
                  url.startsWith("/artifacts/mobile/") ||
                  url.startsWith("/_expo/");

                if (!isExpo) {
                  next();
                  return;
                }

                console.log(`[expo-proxy] → 18115 ${req.method} ${url.slice(0, 80)}`);

                const proxyReq = http.request(
                  {
                    hostname: "localhost",
                    port: 18115,
                    path: url,
                    method: req.method,
                    headers: { ...headers, host: "localhost:18115" },
                  },
                  (proxyRes) => {
                    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers as Record<string, string>);
                    proxyRes.pipe(res, { end: true });
                  }
                );

                proxyReq.on("error", (err) => {
                  console.error("[expo-proxy] error:", err.message);
                  res.writeHead(502);
                  res.end("Mobile service unavailable");
                });

                req.pipe(proxyReq, { end: true });
              });
            },
          },
        ]
      : []),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: false,
    target: "es2020",
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Conservative two-bucket vendor split:
        //   • vendor-react — react + react-dom + scheduler only (leaf deps)
        //   • vendor       — every other node_modules dependency
        //
        // The previous fine-grained split (vendor-ui / vendor-misc / etc.)
        // produced circular ES chunks ("vendor-react -> vendor-ui ->
        // vendor-react"). Circular chunks evaluate one of their imports as
        // `undefined` at runtime due to ESM temporal-dead-zone, which
        // crashed the entry bundle before React could mount — the user saw
        // the static skeleton forever. Two non-overlapping chunks make
        // cycles impossible.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
          ) {
            return "vendor-react";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
