# Private ChatGPT / MCP integration

The Site exposes a stateless authenticated JSON-RPC endpoint at `/mcp`. It implements `server/discover`, `initialize`, `tools/list`, `tools/call`, and `ping`. Both the browser API and MCP call the same `lib/service.ts` actions against the same bound database; there is one scheduler and one data model.

| Tool                                  | Operation                                                       |
| ------------------------------------- | --------------------------------------------------------------- |
| `list_courses`                        | Active or archived courses and progress                         |
| `list_units`                          | Ordered units, counts, and introduction progress                |
| `search_cards`, `get_card`            | Owned content definitions and current scheduling state          |
| `list_problems`, `get_problem`        | Paginated mathematical problem definitions                      |
| `review_history`                      | Paginated persisted FSRS events                                 |
| `quiz_results`, `get_session_results` | Saved sessions, answers, and results subject to feedback timing |
| `performance_statistics`              | Separate scheduled/practice performance, trends, and weak areas |
| `import_cards`                        | Validated idempotent batch import; no automatic scheduling      |
| `update_card`                         | Content edits; scheduling reset only when explicitly confirmed  |
| `set_card_status`                     | Suspend/reactivate introduced cards without discarding history  |
| `introduce_cards`                     | Explicit introduction by unit and count or selection            |
| `course_settings`                     | Course name, midterm, retention and archival preferences        |

Schemas are generated directly from the service validators. There is no SQL execution tool, arbitrary action dispatcher, unrestricted database credential, or integration-specific scheduler. Every operation uses the Site-scoped authenticated user ID and verifies ownership. The authoring tools expose answer definitions because content editing requires them; study session presentations omit answer keys until submission.

## Connect

Publishing with the `mcp` capability provisions a private associated Site plugin. Use that plugin; no separate custom App or local MCP server is needed. If it is not installed automatically, open Plugins → Personal → Created by you and install/connect the Site plugin. A new chat may be needed for newly connected tools to appear.

An actual authenticated plugin call is required before claiming that ChatGPT is connected. Automated HTTP/MCP tests demonstrate validation, ownership isolation, and shared persistence, but do not establish installation or OAuth connection in a user's ChatGPT account. See [verification](verification.md) for the observed publication and connection status.

## Example import arguments

Call `list_courses` and `list_units` to obtain owned IDs, then pass the documented `cards.import` input directly to `import_cards`. Keep the same `batchId` and payload when retrying a request. Reusing a batch ID with changed content is a conflict; existing external IDs are skipped, not overwritten. Read [the import schema](import-format.md) for supported content types and limits.

Use `performance_statistics` with `courseId`, `unitId`, `skill`, `type`, and `days` to obtain filtered results. Scheduled-review success and estimated retrievability must not be described as quiz accuracy, and quiz results must not be treated as FSRS review events.
