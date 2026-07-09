# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Job Tailor is a Firefox MV3 browser extension (Manifest V3, built with Vite +
`vite-plugin-web-extension`). It parses a job listing from Welcome to the
Jungle, calls the Anthropic API to generate a tailored resume and cover
letter from a stored "master profile", renders them to PDF, and tracks
applications with `.xlsx` export.

## Commands

```
npm run dev        # vite dev build (watches manifest.json too)
npm run build       # production build -> dist/
npm run typecheck   # tsc --noEmit
npm test            # vitest run (all tests)
```

Run a single test file: `npx vitest run tests/anthropicClient.test.ts`
Run a single test by name: `npx vitest run -t "test name substring"`

**Gotcha:** running vitest from the repo root also picks up duplicate test
trees under `.claude/worktrees/*`, which fail cross-tree (duplicate React).
Remove stale worktrees before trusting a full suite run.

Manually loading the extension: `npm run build`, then in Firefox
`about:debugging` → "Load Temporary Add-on" → select `dist/manifest.json`.

## Architecture

- `src/lib/types.ts` — shared contracts: `JobData`, `MasterProfile`,
  `TailoredOutput`, `ApplicationRecord`. Start here to understand the data
  model.
- `src/lib/storage.ts` — all `browser.storage.local` access; keys are
  defined once in `KEYS`. Reads/writes are read-modify-write (non-atomic;
  fine for a single-surface extension).
- `src/lib/anthropicClient.ts` — builds the tailor-resume prompt, parses the
  response, and calls the API (`model: claude-sonnet-5`, `max_tokens: 16000`).
  Adaptive thinking is on by default for sonnet-5 and its tokens count
  against `max_tokens` — don't lower that budget. Throws if
  `stop_reason === "max_tokens"`.
- `src/lib/profileImport.ts` — same build/parse pattern as
  `anthropicClient.ts`, but for turning raw resume text into a
  `MasterProfile` via Claude.
- `src/lib/safeParseJson.ts` — tolerant JSON parse used by both of the above
  to recover from Claude wrapping JSON in prose/fences.
- `src/lib/pdfTemplate.ts` — `renderResumeHtml` / `renderCoverLetterHtml`
  build HTML strings (manually escaped, no framework), `downloadPdf` renders
  them via `html2pdf.js`. This is the only integration point for the PDF
  library, by design — it produces rasterized (screenshot) PDFs, not
  text-selectable ones (a known v1 limitation).
- `src/lib/xlsxExport.ts` — exports `ApplicationRecord[]` via SheetJS.
- `src/background/messageHandler.ts` — pure, dependency-injected message
  handler (`callClaudeApi` is injected so it's testable without network
  mocks). `background.ts` is thin wiring (`browser.runtime.onMessage` →
  `handleMessage`). Response contract everywhere in the extension:
  `{ ok: true, data } | { ok: false, error }`.
- `src/content-scripts/parseJobFromPage.ts` — pure DOM parser, no browser
  APIs, easy to unit test directly. Tries JSON-LD `JobPosting` first
  (including `@graph` arrays), then falls back to `og:title`/`<main>`
  heuristics. Company name is deliberately never taken from `og:site_name`
  (that's the job board, not the employer) — it's parsed from the
  "`<title> at <company>`" pattern instead. Same file also exports the async
  `parseJobFromPageOrFetch` (the entry point the content script actually
  uses): it runs the pure parser on the live DOM first, and if that's empty
  it re-fetches the page URL and parses the server HTML. **Why:** Welcome to
  the Jungle spans two surfaces — the classic board at
  `www.welcometothejungle.com` (JSON-LD present in the live DOM) and the Otta
  app at `app.welcometothejungle.com` (server-renders the same `JobPosting`
  JSON-LD but react-helmet strips it from the live DOM after hydration). The
  re-fetch recovers the SSR HTML, which still contains the JSON-LD (public,
  no auth). Both hosts are in the manifest `matches`/`host_permissions`.
  `wttj-parser.ts` is the message-listener wiring (`PARSE_JOB_REQUEST`) around
  it, returning the `parseJobFromPageOrFetch` promise directly.
- `src/popup/Popup.tsx` — a state machine:
  `loading → setup-required | ready → generating → generated | error`.
  The "already applied to this job" duplicate check runs both at bootstrap
  and again after generation completes. When no job is read, the `ready`
  state carries an `unavailable` reason so the popup can distinguish
  "not a supported page / still loading" (`sendMessage` rejected) from
  "page has no listing" (parser returned null) instead of one generic
  message.
- `src/options/Options.tsx` composes `ApiKeySection`, `ProfileEditor`, and
  `ApplicationsTable`. `ProfileEditor` keeps raw draft strings for
  bullets/skills while editing; normalization into arrays only happens in
  `handleSave`. Profile import (`.txt`/`.md` only in v1) goes through the
  same `IMPORT_PROFILE` background message as generation.
- Icons live in `public/icons/` — Vite copies `public/` to `dist/` as-is;
  `vite-plugin-web-extension` does **not** copy manifest-referenced assets
  that live under `src/`. `src/types/html2pdf.d.ts` is an ambient module
  shim for the untyped `html2pdf.js` import.

## Testing conventions

- Vitest + Testing Library, jsdom environment (`vitest.config.ts`).
- `tests/setup.ts` runs `afterEach(cleanup)`.
- Deterministic double-click / race-condition tests use `fireEvent`, not
  `userEvent` (userEvent's async event loop makes double-click ordering
  non-deterministic).

## Project docs

`docs/superpowers/` holds the design doc, implementation plan, and handoff
notes from prior sessions (`docs/superpowers/handoff/`) — check the most
recent handoff there for current project state, known gaps, and the v2
backlog before starting new work.
