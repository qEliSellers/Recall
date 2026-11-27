# Recall — Academic SRS

A private study workspace with gradual card introduction, standard FSRS scheduling, independent practice quizzes, mathematical problem practice, durable media, and a narrow authenticated MCP API. The application starts empty. Synthetic test content is explicitly labeled; there is no AI content generator.

## Run locally

Requires Node.js 24 (the local adapter uses `node:sqlite`) and npm.

```sh
npm ci
RECALL_DEV_USER=local-student npm run dev
```

Open the URL printed by Vite. The opt-in `RECALL_DEV_USER` identity is for standalone local development only and is disabled in a managed Sites environment. Without it, authenticated requests require platform identity. Keep this development server on loopback. Production sign-in is owned by Sites; no credentials are embedded in this repository.

Local data persists in ignored `.local/recall.sqlite`; uploaded media persists in `.local/media/`. The local adapter applies new checked-in SQL migrations at server startup and rejects changed migration files. It uses the same application service, question grading, and scheduling code as the hosted D1 application. Local data is separate from hosted data.

```sh
npm run db:generate  # after a deliberate schema change
npm run build        # client and self-contained Worker
npm run typecheck
npm test
```

`npm start` runs the built Worker with Wrangler's isolated local D1/R2 emulator. Run `npm run db:migrate` first for that emulator; it has a separate data directory and does not simulate sign-in. The all-zero database ID in `wrangler.jsonc` is a local placeholder, not a hosted resource identifier.

## Study workflow

1. Create a custom course or choose a verified Acellus course structure. Add, rename, and reorder units, then choose a midterm boundary.
2. Check and import a JSON batch of cards or math problems into one or more units. Use CSV for single-answer multiple choice. Cards stay unintroduced and preserve their import order within each unit.
3. Introduce the next N cards, or selected cards, when ready. Suspension keeps the existing state and history.
4. Answer scheduled reviews and choose Again, Hard, Good, or Easy. Each final rating atomically saves a standard FSRS transition and one review event.
5. Use Practice Quiz for 1–300 questions, or Problem Practice in math courses. These record performance without updating FSRS schedules.

The maintained `ts-fsrs` dependency supplies the scheduling algorithm. The lockfile pins the tested version; version 6 uses FSRS-7. Default desired retention is 90%; archived relaxed mode defaults to 80%. Changing retention or archiving affects future reviews without rewriting all due dates. Paused archives preserve state and stop scheduled presentation.

## Project map

| Location                           | Responsibility                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/`                             | Responsive React interface, KaTeX rendering, content management, study and statistics                   |
| `lib/service.ts`                   | Shared authorization, validated actions, imports, sessions, scheduling transactions, analytics, backups |
| `lib/questions.ts`, `lib/types.ts` | Validated content, randomized opaque presentations, component grading                                   |
| `lib/math.ts`                      | Bounded numeric and algebraic equivalence checks                                                        |
| `lib/scheduling.ts`                | Standard `ts-fsrs` adapter                                                                              |
| `db/schema.ts`, `drizzle/`         | Schema and immutable generated SQL/metadata migrations                                                  |
| `worker/`                          | Authenticated browser API, MCP API, private media, complete backup routes                               |
| `scripts/local-env.ts`             | Durable standalone SQLite/media development adapter                                                     |
| `scripts/build.mjs`                | Vite client build and self-contained Cloudflare Worker bundle                                           |
| `tests/`                           | Question, math, workflow, authorization, persistence and backup tests                                   |

Read [content import format](docs/import-format.md), [curriculum provenance](docs/curriculum.md), [deployment](docs/deployment.md), [MCP integration](docs/integration.md), and [verification](docs/verification.md). The [acceptance checklist](docs/acceptance.md) records the original test targets; the verification report distinguishes tests actually run from remaining checks.

## Limits

- Automatic algebra grading supports a deliberately bounded exact polynomial/rational-coefficient domain. Unsupported expressions use manual self-grading. The app does not claim arbitrary mathematical equivalence.
- Duplicate option IDs and normalized text are rejected; semantic ambiguity still requires content review.
- Imported HTTPS image URLs remain external dependencies. Upload images for durable storage and inclusion in backups.
- Browser backup/restore supports up to 32 MB, including embedded media; each image is limited to 5 MB. Larger libraries require an administrator D1/R2 export.
- Problem templates store reusable author metadata and values; there is no procedural generator or AI tutor.
- Published course structures are snapshots with recorded provenance. Unverified unit lists remain empty and can be entered manually.
- Estimated FSRS retrievability and observed quiz accuracy are separate measures; recognition questions and additional practice affect interpretation.

Deployment versions are not database backups. Export your data from Settings before making substantial content changes or replacing a library.
