# Content import format

Import adds content to the library. It does **not** introduce cards, create review events, or assign learned intervals. Use the unit's introduction controls afterward. Mathematical problems live in Problem Practice and do not acquire FSRS schedules.

The canonical validation code is `lib/types.ts` for question content and `lib/service.ts` for import envelopes. JSON examples below use synthetic content to illustrate the format; the app does not generate educational material.

## Card import request

The browser API accepts `POST /api/action` with `Content-Type: application/json` and an `{ "action", "input" }` envelope. The `import_cards` MCP tool accepts the same input fields directly. Course and unit IDs come from your own course records; catalog IDs are not database IDs.

```json
{
  "action": "cards.import",
  "input": {
    "courseId": "your-course-id",
    "unitId": "your-unit-id",
    "batchId": "algebra-unit-1-v1",
    "cards": [
      {
        "externalId": "arithmetic-001",
        "skills": ["addition"],
        "content": {
          "type": "multiple_choice",
          "prompt": "Which value equals 2 + 2?",
          "options": [
            { "id": "four", "text": "4" },
            { "id": "five", "text": "5" }
          ],
          "correctOptionIds": ["four"]
        }
      }
    ]
  }
}
```

A batch contains 1–1,000 cards. `courseId`, `batchId`, and `cards` are required. A default `unitId` can be supplied at batch level, or each card can specify its own `unitId`; the chosen unit must belong to the target course. Each card has required `content`, optional `externalId`, and optional `skills` (default `[]`). There are at most 30 skill strings, each nonempty and at most 100 characters. IDs are nonempty strings of at most 100 characters.

Keep `batchId` stable when retrying the same request and use a new ID for a genuinely new batch. Use stable `externalId` values for content produced outside the app. A card's internal database ID is assigned by the app; it is not its external ID. Replaying the same batch ID and payload returns the prior result (with `replayed: true`) without inserting duplicates. Reusing that batch ID for changed content returns HTTP 409. Duplicate external IDs inside a single batch are rejected. An external ID already present in the target course is **skipped**, even if the incoming content differs; existing cards are never overwritten by import. The response includes `imported`, `skipped`, `ids`, and `batchId`. Use the explicit edit operation for changes.

## Problem import request

Use `"action": "problems.import"` and replace `cards` with `problems`. The course, unit, batch, external-ID, content, and skill fields behave the same way. Each problem may additionally contain:

| Field        | Type/default                    | Meaning                                                                                   |
| ------------ | ------------------------------- | ----------------------------------------------------------------------------------------- |
| `difficulty` | integer 1–5; default 2          | Author-defined difficulty.                                                                |
| `hint`       | string, up to 10,000 characters | Optional hint available during practice.                                                  |
| `solution`   | string, up to 20,000 characters | Worked solution shown after answering.                                                    |
| `template`   | JSON object                     | Optional reusable-template metadata and instantiated values. It does not run a generator. |

Problems can use any supported content type, including multiple choice and typed mathematics. Importing a problem never creates a card schedule.

## Question content

Every question has a `type` and a nonempty `prompt`. These shared fields are optional:

| Field         | Type   | Meaning                                                                                               |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `explanation` | string | Revealed after grading, subject to the session's feedback setting.                                    |
| `imageUrl`    | string | An uploaded `/api/media/…` path or an HTTPS URL. Upload important media so it remains in your backup. |
| `imageAlt`    | string | Required when `imageUrl` is present; describe the image without leaking the answer.                   |
| `variants`    | array  | Alternate wording for this knowledge target, sharing its card ID and FSRS state.                      |

Prompts and explanations are limited to 20,000 characters. Images have a 2,000-character URL limit and 500-character alternative-text limit. Question objects are strict: unknown fields are rejected instead of silently ignored.

A variant is `{ "id": "alternate", "prompt": "An alternate version of the prompt" }`. It may include `componentPrompts`, a map from source component IDs to alternate prompts. At most 30 variants are accepted; variant IDs must be unique. Keep the same answer meaning across variants. The selected variant and presentation are saved with each attempt.

### Single-choice and true/false

```json
{
  "type": "multiple_choice",
  "prompt": "Which value equals 2 + 2?",
  "options": [
    { "id": "three", "text": "3" },
    { "id": "four", "text": "4" },
    { "id": "five", "text": "5" },
    { "id": "six", "text": "6" }
  ],
  "correctOptionIds": ["four"],
  "optionCount": 4,
  "explanation": "Adding two and two gives four."
}
```

`multiple_choice` requires exactly one correct option. `true_false` uses the same fields, exactly two options, and one correct option. Option IDs and normalized option text must be distinct; correct IDs must exist in the options. A question needs at least one distractor.

The full `options` array is a stored pool of 2–60 choices. `optionCount` is optional and selects a smaller presentation containing every correct option plus distractors. Single-choice questions default to at most four presented choices; the display order is randomized. Source option IDs are replaced by presentation IDs in study responses. The author remains responsible for semantic ambiguity: a validator can detect duplicate strings, not prove two different answers cannot both be correct.

### Multiple select

Use `"type": "multiple_select"` with the same choice fields and put every correct option ID in `correctOptionIds`. All correct options and no incorrect options must be selected. The default presentation includes all stored options; if `optionCount` is supplied, it must accommodate every correct option. At most 30 correct IDs are allowed.

### Phased cloze

```json
{
  "type": "cloze",
  "prompt": "Complete both blanks in order.",
  "components": [
    {
      "id": "first",
      "prompt": "Two plus two equals ____.",
      "options": [
        { "id": "four", "text": "4" },
        { "id": "five", "text": "5" }
      ],
      "correctOptionIds": ["four"]
    },
    {
      "id": "second",
      "prompt": "Three plus three equals ____.",
      "options": [
        { "id": "six", "text": "6" },
        { "id": "seven", "text": "7" }
      ],
      "correctOptionIds": ["six"]
    }
  ]
}
```

A cloze question has 1–20 components with unique IDs. Each component has its own prompt, choices, one correct option, optional `optionCount`, and optional explanation. The complete card has **one** FSRS schedule; component errors are recorded separately. Do not put the filled answers in the main prompt.

To study blanks independently, import separate card records, each containing the desired single component and a distinct `externalId`. This is an explicit content choice; importing a multi-component cloze does not multiply its schedules. Review the surrounding text for answer clues when splitting.

### Matching

```json
{
  "type": "matching",
  "prompt": "Match each number to its name.",
  "pairs": [
    { "id": "one", "left": "1", "right": "One" },
    { "id": "two", "left": "2", "right": "Two" }
  ]
}
```

Provide 2–30 correct pairs. Pair IDs must be unique. Both left labels and right labels must be distinct. The right-hand options are shuffled for study. One matching question is one scheduled card, with per-pair results.

### Sequencing

```json
{
  "type": "sequencing",
  "prompt": "Put these numbers in ascending order.",
  "items": [
    { "id": "one", "text": "1" },
    { "id": "two", "text": "2" },
    { "id": "three", "text": "3" }
  ]
}
```

The stored `items` array is the **correct order**. Supply 2–30 items with distinct IDs and text. The presentation starts shuffled and grading compares the complete order. Preserve the source order when editing or exporting.

### Typed mathematics and self-grading

```json
{
  "type": "typed",
  "prompt": "Write one half as a decimal.",
  "answer": "1/2",
  "grading": "numeric"
}
```

`grading` is `numeric` (default), `expression`, or `manual`. A nonempty `answer` is required. `tolerance` is an optional nonnegative **absolute** numeric tolerance, up to 1,000,000,000. Omit it for exact rational comparison. An `expression` problem can restrict variables, for example `"variables": ["x"]` with `"answer": "2*x+2"`; `2*(x+1)` is equivalent.

Automatic grading uses the mathjs parser with an explicitly limited evaluator. It accepts finite integers/decimals/fractions, arithmetic and small polynomial expressions, constant denominators, and integer powers within the supported bounds. It does not run arbitrary parsed code. Functions, assignments, arrays, physical units, equations, complex numbers, variable denominators, and unsupported symbols require manual grading. Expressions are bounded to 300 characters, 100 syntax nodes, depth 20, three variables, degree eight, and 128 expanded terms; numeric literals with over 15 significant digits require manual grading. The importer accepts answer strings up to 400 characters, but answers beyond automatic limits require self-grading.

An unsupported answer is not declared mathematically wrong solely because it cannot be checked. The study flow offers a self-grading result. Use `manual` explicitly for content outside the supported scope. Worked solutions remain separate from the student's submitted answer.

## Ownership and answer visibility

Imports and content editing require an authenticated owner. The owner can retrieve answer-bearing card content for editing and export. Study presentations are a separate API shape: answer keys and explanations are held server-side until submission and the chosen feedback phase. Do not use an editing response as a public study presentation.

## Media and backups

Upload images through the app and use their returned `/api/media/…` paths in the content. Imported HTTPS image URLs remain dependent on that external host and are not automatically fetched into managed storage. A temporary local path, `file:` URL, or development-server URL is not a durable media reference. The complete backup format is separate from a content import: it also includes scheduling, histories, settings, and uploaded assets.

## Full backup and restore

Use `GET /api/backup` to download a complete JSON backup. Do not substitute `cards.list`, a content-import file, a Git commit, or a deployment version for this backup. Its envelope is:

```json
{
  "format": "recall-academy",
  "version": 1,
  "exportedAt": "2026-11-12T12:00:00.000Z",
  "tables": {},
  "media": []
}
```

`tables` contains arrays of database rows with their original snake_case field names, including course/unit structure, card/problem content, schedules, sessions, review/problem attempts, settings, import records, and asset metadata. `media` contains `{ "id": "asset-id", "data": "base64-image-bytes" }` for each uploaded asset. Preserve the whole exported object instead of constructing one by hand.

Restore by posting `{ "confirm": true, "backup": <the exported object> }` to `/api/backup` with `Content-Type: application/json`. This is a **replacement** of the signed-in user's study data, so export the current data first if it must be kept. The server validates the version, relationships, owned scope, image metadata, and image signatures before the database replacement. Uploaded images are staged under new storage keys so a failed database restore does not damage existing images. The browser API intentionally rejects `backup.export`/`backup.restore` through `/api/action`; use the complete `/api/backup` endpoint so image bytes are included.

The browser backup limit is **32 MiB**, including base64 image data. Each uploaded image is limited to **5 MiB**, and PNG, JPEG, WebP, and GIF are supported. SVG uploads are not accepted. Backups exceeding the browser limit require an administrator-level database plus object-storage export; the app does not silently omit assets to make a backup fit. External HTTPS image URLs are preserved as links, not copied into the backup.
