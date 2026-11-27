import { handleApi } from "./api";
import type { Env } from "./env";
import { assets } from "./assets.generated";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname === "/mcp")
      return handleApi(request, env);
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", { status: 405 });
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const asset =
      assets[path] ||
      (!path.split("/").pop()?.includes(".")
        ? assets["/index.html"]
        : undefined);
    if (!asset) return new Response("Not found", { status: 404 });
    const body =
      request.method === "HEAD"
        ? null
        : Uint8Array.from(atob(asset.body), (character) =>
            character.charCodeAt(0),
          );
    return new Response(body, {
      headers: {
        "Content-Type": asset.type,
        "Cache-Control": path.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
      },
    });
  },
};
