# Recall import format

For generated batches, use **UTF-8 JSON, version 1**. In the target course, open **Card library → Import** or, for a math course, **Problem Practice → Import**. Paste a batch or choose a file, then select **Check batch**. Recall shows the unit and the number of new cards, new problems, and duplicates for each destination. This check leaves the library untouched. Confirm the import after reviewing the counts.

**Download synthetic JSON example** in the import dialog gives you a valid file with all seven question formats, the active course's ID, and real unit IDs. For a math course the example also contains two practice problems. Use **Unit names and IDs for this course** to copy destinations into a generator. Use your own prompts and IDs in generated files.

## Generate a JSON batch

One file targets one existing course. A math course can receive both `cards` and `problems` in the same file. Use the cards array for material you may introduce into reviews or use in quizzes. Use the problems array for exercises in Problem Practice. Newly imported cards are **unintroduced**, with no FSRS schedule or review events. Practice problems have no FSRS schedule.

```json
{
  "version": 1,
  "batchId": "algebra-foundations-001",
  "unitName": "Foundations",
  "cards": [
    {
      "externalId": "algebra-foundations-card-001",
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
  ],
  "problems": [
    {
      "externalId": "algebra-expressions-problem-001",
      "unitName": "Expressions",
      "skills": ["distribution"],
      "difficulty": 2,
      "hint": "Distribute the 2 across both terms.",
      "solution": "The result is $2x+2$.",
      "content": {
        "type": "typed",
        "prompt": "Expand $2(x+1)$.",
        "answer": "2*x+2",
        "grading": "expression",
        "variables": ["x"]
      }
    }
  ]
}
```

Replace `Foundations` and `Expressions` with units in your own course. Include a `courseId` from the downloadable example if you want the file to be locked to that course.

| Field | Rules |
| --- | --- |
| `version` | Required for this format. Use the number `1`. |
| `batchId` | Required in version 1. A string of 1–100 characters with no surrounding whitespace. Keep it stable across retries. Use a fresh ID for a different batch. IDs are unique across your library. |
| `courseId` | Optional. If present, it must match the course open in Recall. Use a Recall course ID, rather than an Acellus catalog ID. |
| `unitId` or `unitName` | Optional batch destination. Use only one. A file destination takes precedence over the dialog's Default unit. |
| `cards`, `problems` | Include at least one array. Across both arrays, supply 1–1,000 entries. Entry order within each array is significant. |
| Each entry | Requires a `content` object. An optional `unitId` or `unitName` overrides the batch destination for that entry. `externalId` and `skills` are optional. Supply up to 30 distinct skill tags of 1–100 characters each. |

Use an exact, case-sensitive `unitName`, including punctuation. If two units share a name, use the stable `unitId` for the intended one. Every entry must resolve to a unit that already belongs to the open course. The check rejects missing, ambiguous, and out-of-course units. It never creates a unit to fit a typo. A versioned file can contain both arrays regardless of which library tab opened the dialog.

The file and outgoing request are limited to 8 MiB each. An individual prepared item is limited to 256 KiB. Keep the file comfortably under the limits to leave room for the request envelope and generated storage fields. Split larger exports into numbered batches and import the batches in the order you want them appended. JSON must have unique keys and valid syntax. Omit optional values you don't need. Unknown fields, comments, and trailing commas are rejected.

## Order, duplicates, and retries

- Recall appends new entries after the existing library, preserving their relative order in each array. For example, if the file has units A, B, A, the two new items in A appear in their file order when you filter to A. **Introduce next N** follows that order within the unit. Set quiz or problem selection to **Library order** to study in that order.
- Use a stable `externalId` for each item you generate. Its length is 1–100 characters, and it must be unique per course and item kind. A card and a problem can share an ID. Two cards in the same file cannot, even across units.
- On a new batch, Recall skips IDs already present in the same unit and keeps the stored content and position. If an existing ID points to a different unit, the import rejects the conflict. Move the existing entry explicitly or give the new item its own ID. Edit existing content through the library or API.
- Submitting the same parsed content, destinations, and order with the same batch ID returns the original receipt. Reusing that ID with different content, destinations, or order is an error. JSON whitespace and object key order do not affect retry identity. The entire import saves together. A rejected entry leaves the entire batch unsaved, and you can correct it and retry.
- The browser also accepts unversioned `cards` or `problems` objects, the corresponding legacy API envelopes, and plain arrays. Plain arrays use the kind of the open library. Files without a batch ID, including CSV, get a content-derived ID for safe reupload of the same batch in the same destination. Use the versioned format for generated files.

## CSV for single-answer multiple choice

Open the intended library first. CSV rows become cards in Card library, or problems in Problem Practice. Save UTF-8, use commas, and keep one header row. Required columns are `prompt`, `option_a`, `option_b`, and `answer`. Fill all four fields on every row. Optional columns include `option_c`, `option_d`, `external_id`, `unit_id`, `unit_name`, `explanation`, and `skills`. In Problem Practice, `difficulty`, `hint`, and `solution` are also available.

```csv
external_id,unit_name,prompt,option_a,option_b,answer,explanation,skills
algebra-card-001,Foundations,"What is 2 + 2, in decimal notation?",4,5,4,"2 + 2 = 4",addition;arithmetic
```

Use the answer's full option text, with exact case. Surround fields containing commas, quotes, or line breaks with double quotes. Escape a double quote inside a quoted field by writing two double quotes. Separate skills with semicolons. Column names and surrounding field whitespace are normalized. Extra or missing fields, unknown or duplicate column names, malformed quotes, and unmatched answers are errors. Use JSON for more than four choices, any other question type, images, variants, or template metadata.

## API and plugin imports

The browser and MCP use the same library rules. To import cards via the MCP tool `import_cards`, pass `courseId`, `batchId`, `cards`, and an optional batch `unitId` or `unitName`. To call the authenticated browser API, send an `{ "action", "input" }` JSON envelope to `/api/action`. Available actions are `cards.import`, `problems.import`, `library.previewImport`, and `library.import`. Put course and destination fields and the arrays inside `input`. The `version` field is only for uploaded files. The single-kind actions require a `batchId`. The result includes `imported`, `skipped`, `ids`, `batchId`, and counts by destination. Imports from prior versions may return a receipt without per-unit counts.

## Problem import request

Add problems in the `problems` array of a math course's batch. The course, unit, batch, external ID, content, and skill fields work the same way as for cards. Problems may additionally contain:

| Field        | Type/default                    | Meaning                                                                                   |
| ------------ | ------------------------------- | ----------------------------------------------------------------------------------------- |
| `difficulty` | integer 1–5; default 2          | Author-defined difficulty.                                                                |
| `hint`       | string, up to 10,000 characters | Optional hint available during practice.                                                  |
| `solution`   | string, up to 20,000 characters | Worked solution shown after answering.                                                    |
| `template`   | JSON object                     | Optional reusable-template metadata and instantiated values. Up to 20 nested levels. |

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

A variant is `{ "id": "alternate", "prompt": "An alternate version of the prompt" }`. It may include `componentPrompts`, a map from source IDs to alternate prompts. Use the blank IDs for cloze, pair IDs for matching, or `main` for choice questions. Sequencing and typed questions support top-level prompt variants. At most 30 variants are accepted, and variant IDs must be unique. Keep the same answer meaning across variants. The selected variant and presentation are saved with each attempt.

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

The full `options` array is a stored pool of 2–60 choices. `optionCount` is optional and selects a presentation containing every correct option and at least one distractor. Its value cannot exceed the number of stored choices. Single-choice questions default to at most four presented choices, in randomized order. Source option IDs are replaced by presentation IDs in study responses. Review the content for ambiguous options and answer clues.

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

Upload images through the app and use their returned `/api/media/…` paths in the content. The check verifies that those uploaded paths exist in your account. For external HTTPS images, verify the links yourself. They remain on the external host and Recall stores the link.

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
