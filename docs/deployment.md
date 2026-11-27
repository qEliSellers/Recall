# Deployment and operation

Recall is a React/Vite application with a Cloudflare Worker, D1 database, and R2 bucket. The Sites starter helpers were not present in the execution environment, so the repository includes an equivalent standalone build and local development adapter. No database is created or altered inside an application request.

## Sites

The GitHub copy includes a portable `.openai/hosting.json` with the logical `DB` and `BUCKET` bindings and the `mcp` capability. For a Sites deployment, register your Site and set `project_id` in your deployment checkout to the ID Sites returns.

1. Install the pinned dependencies with `npm ci`.
2. After changing `db/schema.ts`, run `npm run db:generate`. Inspect and commit generated SQL and Drizzle metadata; never edit an applied migration.
3. Run `npm run build`. The result includes `dist/server/index.js`, client assets embedded in that Worker, a hosting manifest, and migration files.
4. Run `npm run typecheck` and `npm test`.
5. Push the exact source commit to the Site's source repository using a short-lived repository credential. Keep credentials out of source, shell arguments, logs, and files.
6. Package the generated deployment output and publish that same commit through the native Sites private-deployment workflow. Sites provisions the declared D1/R2 bindings and applies pending hosted migrations before uploading the Worker.
7. Check the returned deployment status until it is terminal. Preserve owner-only access. Verify an authenticated browser session and the private MCP plugin after publication.

The managed development preview uses `sites-preview start /absolute/checkout` and the exact returned URL. Its daemon owns the server. Stop it with `sites-preview stop` when QA is finished. Managed previews require real platform identity and never use `RECALL_DEV_USER`.

## Authentication and isolation

The hosted application trusts identity headers added by Sites dispatch after authentication and access checks. All API and MCP operations require `oai-authenticated-user-id`, then enforce record ownership in the shared service. Direct access to an unprotected Worker origin is not a supported deployment. Do not expose a bare Worker that accepts caller-supplied identity headers without a trusted authentication layer.

Sign-in and sign-out use Sites' reserved top-level navigation routes. Database/R2 credentials are platform bindings and are never sent to the browser. Browser writes reject cross-origin requests. Uploads accept validated PNG/JPEG/GIF/WebP content only; SVG is intentionally unsupported.

## Backups and recovery

Settings → Export backup returns a versioned JSON file with owned courses, units, cards, problem definitions, FSRS state, review events, session snapshots and responses, problem attempts, import records, preferences, and uploaded image bytes. Restore requires an explicit confirmation because it replaces the current user's library.

The restore process validates relationships and media, uploads new uniquely named objects, then replaces relational records in one database transaction. If the transaction fails, previous records and images remain intact and staged objects are removed. Old images are removed only after commit. An interrupted cleanup may leave unused objects, never overwrite a previously referenced object.

Externally hosted image URLs are preserved as references; their bytes are not downloaded into backups. The browser backup size limit is 32 MB. For larger data, use the database/object-store administrator export path and preserve both stores together.

Local development data and hosted production data are separate. Source-control history and Site deployment rollback do not restore database content. Test a backup restore before depending on it for migration to another environment.
