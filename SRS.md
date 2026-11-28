# Software requirements

Functional requirements for document extraction and review. Acceptance criteria are testable from the API and the UI.

## FR-1 Ingest a PDF

A caller can create a document by uploading a PDF and a type of `invoice`, `lease`, or `market_report`. The title defaults to the file name.

Acceptance:

- `POST /documents` with a PDF and a valid type creates a document and version 1.
- Any other type is rejected.
- A non-PDF is rejected.

## FR-2 Upload returns before extraction

Creating a document or a new version does not wait for the model.

Acceptance:

- `POST /documents` and `POST /documents/:id/versions` return while status is `queued`.
- The response does not include extracted values.

## FR-3 New versions

A caller can attach another PDF to an existing document. The version number increases by one. Older versions and their reviews stay stored.

Acceptance:

- `POST /documents/:id/versions` creates the next number.
- `GET /documents/:id/versions/:number` returns that version, including after a newer one exists.

## FR-4 Status

Each version is `queued`, `extracting`, `extracted`, or `failed`. A failure stores an error string. An empty parse is `failed` and creates no field rows.

Acceptance:

- The detail payload includes status and, when failed, the error.
- A PDF with no text becomes `failed` and has no extracted values.

## FR-5 Extraction

A worker in the API process parses the PDF, sends the text and the type's field catalog to the selected model, and stores the prompt and raw response. Gemini is the default. Its model id defaults to `gemini-3.5-flash` (`GEMINI_MODEL`). When `USE_OPENROUTER` is `true`, `1`, `yes`, or `on` and `OPENROUTER_API_KEY` is set, that same prompt is sent to OpenRouter. The OpenRouter model id defaults to `google/gemini-3.5-flash` (`OPENROUTER_MODEL`). An OpenRouter key with the flag off stays on Gemini. The flag on with no OpenRouter key still selects OpenRouter, and that extraction ends `failed`. Field types are prompt hints. Stored values are strings. A missing key for the selected provider does not stop the process from booting. That extraction ends `failed`.

Acceptance:

- After a successful run the version is `extracted` and has one row per catalog field.
- The extraction run stores the prompt and the raw model response.
- With no key for the selected provider, the stack still starts and the version becomes `failed`.
- `USE_OPENROUTER` unset or false uses Gemini, including when an OpenRouter key is present.
- `USE_OPENROUTER` true with `OPENROUTER_API_KEY` set uses OpenRouter.

## FR-6 Evidence and gaps

Evidence must occur in that version's parsed text. Whitespace may differ. The stored quote is the span from the parsed text. A quote that cannot be located is a gap: `value` null and a reason. A field the model omits is a gap with a reason. The model must not guess.

Acceptance:

- An exact quote is stored unchanged.
- A quote that matches aside from whitespace is stored as the document's span.
- A quote that is not in the text is stored as a gap.
- Every catalog field has exactly one row.

## FR-7 Review

A reviewer approves a value or corrects it. A correction has a value and an optional note. The correction is a new review row. The extracted value is not overwritten. The latest review wins. Approve is rejected when the value is a gap. Correct is allowed on a gap and on any other state.

Acceptance:

- `POST /values/:id/review` with `{ "action": "approve" }` sets the state to `approved` when a value exists.
- The same call on a gap is rejected and does not create a review.
- `{ "action": "correct", "value", "note"? }` sets the state to `corrected` for a value or a gap.
- The extracted `value` column is unchanged.

## FR-8 Progress

`GET /documents/:id/progress` returns pending, approved, corrected, and carried-over counts for the current version. An unreviewed gap counts as pending. A carried-over value counts only as carried over.

Acceptance:

- The four counts match the current version's review states.
- A gap with state `pending` increments pending.
- A `carried_over` row does not also increment approved or corrected.

## FR-9 Carry-over

Unchanged means the normalized evidence string matches. Offsets are not compared. Carry-over happens only when evidence matches and the previous value has a review. The new row is `carried_over`, `carriedFromId` points at the old row, and the latest review is copied onto a new review row. The new extraction stays on the row. Unreviewed unchanged evidence stays `pending`. Changed evidence is `pending` with `previousValueId` set. Gaps do not carry. Prior versions are not updated or deleted.

Acceptance:

- Matching evidence plus a prior review produces `carried_over` and a copied review.
- Matching evidence with no prior review stays `pending` and copies nothing.
- Different evidence is `pending` and links `previousValueId`.
- A gap is `pending` and does not copy a review.

## FR-10 Concurrent versions

A new version uploaded while the previous one is still `queued` or `extracting` is accepted and queued. The worker delays that same job until the previous version is `extracted` or `failed`, then extracts. It does not complete the job and add another with the same id. If the previous version failed, the new one extracts with nothing to carry over.

Acceptance:

- The upload returns immediately with `queued`.
- The new version is not extracted before the previous version leaves `queued` or `extracting`.
- A failed previous version does not block the new one and contributes no carry-over.

## FR-11 Restart and Redis flush

Postgres is written before a job is enqueued. On boot, every version still `queued` or `extracting` is enqueued again. Enqueue deletes any existing BullMQ job for that version, then adds `extract-{versionId}`. A second run upserts on `(versionId, fieldKey)` and returns immediately when the version is already `extracted`. A crash, a restart, or a Redis flush ends with the version `extracted` or `failed`, never stuck in `extracting`.

Acceptance:

- Versions in `queued` or `extracting` are selected for enqueue on boot. `extracted` and `failed` are not.
- Two passes over the same fields produce one row per field.
- The job id is `extract-{versionId}`.

## FR-12 Retry

`POST /documents/:id/retry` is accepted only when the current version is `failed`. It sets that version back to `queued` and enqueues it. BullMQ is given two attempts for a transient model or parse error. After those attempts the version is `failed`.

Acceptance:

- Retry on a failed current version returns `queued`.
- Retry on any other current status is rejected.

## FR-13 Field catalog

Invoice fields: invoice number, issue date, due date, vendor name, total amount. Lease fields: tenant name, monthly rent, security deposit, lease start, term months. Market report fields: report quarter, market area, vacancy rate, average rent for a 1-bedroom, year-over-year rent growth, median household income. Types are string, date, money, percent, or number, and they are hints only.

Acceptance:

- The catalog used for extraction matches `fixtures/expected-fields.json`.

## FR-14 Seed

Startup seeds version 1 of each fixture document. Invoice version 2 is not seeded. Seeding does not reset a document that already exists, so a restart does not re-extract version 1.

Acceptance:

- A database that already contains a fixture document is left as it is.
- Only version 1 rows are created for a new fixture document.

## FR-15 Review UI

The list shows title, type, current version, status, and progress. Clicking a document row opens that document. The row menu does not. Pending work is the loudest count on the row. The detail view has one row per field for the selected version, a version switcher that defaults to the current version, the value or the gap reason, the evidence quote, approve (hidden on gaps), and a correct form. The correct form has a cancel control that closes it and clears the draft without saving a review. When a correction exists, that value is shown in front and the extracted value stays visible. Carried-over rows are visually quiet. Changed rows show the previous value and review. Pending rows and gaps sort first. The visible document is polled every 2 seconds while it is `queued` or `extracting`.

Acceptance:

- The list and detail screens render the states above.
- Clicking a list row opens that document. The row menu stays on the list.
- Approve is not offered for a gap.
- A version other than the current one can be selected and shows that version's values.

## FR-16 Non-goals

There is no authentication, no highlighting of a quote inside the parsed text, and no hosted deployment. The worker runs in the API process. Those are intentional cuts.

## FR-17 Clear data

`DELETE /documents` removes every document, version, extracted value, review, and extraction run, deletes the stored PDF files, and removes extraction jobs. The list is empty afterward. Startup seeding is unchanged: the next process start creates fixture version 1 only when those documents are absent.

Acceptance:

- After the call, `GET /documents` is an empty list.
- A version that was queued or extracting is not extracted after the call.
- Stored PDF files for those versions are removed.
- A second call returns a deleted count of zero.
- The list screen has a control that calls this endpoint and shows the empty list.

## FR-18 Delete one document

`DELETE /documents/:id` removes that document, its versions, extracted values, reviews, and extraction runs, deletes the stored PDF files for those versions, and removes their extraction jobs. Other documents stay. A missing id is not found. Startup seeding is unchanged: the next process start creates fixture version 1 only when that document is absent.

Acceptance:

- After the call, `GET /documents` no longer includes that id, and the other documents remain.
- A version of that document that was queued or extracting is not extracted after the call.
- Stored PDF files for those versions are removed.
- A missing id is rejected.
- The list screen has a per-row menu with a delete action that calls this endpoint and drops that row.
