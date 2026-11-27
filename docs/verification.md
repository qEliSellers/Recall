# Verification record

- TypeScript: passed.
- Automated tests: **43 passed across 5 files**. Includes question/math validation, imports100→20→35, standard FSRS and atomic retries, quiz300 and scope/retry, archive modes, backup validation, ownership, persistence, and React study flows through the shared HTTP service.
- Production build: passed; self-contained Worker with embedded client assets and locally served fonts.
- Real browser QA: blocked by the managed preview relay and browser sandbox startup error. React component tests run in a simulated DOM; they do not verify visual layout in an actual browser.
- The original private Sites deployment completed successfully. The connected Recall plugin returned the course list. This GitHub copy contains the application source and migration files.

The Worker smoke script exercises the built artifact in workerd with D1/R2 emulation. Run `npm run build && npm run test:worker` to reproduce it. This is separate from browser QA and does not write to a live account.

See [acceptance.md](acceptance.md) for the original targets and [README](../README.md) for bounded mathematical grading, catalog coverage, and backup-size limits.

## Batch importer update

- TypeScript and the production build passed. All 64 tests passed across six files.
- The importer tests cover JSON and quoted CSV, all seven card formats, typed and multiple-choice practice, wrong or changed unit destinations, duplicate handling, concurrent requests, rollback, uploaded-image ownership, and old backups and migrated problem libraries.
- The compiled Worker accepted and replayed a 1,000-item mixed batch in isolated D1 emulation. The test checks every item's unit and position and verifies that the import leaves every card unintroduced.
- A simulated browser test exercised file upload, preview, changing an input after preview, validation errors, and saving. The managed preview relay timed out before a real browser could open.
