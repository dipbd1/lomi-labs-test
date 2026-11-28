# Lomi Labs document review

PDFs go in, Gemini extracts the fields for that document type, and a reviewer approves or corrects each value against the quote it came from. A revised PDF keeps reviews whose evidence did not change.

Requirements are in [SRS.md](SRS.md). Agents should follow [AGENTS.md](AGENTS.md).

## Run

```sh
cp .env.example .env
```

Set `GEMINI_API_KEY` in `.env`. The model defaults to `gemini-3.5-flash`.

To run the same extraction through OpenRouter, set `USE_OPENROUTER=true` and `OPENROUTER_API_KEY`. The OpenRouter model defaults to `google/gemini-3.5-flash` (`OPENROUTER_MODEL`). The flag accepts `true`, `1`, `yes`, and `on`. With the flag off, an OpenRouter key is ignored and Gemini is used. The flag on without that key fails the extraction the same way a missing Gemini key does.

```sh
docker compose up --build
```

Open http://localhost:8080. The API is on http://localhost:3000. Postgres and Redis start first. The API container waits until both are healthy, runs `prisma migrate deploy`, seeds version 1 of each fixture, then boots. The seed skips any fixture document that already exists, so a restart does not extract version 1 again. Clear data on the list deletes every stored document, review, extraction run, and PDF, and removes extraction jobs. Each row's menu deletes that one document the same way and leaves the others in place. The list stays empty until the next boot, which seeds the fixtures again because they are absent.

The list shows three seeded documents. Open one, wait until the badge says `extracted`, then approve or correct a field. Pending rows and gaps are at the top. To try carry-over, open the Meridian invoice and upload `fixtures/documents/invoice-001.v2.pdf` as a new version. Fields whose evidence did not change come back carried over. The two that changed come back pending, with the previous value beside them.

The browser talks to `/api/...`. nginx (and the Vite dev server) proxy that to the API, which serves `/documents` and `/values` with no prefix. In local dev, Vite holds each `/api` request until `GET /health` on port 3000 succeeds, so a refresh while the API is still compiling is not refused. A missing API key still lets the stack boot. Those extractions finish as `failed`, with a retry button on the current version.

Unit tests, lint, and the build do not need Docker:

```sh
pnpm install
pnpm test
pnpm lint
pnpm build
```

## Layout

pnpm workspaces and Turborepo. `turbo.json` runs `build`, `lint`, and `test`.

- `apps/api` is the NestJS API and the BullMQ worker in one process, one container. A separate worker is extra machinery for four sample PDFs.
- `apps/web` is Vite, React, and Mantine. Two screens, no component library of our own.
- `packages/contracts` holds the field catalog, the review schema, and the response types so the UI cannot drift from the API.
- `fixtures` is the assignment data. The catalog in contracts is checked against `fixtures/expected-fields.json`.

## Schema

A correction is a review row beside the extracted value. Nothing is overwritten, and nothing from an older version is deleted.

- **Document** — type (`invoice`, `lease`, `market_report`) and title.
- **DocumentVersion** — number, PDF path, parsed text, status, error. Parsed text is stored so version N is still reviewable after N+1 exists.
- **ExtractionRun** — the prompt and the raw model response for that attempt.
- **ExtractedValue** — one row per `(versionId, fieldKey)`. `value` null is a gap, with `gapReason`. `reviewState` is `pending`, `approved`, `corrected`, or `carried_over`. `carriedFromId` and `previousValueId` point at the prior version's row.
- **Review** — append-only `approve`, or `correct` with a value and an optional note. The latest row wins.

## Redis and Postgres

Postgres is the record. Redis is the queue, and the payload is `{ versionId }`. The version row is inserted before the job is added. If the add fails, the row stays `queued` and the boot sweep enqueues it.

On boot, every `queued` or `extracting` version is enqueued. BullMQ will not run a new job while a completed or failed job still holds `extract-{versionId}`, so enqueue deletes that job first. The id uses a hyphen because BullMQ rejects a custom id that contains `:`. The worker upserts on `(versionId, fieldKey)` and returns immediately when the version is already `extracted`. A second overlapping run can spend a model call. It cannot insert a second row. A crash, `docker compose restart`, or `FLUSHALL` ends the same way: `extracted`, or `failed` with retry. Nothing stays in `extracting`.

A model or parse error is thrown so BullMQ can try twice. The last failure sets `failed` and the error string. Empty PDF text and a missing API key are permanent: the version is `failed` and the job is not retried. `POST /documents/:id/retry` puts a failed current version back to `queued`.

A new version uploaded while the previous one is still running is accepted. The worker delays that same job until the previous version is `extracted` or `failed`. Completing the job and adding another with the same id would drop the work. If the previous version failed, the new one extracts with nothing to carry over.

Redis is local, `redis://redis:6379` inside Compose. There is no Upstash. Persistence is off, so a flush does not matter and Redis does not fork for a snapshot. `noeviction` means a full queue fails a write instead of dropping a job. Postgres and Redis each have `mem_limit: 2g`. Postgres is tuned to `shared_buffers=128MB`, `work_mem=4MB`, `maintenance_work_mem=64MB`, `effective_cache_size=256MB`, and `max_connections=20`, with a 256MB shared-memory mount so that buffer setting can allocate. Redis is `--maxmemory 256mb`. The caps are ceilings. The API and web containers are uncapped.

## Decisions

- Evidence is unchanged when the whitespace-collapsed quote matches. A shift elsewhere on the page does not drop a review. The stored quote is the span from this version's text, not the model's string.
- Carry-over copies a review only when there is one to copy. An unreviewed match stays pending.
- Values are strings. Dates, money, percents, and numbers are hints in the prompt.
- The model is asked for verbatim evidence: a non-null value includes `evidence` copied from the document text, and the response schema allows null `evidence` only when `value` is null. A quote that is not in that version's text is still stored as a gap.
- The UI polls every 2 seconds while a visible document is `queued` or `extracting`. Two clients and jobs that finish in seconds do not need a stream.
- Mantine supplies the table, badges, and inputs. Vite is enough because Nest already owns the API.

## Cuts

No sign-in, no highlight of the quote inside the parsed text, no hosted deploy, and no separate worker process. The parsed text is on the detail page so the quote can still be read in context.

## At 10,000 documents

Split the worker out of the API process, put PDFs in object storage instead of a disk volume, and stop polling. The Postgres-before-enqueue line stays.

## Tests

`pnpm test` runs pure functions: evidence location, carry-over, boot recovery, idempotent field writes, provider selection, and the extraction prompt and response schema. There is no Nest test module.
