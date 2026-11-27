import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { Readable } from "node:stream";
import { localEnvironment } from "./scripts/local-env.ts";

function localApi(): Plugin {
  return {
    name: "recall-local-api",
    apply: "serve",
    async configureServer(server) {
      const env = await localEnvironment();
      server.httpServer?.once("close", () => env.close());
      server.middlewares.use(async (incoming, outgoing, next) => {
        if (
          !incoming.url?.startsWith("/api/") &&
          incoming.url?.split("?")[0] !== "/mcp"
        )
          return next();
        try {
          const headers = new Headers();
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (Array.isArray(value))
              value.forEach((part) => headers.append(key, part));
            else if (value !== undefined) headers.set(key, value);
          }
          // Standalone development is opt-in. Managed previews use real platform identity.
          if (
            process.env.SITES_MANAGED_LINUX_CONTAINER !== "1" &&
            process.env.RECALL_DEV_USER
          ) {
            headers.set(
              "oai-authenticated-user-id",
              process.env.RECALL_DEV_USER,
            );
            headers.set("oai-authenticated-user-full-name", "Local student");
          }
          const protocol = headers.get("x-forwarded-proto") || "http";
          const host =
            headers.get("x-forwarded-host") ||
            headers.get("host") ||
            "localhost:5173";
          const init: RequestInit & { duplex?: string } = {
            method: incoming.method,
            headers,
          };
          if (!["GET", "HEAD"].includes(incoming.method || "GET")) {
            init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
            init.duplex = "half";
          }
          const { handleApi } = await server.ssrLoadModule("/worker/api.ts");
          const response: Response = await handleApi(
            new Request(`${protocol}://${host}${incoming.url}`, init),
            env,
          );
          outgoing.statusCode = response.status;
          response.headers.forEach((value, key) =>
            outgoing.setHeader(key, value),
          );
          outgoing.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          server.config.logger.error(String(error));
          outgoing.statusCode = 500;
          outgoing.end("Local request failed.");
        }
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), localApi()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1100,
  },
  server: { host: "127.0.0.1", allowedHosts: true },
});
