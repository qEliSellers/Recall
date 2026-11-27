import {
  fail,
  json,
  now,
  one,
  rows,
  stmt,
  uid,
  type Database,
  type Statement,
} from "./db";
import type {
  ImportKind,
  ImportResult,
  ImportUnit,
  LibraryImport,
} from "./import-format";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ITEM_BYTES } from "./import-limits";

type Unit = { id: string; name: string };
type Entry = NonNullable<LibraryImport[ImportKind]>[number];
type Routed = {
  entry: Entry;
  label: string;
  unit: Unit;
  encoded: string;
  bytes: number;
  id: string;
};
type Receipt = { hash: string; result: string };
type Existing = { external_id: string; unit_id: string };
const kinds = ["cards", "problems"] as const;
const encoder = new TextEncoder();
const CHUNK_BYTES = 512 * 1024;

function canonical(value: unknown) {
  return JSON.stringify(value, (_key, nested) =>
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? Object.fromEntries(
          Object.keys(nested)
            .sort()
            .map((key) => [key, nested[key]]),
        )
      : nested,
  );
}

async function digest(encoded: Uint8Array<ArrayBuffer>) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function resolveUnit(
  target: Pick<LibraryImport, "unitId" | "unitName">,
  units: Unit[],
  label: string,
) {
  if (target.unitId !== undefined && target.unitName !== undefined)
    fail(400, `${label} has both unitId and unitName. Use one.`);
  if (target.unitId !== undefined) {
    const unit = units.find(({ id }) => id === target.unitId);
    return (
      unit ??
      fail(
        400,
        `${label} uses a unit ID outside this course or one that no longer exists.`,
      )
    );
  }
  if (target.unitName !== undefined) {
    const matches = units.filter(({ name }) => name === target.unitName);
    if (matches.length > 1)
      fail(
        400,
        `${label} uses the name “${target.unitName}”, which matches more than one unit. Use unitId.`,
      );
    return (
      matches[0] ??
      fail(
        400,
        `${label} uses “${target.unitName}”, which is not a unit in this course.`,
      )
    );
  }
}

async function existingItems(
  db: Database,
  kind: ImportKind,
  courseId: string,
  entries: Routed[],
) {
  const externalIds = entries.flatMap(({ entry }) =>
    entry.externalId ? [entry.externalId] : [],
  );
  if (!externalIds.length) return new Map<string, string>();
  const found = await rows<Existing>(
    db,
    `SELECT external_id, unit_id FROM ${kind} WHERE course_id=? AND external_id IN (SELECT value FROM json_each(?))`,
    courseId,
    JSON.stringify(externalIds),
  );
  return new Map(found.map((row) => [row.external_id, row.unit_id]));
}

function appendItems(
  db: Database,
  kind: ImportKind,
  courseId: string,
  time: string,
  items: Routed[],
) {
  const extra =
    kind === "problems" ? ["difficulty", "hint", "solution", "template"] : [];
  const extract = (key: string) => `json_extract(j.value,'$.${key}')`;
  const sql = `INSERT INTO ${kind} (id,course_id,unit_id,external_id,content,skills,position,revision,created_at,updated_at${extra.map((key) => "," + key).join("")})
    SELECT ${extract("id")},?,${extract("unitId")},${extract("externalId")},${extract("content")},${extract("skills")},
      (SELECT COALESCE(MAX(position),-1) + 1 FROM ${kind} WHERE course_id=?) + j.key,
      1,?,?${extra.map((key) => "," + extract(key)).join("")}
    FROM json_each(?) AS j ORDER BY j.key`;
  const statements: Statement[] = [];
  let chunk: string[] = [];
  let bytes = 2;
  const flush = () => {
    statements.push(
      stmt(db, sql, courseId, courseId, time, time, `[${chunk.join(",")}]`),
    );
    chunk = [];
    bytes = 2;
  };
  for (const item of items) {
    if (bytes + item.bytes + 1 > CHUNK_BYTES) flush();
    chunk.push(item.encoded);
    bytes += item.bytes + 1;
  }
  if (chunk.length) flush();
  return statements;
}

export async function importLibrary(
  db: Database,
  user: string,
  input: LibraryImport,
  preview = false,
): Promise<ImportResult> {
  const { courseId, unitId, unitName, cards = [], problems = [] } = input;
  const course =
    (await one<{ is_math: number }>(
      db,
      "SELECT is_math FROM courses WHERE id=? AND user_id=?",
      courseId,
      user,
    )) ?? fail(404, "Course not found");
  if (problems.length && !course.is_math)
    fail(400, "Problem Practice imports require a math course.");

  const normalized = encoder.encode(
    canonical({ courseId, unitId, unitName, cards, problems }),
  );
  if (normalized.byteLength > MAX_IMPORT_BYTES)
    fail(413, "This batch is too large. Split it into files under 8 MiB.");
  const fingerprint = await digest(normalized);
  const batchId = input.batchId ?? `auto-${fingerprint}`;
  async function replay(): Promise<ImportResult | undefined> {
    const old = await one<Receipt>(
      db,
      "SELECT hash,result FROM import_batches WHERE user_id=? AND batch_key=?",
      user,
      batchId,
    );
    if (!old) return;
    if (old.hash !== fingerprint) {
      // Older single-kind receipts hashed the API request with its original key order.
      const kind =
        cards.length && !problems.length
          ? "cards"
          : problems.length && !cards.length
            ? "problems"
            : null;
      if (
        !kind ||
        old.hash !==
          (await digest(
            encoder.encode(
              JSON.stringify({
                kind,
                courseId,
                unitId,
                unitName,
                batchId,
                [kind]: kind === "cards" ? cards : problems,
              }),
            ),
          ))
      )
        fail(
          409,
          "This batch ID was already used for different content or order. Use a new batch ID for a new import.",
        );
    }
    return { ...json<ImportResult>(old.result), replayed: true };
  }
  const previous = await replay();
  if (previous) return previous;

  const units = await rows<Unit>(
    db,
    "SELECT id,name FROM units WHERE course_id=? ORDER BY position,id",
    courseId,
  );
  const defaultUnit = resolveUnit(input, units, "The default unit");
  const routed: Record<ImportKind, Routed[]> = { cards: [], problems: [] };
  const mediaRefs = new Map<string, string>();
  let storageBytes = 0;
  for (const kind of kinds) {
    const seen = new Set<string>();
    const entries = kind === "cards" ? cards : problems;
    for (const [index, entry] of entries.entries()) {
      const { unitId: _id, unitName: _name, ...fields } = entry;
      const label = `${kind === "cards" ? "Card" : "Problem"} ${index + 1}${entry.externalId ? ` (${entry.externalId})` : ""}`;
      const unit =
        resolveUnit(entry, units, label) ??
        defaultUnit ??
        fail(
          400,
          `${label} needs a unit. Choose a default unit or set unitId or unitName on this item.`,
        );
      if (entry.externalId) {
        if (seen.has(entry.externalId))
          fail(400, `${label} repeats an externalId in this batch.`);
        seen.add(entry.externalId);
      }
      const media = entry.content.imageUrl?.match(/^\/api\/media\/(.+)$/)?.[1];
      if (media && !mediaRefs.has(media)) mediaRefs.set(media, label);
      const id = uid();
      const encoded = JSON.stringify({ ...fields, id, unitId: unit.id });
      const bytes = encoder.encode(encoded).byteLength;
      if (bytes > MAX_IMPORT_ITEM_BYTES)
        fail(
          413,
          `${label} exceeds 256 KiB. Shorten the question or its metadata.`,
        );
      storageBytes += bytes + 1;
      routed[kind].push({ entry, label, unit, id, encoded, bytes });
    }
  }
  if (storageBytes > MAX_IMPORT_BYTES)
    fail(413, "The prepared batch exceeds 8 MiB. Split it into smaller files.");
  // Bind a checked file to the resolved IDs even if a unit is renamed before Save.
  const previewKey =
    preview || input.previewKey
      ? await digest(
          encoder.encode(
            JSON.stringify([
              fingerprint,
              routed.cards.map(({ unit }) => unit.id),
              routed.problems.map(({ unit }) => unit.id),
            ]),
          ),
        )
      : undefined;
  if (input.previewKey && input.previewKey !== previewKey)
    fail(
      409,
      "The checked batch or its unit destinations changed. Check the batch again.",
    );
  if (mediaRefs.size) {
    const found = await rows<{ id: string }>(
      db,
      "SELECT id FROM assets WHERE user_id=? AND id IN (SELECT value FROM json_each(?))",
      user,
      JSON.stringify([...mediaRefs.keys()]),
    );
    const available = new Set(found.map((image) => image.id));
    for (const [imageId, label] of mediaRefs)
      if (!available.has(imageId))
        fail(
          400,
          `${label} references an uploaded image that is missing or unavailable to your account.`,
        );
  }

  for (let attempt = 0; ; attempt++) {
    const inserts: Record<ImportKind, Routed[]> = { cards: [], problems: [] };
    const counts = new Map<string, ImportUnit>();
    let skipped = 0;
    for (const kind of kinds) {
      const existing = await existingItems(db, kind, courseId, routed[kind]);
      for (const item of routed[kind]) {
        let unit = counts.get(item.unit.id);
        if (!unit) {
          unit = {
            unitId: item.unit.id,
            unitName: item.unit.name,
            cards: { imported: 0, skipped: 0 },
            problems: { imported: 0, skipped: 0 },
          };
          counts.set(item.unit.id, unit);
        }
        const found =
          item.entry.externalId && existing.get(item.entry.externalId);
        if (found) {
          if (found !== item.unit.id) {
            const existingUnit = units.find((unit) => unit.id === found);
            fail(
              409,
              `${item.label} already belongs to “${existingUnit?.name ?? found}”. Move it in the library or use a different externalId.`,
            );
          }
          unit[kind].skipped++;
          skipped++;
        } else {
          unit[kind].imported++;
          inserts[kind].push(item);
        }
      }
    }
    const ids = kinds.flatMap((kind) => inserts[kind].map(({ id }) => id));
    const result: ImportResult = {
      imported: ids.length,
      skipped,
      ids: preview ? [] : ids,
      batchId,
      ...(preview ? { previewKey } : {}),
      units: units.flatMap(({ id }) =>
        counts.has(id) ? [counts.get(id)!] : [],
      ),
    };
    if (preview) return result;

    const time = now();
    try {
      await db.batch([
        stmt(
          db,
          "INSERT INTO import_batches(id,user_id,batch_key,hash,result,created_at) VALUES(?,?,?,?,?,?)",
          uid(),
          user,
          batchId,
          fingerprint,
          JSON.stringify(result),
          time,
        ),
        ...kinds.flatMap((kind) =>
          appendItems(db, kind, courseId, time, inserts[kind]),
        ),
      ]);
      return result;
    } catch (error) {
      const committed = await replay();
      if (committed) return committed;
      // Another transaction may have saved one of these external IDs after our check.
      const collisions = await Promise.all(
        kinds.map((kind) => existingItems(db, kind, courseId, inserts[kind])),
      );
      if (!collisions.some((ids) => ids.size)) throw error;
      if (attempt >= 2)
        fail(
          409,
          "Another import changed this library. Check the batch again.",
        );
    }
  }
}
