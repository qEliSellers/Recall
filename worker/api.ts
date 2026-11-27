import { z } from "zod";
import { one, rows, run, ServiceError, uid } from "../lib/db";
import { execute } from "../lib/service";
import { HttpError, identity, jsonResponse, readBody, readJson } from "./env";
import type { Env } from "./env";
import { handleMcp } from "./mcp";

const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_BACKUP = 32 * 1024 * 1024;
const mimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const idSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/);
type AssetRow = {
  id: string;
  user_id: string;
  key: string;
  content_type: string;
  name: string;
  bytes: number;
  created_at: string;
};

function validImage(bytes: Uint8Array, type: string) {
  const ascii = (offset: number, count: number) =>
    new TextDecoder().decode(bytes.slice(offset, offset + count));
  if (type === "image/png")
    return (
      bytes.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
    );
  if (type === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    );
  if (type === "image/webp")
    return (
      bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP"
    );
  if (type === "image/gif") return ["GIF87a", "GIF89a"].includes(ascii(0, 6));
  return false;
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

async function exportBackup(env: Env, userId: string) {
  const backup = (await execute(env.DB, userId, "backup.export", {})) as any;
  const assets = await rows<AssetRow>(
    env.DB,
    "SELECT * FROM assets WHERE user_id = ?",
    userId,
  );
  const media: { id: string; data: string }[] = [];
  let length = JSON.stringify(backup).length;
  for (const asset of assets) {
    const object = await env.BUCKET.get(asset.key);
    if (!object)
      throw new HttpError(
        409,
        `Uploaded image ${asset.name} is missing; restore it before exporting a complete backup.`,
      );
    const data = toBase64(await object.arrayBuffer());
    length += data.length;
    if (length > MAX_BACKUP - 65536)
      throw new HttpError(
        413,
        "This backup exceeds the 32 MB browser backup limit. Use an administrator database and object-storage export.",
      );
    media.push({ id: asset.id, data });
  }
  return jsonResponse({ ...backup, media }, 200, {
    "Content-Disposition": `attachment; filename="recall-backup-${new Date().toISOString().slice(0, 10)}.json"`,
  });
}

async function restoreBackup(env: Env, userId: string, payload: unknown) {
  const { backup } = z
    .object({
      confirm: z.literal(true),
      backup: z
        .object({
          format: z.literal("recall-academy"),
          version: z.literal(1),
          exportedAt: z.string(),
          tables: z.record(
            z.string(),
            z.array(z.record(z.string(), z.unknown())),
          ),
          media: z
            .array(
              z
                .object({ id: idSchema, data: z.string().max(MAX_IMAGE * 1.4) })
                .strict(),
            )
            .max(1000),
        })
        .strict(),
    })
    .strict()
    .parse(payload);
  const assetRows = z
    .array(
      z
        .object({
          id: idSchema,
          user_id: z.string(),
          key: z.string(),
          content_type: z.string().refine((value) => mimeTypes.has(value)),
          name: z.string().max(255),
          bytes: z.number().int().min(1).max(MAX_IMAGE),
          created_at: z.string(),
        })
        .strict(),
    )
    .parse(backup.tables.assets ?? []);
  const map = new Map(backup.media.map((entry) => [entry.id, entry.data]));
  if (
    map.size !== backup.media.length ||
    map.size !== assetRows.length ||
    new Set(assetRows.map((asset) => asset.id)).size !== assetRows.length
  )
    throw new HttpError(
      400,
      "Backup images must match the asset records exactly.",
    );
  const staged: string[] = [];
  const oldAssets = await rows<AssetRow>(
    env.DB,
    "SELECT * FROM assets WHERE user_id = ?",
    userId,
  );
  try {
    for (const asset of assetRows) {
      const base64 = map.get(asset.id);
      if (
        !base64 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
        base64.length % 4 !== 0
      )
        throw new HttpError(
          400,
          "An image in the backup is missing or invalid.",
        );
      let binary: string;
      try {
        binary = atob(base64);
      } catch {
        throw new HttpError(400, "An image in the backup is invalid.");
      }
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      if (
        bytes.length !== asset.bytes ||
        !validImage(bytes, asset.content_type)
      )
        throw new HttpError(400, `Invalid image content for ${asset.name}.`);
      // Stage new immutable objects. A database rollback can never damage the old images.
      const key = `users/${userId}/${uid()}`;
      await env.BUCKET.put(key, bytes, {
        httpMetadata: { contentType: asset.content_type },
      });
      staged.push(key);
      asset.key = key;
      asset.user_id = userId;
    }
    const { media: _media, ...databaseBackup } = backup;
    databaseBackup.tables.assets = assetRows;
    const result = await execute(env.DB, userId, "backup.restore", {
      backup: databaseBackup,
      confirm: true,
    });
    // Old objects are garbage only after the transaction commits. Cleanup failure does not fail restore.
    await Promise.allSettled(
      oldAssets.map((asset) => env.BUCKET.delete(asset.key)),
    );
    return jsonResponse({ data: result });
  } catch (error) {
    await Promise.allSettled(staged.map((key) => env.BUCKET.delete(key)));
    throw error;
  }
}

/** Shared by the production Worker and the local Vite development adapter. */
export async function handleApi(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    // Browsers may mutate only from this origin. MCP uses authenticated non-browser requests.
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = request.headers.get("origin");
      const forwardedHost = request.headers.get("x-forwarded-host");
      const allowedOrigin = forwardedHost
        ? `https://${forwardedHost}`
        : url.origin;
      if (
        request.headers.get("sec-fetch-site") === "cross-site" ||
        (origin && origin !== url.origin && origin !== allowedOrigin)
      )
        throw new HttpError(403, "Cross-origin writes are not allowed.");
    }
    if (url.pathname === "/mcp") return await handleMcp(request, env);
    const user = identity(request);
    if (!user)
      return jsonResponse(
        { error: "Sign in with ChatGPT to access your study library." },
        401,
      );
    if (url.pathname === "/api/me" && request.method === "GET")
      return jsonResponse({ data: user });
    if (url.pathname === "/api/action" && request.method === "POST") {
      const body = z
        .object({
          action: z.string().min(1).max(100),
          input: z.unknown().optional(),
        })
        .strict()
        .parse(await readJson(request));
      // Backup routes validate and preserve stored image bytes as well as relational data.
      if (body.action.startsWith("backup."))
        throw new HttpError(400, "Use the complete backup endpoint.");
      return jsonResponse({
        data: await execute(env.DB, user.id, body.action, body.input ?? {}),
      });
    }
    if (url.pathname === "/api/assets" && request.method === "POST") {
      if (
        !request.headers.get("content-type")?.startsWith("multipart/form-data;")
      )
        throw new HttpError(415, "Upload an image using multipart/form-data.");
      const body = await readBody(request, MAX_IMAGE + 16384);
      const data = await new Response(body, {
        headers: { "Content-Type": request.headers.get("content-type")! },
      }).formData();
      const file = data.get("file");
      if (!file || typeof file === "string")
        throw new HttpError(400, "Choose an image file.");
      if (!mimeTypes.has(file.type) || file.size < 1 || file.size > MAX_IMAGE)
        throw new HttpError(
          400,
          "Use a PNG, JPEG, GIF, or WebP image up to 5 MB.",
        );
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!validImage(bytes, file.type))
        throw new HttpError(400, "The file does not match its image type.");
      const id = uid();
      const key = `users/${user.id}/${id}`;
      await env.BUCKET.put(key, bytes, {
        httpMetadata: { contentType: file.type },
      });
      try {
        await run(
          env.DB,
          "INSERT INTO assets (id,user_id,key,content_type,name,bytes,created_at) VALUES (?,?,?,?,?,?,?)",
          id,
          user.id,
          key,
          file.type,
          file.name.slice(0, 255),
          bytes.length,
          new Date().toISOString(),
        );
      } catch (error) {
        await env.BUCKET.delete(key);
        throw error;
      }
      return jsonResponse({ data: { id, url: `/api/media/${id}` } }, 201);
    }
    const media = url.pathname.match(
      /^\/api\/(?:media|assets)\/([A-Za-z0-9_.-]{1,100})$/,
    );
    if (media && ["GET", "HEAD"].includes(request.method)) {
      const asset = await one<AssetRow>(
        env.DB,
        "SELECT * FROM assets WHERE id = ? AND user_id = ?",
        media[1],
        user.id,
      );
      if (!asset) throw new HttpError(404, "Image not found.");
      const object = await env.BUCKET.get(asset.key);
      if (!object) throw new HttpError(404, "Image not found.");
      return new Response(request.method === "HEAD" ? null : object.body, {
        headers: {
          "Content-Type": asset.content_type,
          "Content-Length": String(asset.bytes),
          "Cache-Control": "private, max-age=86400",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }
    if (url.pathname === "/api/backup" && request.method === "GET")
      return await exportBackup(env, user.id);
    if (url.pathname === "/api/backup" && request.method === "POST")
      return await restoreBackup(
        env,
        user.id,
        await readJson(request, MAX_BACKUP),
      );
    return jsonResponse({ error: "Endpoint not found." }, 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return jsonResponse(
        {
          error: error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        },
        400,
      );
    if (error instanceof HttpError || error instanceof ServiceError)
      return jsonResponse({ error: error.message }, error.status);
    console.error(
      "Request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return jsonResponse(
      {
        error:
          "The request could not be completed. Your previous data has been preserved.",
      },
      500,
    );
  }
}
