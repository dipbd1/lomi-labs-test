# Agent guide

Read `SRS.md` first. It is the functional spec. If a change alters behavior, update `SRS.md` in the same change. Implementation notes belong in `README.md`.

## Map

- `apps/api` — NestJS HTTP API and the BullMQ worker in one process.
- `apps/web` — Vite, React, and Mantine. Two screens.
- `packages/contracts` — Zod schemas, the field catalog, and the shared response types.
- `fixtures` — sample PDFs and the field catalog. Seed version 1 only.

## Commands

```sh
pnpm install
pnpm test
pnpm lint
pnpm build
docker compose up --build
```

`turbo.json` runs `build`, `lint`, and `test`. Postgres is on 5432, Redis on 6379, the API on 3000, and the web app on 8080. The browser calls `/api`, which nginx and the Vite dev server proxy to the API. API routes themselves have no `/api` prefix.

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` before expecting extraction to succeed. Set `USE_OPENROUTER=true` and `OPENROUTER_API_KEY` to send extraction to OpenRouter instead. The stack still boots without a key for the selected provider. Those versions end `failed`.

## Invariants

- Write Postgres before enqueue. If enqueue fails, the version stays `queued` and the boot sweep picks it up.
- Enqueue deletes any existing `extract-{versionId}` job, then adds it.
- A new version that must wait on the previous one delays that same job. Do not complete it and add another with the same id.
- Evidence is checked against that version's parsed text. A miss is a gap. Empty text is `failed`, with no field rows.
- A correction is a review row. Do not overwrite `ExtractedValue.value`.
- Approve is rejected on a gap. Correct is allowed.
- Carry-over requires normalized evidence to match and a review to copy. Unreviewed unchanged evidence stays `pending`.
- Do not seed invoice version 2. Do not reset an existing fixture document.
- `unpdf` is ESM-only and is loaded dynamically. Keep the `Iterator` shim in `apps/api/src/extraction/pdf.ts`; the bundled PDF.js build reads that global, which Node 20 does not define.
- Keep the Postgres and Redis `mem_limit: 2g` caps, and the smaller memory settings under them, in `docker-compose.yml`.

## Code

No code comments. Keep imports at the top of the file. Switch on unions and enums with a `never` default. Tests are pure functions in `apps/api` (`node:test`). Do not add a Nest test module. Run `pnpm test` before finishing.

Do not add auth, quote highlighting, a separate worker, or a live deploy unless the spec changes and `SRS.md` is updated with it.
