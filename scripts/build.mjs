import { build as viteBuild } from "vite";
import { build } from "esbuild";
import { mkdir, readFile, readdir, writeFile, cp } from "node:fs/promises";
import path from "node:path";

await viteBuild();
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};
const assets = {};
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(filename);
    else {
      const url =
        "/" + path.relative("dist/client", filename).split(path.sep).join("/");
      assets[url] = {
        type: types[path.extname(filename)] || "application/octet-stream",
        body: (await readFile(filename)).toString("base64"),
      };
    }
  }
}
await scan("dist/client");
await writeFile(
  "worker/assets.generated.ts",
  `export const assets: Record<string,{type:string;body:string}> = ${JSON.stringify(assets)};\n`,
);
await mkdir("dist/server", { recursive: true });
await build({
  entryPoints: ["worker/index.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  minify: true,
  sourcemap: false,
  platform: "browser",
  target: "es2022",
  format: "esm",
  conditions: ["worker", "browser"],
  external: ["cloudflare:workers", "node:*"],
  logLevel: "info",
});
await mkdir("dist/.openai", { recursive: true });
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
await cp("drizzle", "dist/drizzle", { recursive: true });
console.log(
  "Built self-contained Worker, static assets, and database migrations.",
);
