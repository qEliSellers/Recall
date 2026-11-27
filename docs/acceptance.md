# Acceptance checklist

This is a verification inventory derived from the supplied product requirements. An unchecked item means **not yet recorded as verified here**, not necessarily unimplemented. Test reports must distinguish automated service tests, browser checks, and a live authenticated ChatGPT plugin connection. Do not mark a workflow complete merely because the app builds.

## Courses and curriculum

- [ ] Create a custom course, then add, rename, and reorder units; order persists after reload.
- [ ] Create a course from the Acellus catalog; show provenance and the snapshot verification date.
- [ ] Import only verified published unit headings; courses without a verified sequence allow manual setup.
- [ ] Configure a midterm boundary other than the halfway point. Entire-course scope includes every unit; unit scope includes exactly one; midterm scope respects the configured boundary.
- [ ] Scope changes neither duplicate cards nor reset their scheduling.
- [ ] Course settings and histories remain associated with the correct course.

## Content import and introduction

- [ ] Import 100 cards into a unit. All 100 remain unintroduced; there are zero completed reviews and zero learned intervals.
- [ ] Introduce the next 20 in stored order: 20 active, 80 unintroduced. Introduce another 15: 35 active, 65 unintroduced; the first 20 retain their states.
- [ ] Introduce a manually selected subset and introduce cards independently in a second unit.
- [ ] Reject zero, negative, noninteger, and excessive introduction counts.
- [ ] Suspend and reactivate a reviewed card without losing FSRS history or state.
- [ ] JSON import accepts documented formats, reports validation errors, and prevents import-ID conflicts or duplicate retries.
- [ ] CSV import, if offered, works for its documented subset and reports malformed rows.
- [ ] Search/filter by course, unit, introduction status, question type, and skill.
- [ ] Edit wording, choices, and explanation without silently resetting history. A change of knowledge target requires an explicit scheduling reset choice.
- [ ] Editing a card does not rewrite old attempts: content revision, displayed variant, and option order remain recoverable.

## FSRS and scheduled reviews

- [ ] Use the actual maintained `ts-fsrs` API for all Again/Hard/Good/Easy scheduling.
- [ ] Default active retention is 90%; maximum interval and desired retention are configurable. No custom urgency, streak, or response-speed multipliers exist.
- [ ] Introduced cards enter the queue as new cards without fabricated review events.
- [ ] Answer a new card correctly; persist the standard FSRS result and next due date.
- [ ] Advance a card into the **Review** state, then answer incorrectly and verify standard **Relearning** behavior. An incorrect new/learning answer is not required to enter Relearning.
- [ ] Review two cards and verify their schedules remain independent.
- [ ] Correctness defaults to Good/Again, with a fast explicit rating override.
- [ ] Deliberate early review is supported and logged distinctly where applicable.
- [ ] A duplicate submission, refresh retry, or concurrent stale answer cannot create duplicate review events or inconsistent schedule state.
- [ ] Schedule and event writes are atomic; a forced write failure leaves neither half committed.
- [ ] Due/new filtering handles UTC persistence, the study timezone, and learning/relearning deadlines correctly.
- [ ] Missed cards return through the ordinary learning/relearning schedule.

## Question engine

- [ ] Single-answer multiple choice and choice-based cloze grade correctly.
- [ ] Multiple select requires the complete correct set, without extra selections.
- [ ] Matching records each pair's result and one overall card result.
- [ ] Sequencing records order correctness and useful component results.
- [ ] True/false works; typed response is optional, never the default academic format.
- [ ] Phased cloze initially hides all blanks, reveals only completed phases, records per-blank results, and produces one FSRS event for the entire card.
- [ ] Independently imported cloze cards have separate stable identifiers and schedules.
- [ ] Alternate wording variants share one schedule; history records the variant shown.
- [ ] Option order randomizes and distractor pools select a valid subset; duplicate option IDs/text are rejected.
- [ ] Pre-submission study responses do not expose correct-answer IDs, answer keys, explanations, or later phased-cloze answers.
- [ ] Uploaded images persist across restart and display in questions. Math notation renders safely.
- [ ] Content review remains responsible for semantic ambiguity and inadvertent answer clues; the validator does not claim to prove these absent.

## Practice quizzes

- [ ] Create 1-question and 300-question sessions when sufficient material exists. Reject 0, 301, fractions, and malformed counts.
- [ ] Respect the actual available pool and never silently duplicate questions to reach a requested count.
- [ ] Entire-course, unit, and midterm scope produce the expected pool.
- [ ] Random, balanced-by-unit, and weak-first selection each work.
- [ ] Default pool contains introduced cards. Including unintroduced cards does not activate them.
- [ ] Immediate feedback reveals each submitted result; end-only feedback does not reveal answers until completion.
- [ ] Persist presented questions, answers, component errors, timings, course/unit/skill associations, and selection settings.
- [ ] Results show overall score, breakdowns, explanations, and missed questions. Retry missed questions starts a valid new practice session.
- [ ] Scheduled states and FSRS events are byte-for-byte unchanged by practice, including retries.

## Math practice

- [ ] Math course navigation exposes Concept Review and Problem Practice separately.
- [ ] Problems support unit/skill/difficulty, hints, and worked solutions after answering.
- [ ] Random and weak-skill selection work; missed-problem retry retains attempt history.
- [ ] Integers, decimals, equivalent fractions, supported simple expressions, and configured tolerances grade correctly.
- [ ] Invalid/unsupported expressions cannot execute code and produce a clear error or manual self-grading path.
- [ ] Automatic grading states its supported mathematical scope and does not claim universal algebraic proof.
- [ ] Problem attempts affect skill analytics but do not modify FSRS schedules.
- [ ] Data model can preserve reusable template metadata and instantiated variable values.
- [ ] There is no AI content generator or tutor dependency.

## Archiving

- [ ] Archive a course: remove it from active listings and active due totals while retaining its entire structure, cards, schedules, and histories.
- [ ] Archived courses have a separate view and can be studied on demand.
- [ ] Relaxed mode defaults to 80% retention through FSRS itself; normal mode uses the normal target.
- [ ] Retention changes apply to future reviews; archiving does not mass-rewrite due dates.
- [ ] Paused mode stops scheduled presentation while preserving state.
- [ ] Reactivation restores the course without resetting progress.

## Analytics

- [ ] Empty accounts show empty states, not synthetic permanent metrics.
- [ ] Due/new/active/introduced/unintroduced counts agree with stored state.
- [ ] Scheduled success, estimated FSRS retrievability, quiz accuracy, and math accuracy are clearly separate metrics.
- [ ] Retention is labeled as an estimate; additional practice and recognition formats limit interpretation as unaided recall.
- [ ] Recent results, review workload, study time, frequently missed questions, weak units, and weak skills derive from persisted events.
- [ ] Filters by course, unit, skill, question type, and time period produce expected aggregates.
- [ ] Component-level errors remain available for composite questions.
- [ ] Structured analytics exposed to MCP match website aggregates from the same service layer.

## Security and ChatGPT integration

- [ ] Private Site access remains owner-private; API and MCP reject missing identity and enforce record ownership server-side.
- [ ] No credentials, database secrets, answer keys, or private data are bundled into public client assets.
- [ ] Browser writes have an appropriate same-origin/CSRF boundary; all mutations validate server-side.
- [ ] MCP offers narrow tools for courses/units, counts/progress, cards/problems, review history, quiz results, analytics/weak areas, imports, card updates, activation/suspension, and settings.
- [ ] Tool schemas, pagination, input limits, and useful errors are implemented; no unrestricted SQL/database tool exists.
- [ ] Destructive actions require explicit confirmation, and retryable batch operations are idempotent.
- [ ] Authenticated MCP read and at least one authorized write are tested against the same underlying database used by the website.
- [ ] Website writes are visible through MCP, and MCP writes are visible through the website.
- [ ] The deployed Site publishes an associated private plugin where supported.
- [ ] Actual plugin tool invocation is verified after installation/connection, or the remaining user action is explicitly documented. Route tests alone do not establish a working ChatGPT connection.

## Backup, durability, and delivery

- [ ] Versioned backup export includes courses, units, cards/problems, FSRS states, all histories, settings, and uploaded media bytes or an accompanying archive.
- [ ] Restore validates format/version, relationships, limits, and media; malformed restore cannot partially destroy existing data.
- [ ] A restore round trip preserves counts, state, histories, and media references.
- [ ] Persistence survives application restart and separate authenticated sessions/devices.
- [ ] Schema migrations are tracked, reproducible, and separate from seed data.
- [ ] Representative synthetic content is clearly labeled, optional, and removable without deleting user content.
- [ ] Dark detailed UI is usable on desktop, tablet, and mobile. Keyboard controls, focus, labels, contrast, and progress are checked.
- [ ] Loading/error/empty states work and visible controls have real outcomes.
- [ ] Source, runnable app/deployment, migrations, test results, installation/deployment instructions, import documentation, integration documentation, and candid limitations are delivered.
