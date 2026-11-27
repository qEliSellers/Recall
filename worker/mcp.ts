import { z } from "zod";
import { actionSchemas, execute } from "../lib/service";
import { HttpError, identity, jsonResponse, readJson } from "./env";
import type { Env } from "./env";

// An explicit allowlist. There is deliberately no arbitrary SQL or general action tool.
const operations = [
  [
    "list_courses",
    "courses.list",
    "List your active or archived courses and their introduction progress.",
    true,
  ],
  [
    "list_units",
    "units.list",
    "List ordered units, card counts, and introduction progress for one course.",
    true,
  ],
  [
    "search_cards",
    "cards.list",
    "Search your card library with course, unit, status, skill, and question-type filters. Results are paginated.",
    true,
  ],
  [
    "get_card",
    "cards.get",
    "Retrieve one owned card definition and its schedule.",
    true,
  ],
  [
    "list_problems",
    "problems.list",
    "Retrieve paginated mathematical problem definitions.",
    true,
  ],
  [
    "get_problem",
    "problems.get",
    "Retrieve one owned mathematical problem definition, hints, and worked solution.",
    true,
  ],
  [
    "review_history",
    "history.reviews",
    "Retrieve paginated scheduled-review events.",
    true,
  ],
  [
    "quiz_results",
    "sessions.list",
    "List saved study sessions and practice results.",
    true,
  ],
  [
    "get_session_results",
    "sessions.get",
    "Retrieve an owned session. Answers are shown only after submission or at quiz completion.",
    true,
  ],
  [
    "performance_statistics",
    "analytics",
    "Retrieve separate FSRS and practice statistics, trends, and weak areas.",
    true,
  ],
  [
    "import_cards",
    "cards.import",
    "Import a validated batch of cards. Stable batch and external IDs prevent duplicates. Imported cards remain unintroduced.",
    false,
  ],
  [
    "update_card",
    "cards.update",
    "Edit an owned card while preserving scheduling and historical snapshots unless an explicit confirmed reset is requested.",
    false,
  ],
  [
    "set_card_status",
    "cards.status",
    "Suspend or reactivate owned cards while preserving their scheduling history.",
    false,
  ],
  [
    "introduce_cards",
    "cards.introduce",
    "Explicitly introduce selected cards or the next N cards from one unit. Does not fabricate completed reviews.",
    false,
  ],
  [
    "course_settings",
    "courses.update",
    "Update an owned course, its midterm boundary, or FSRS and archive settings.",
    false,
  ],
] as const;

export function mcpTools() {
  return operations
    .filter(([, action]) => action in actionSchemas)
    .map(([name, action, description, readOnly]) => ({
      name,
      description,
      inputSchema: z.toJSONSchema(
        (actionSchemas as Record<string, z.ZodType>)[action],
        { unrepresentable: "any", io: "input" },
      ),
      annotations: {
        readOnlyHint: readOnly,
        destructiveHint: !readOnly,
        openWorldHint: false,
      },
    }));
}

export async function handleMcp(request: Request, env: Env) {
  if (request.method !== "POST")
    return jsonResponse({ error: "Use POST for MCP." }, 405, { Allow: "POST" });
  const user = identity(request);
  if (!user) return jsonResponse({ error: "Authentication required." }, 401);
  const body = await readJson(request);
  const id = body?.id ?? null;
  const ok = (result: unknown) => jsonResponse({ jsonrpc: "2.0", id, result });
  const error = (code: number, message: string) =>
    jsonResponse({ jsonrpc: "2.0", id, error: { code, message } });
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string")
    return error(-32600, "Invalid JSON-RPC request.");
  if (body.method === "notifications/initialized")
    return new Response(null, { status: 202 });
  if (body.method === "server/discover")
    return ok({
      supportedVersions: ["2026-07-28", "2025-03-26"],
      capabilities: { tools: {} },
      serverInfo: { name: "Recall Academic SRS", version: "1.0.0" },
    });
  if (body.method === "initialize")
    return ok({
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "Recall Academic SRS", version: "1.0.0" },
    });
  if (body.method === "ping") return ok({});
  if (body.method === "tools/list") return ok({ tools: mcpTools() });
  if (body.method !== "tools/call") return error(-32601, "Method not found.");
  const operation = operations.find(([name]) => name === body.params?.name);
  if (!operation) return error(-32602, "Unknown tool.");
  try {
    const data = await execute(
      env.DB,
      user.id,
      operation[1],
      body.params.arguments ?? {},
    );
    return ok({
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { data },
      isError: false,
    });
  } catch (cause) {
    const message =
      cause instanceof z.ZodError
        ? cause.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")
        : cause instanceof Error &&
            ("status" in cause || cause instanceof HttpError)
          ? cause.message
          : "The operation could not be completed.";
    return ok({ content: [{ type: "text", text: message }], isError: true });
  }
}
