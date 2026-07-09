# Job Tailor

A Firefox extension that turns a [Welcome to the Jungle](https://www.welcometothejungle.com)
job listing into a tailored résumé and cover letter using the Anthropic API,
renders them to PDF, and tracks your applications with `.xlsx` export.

You store a "master profile" once. On any supported job page, Job Tailor reads
the listing, sends it to Claude alongside your profile, and generates a résumé
and cover letter rewritten for that specific role — then lets you download both
as PDFs and log the application.

> **Bring your own key.** Job Tailor calls the Anthropic API directly from the
> browser using *your* API key, which is stored locally in the extension and
> never leaves your machine except in requests to Anthropic. There is no
> backend server and no telemetry.

## Features

- **Automatic job parsing** — reads the role, company, location, and
  description from a Welcome to the Jungle listing. Works on both the classic
  board (`www.welcometothejungle.com`) and the Otta app
  (`app.welcometothejungle.com`).
- **AI-tailored output** — generates a role-specific résumé and cover letter
  from your master profile via Claude, using structured outputs so the
  response is always well-formed.
- **PDF export** — download the résumé and cover letter as formatted PDFs.
- **Application tracking** — mark jobs as applied and export your history to
  `.xlsx`. The popup warns you if you've already logged an application for the
  current listing.
- **Résumé import** — bootstrap your master profile by pasting or importing a
  plain-text résumé; Claude structures it for you.

## How it works

```
Welcome to the Jungle page
        │  (content script parses the listing)
        ▼
   Popup UI  ──►  Background worker  ──►  Anthropic API (your key)
        │                                        │
        │   ◄──────── tailored JSON ─────────────┘
        ▼
  PDF render + application log (.xlsx)
```

- The **content script** parses the job listing from the page's JSON-LD
  (`JobPosting`), with an HTML fallback. On the Otta app, where the JSON-LD is
  stripped from the live DOM after the page hydrates, it re-fetches the public
  server-rendered HTML anonymously to recover it.
- The **background worker** builds the prompt and calls Claude
  (`claude-sonnet-5`), constraining the reply with a JSON schema so the résumé
  and cover letter always come back in the expected shape.
- The **popup** drives the flow (`Generate` → preview → download / mark
  applied) and reads your API key and profile from local storage.

## Tech stack

- **Firefox MV3** extension (Manifest V3)
- **TypeScript** + **React** (popup and options UI)
- **Vite** + [`vite-plugin-web-extension`](https://github.com/aklinker1/vite-plugin-web-extension) for the build
- [`webextension-polyfill`](https://github.com/mozilla/webextension-polyfill) for the browser APIs
- [`html2pdf.js`](https://github.com/eKoopmans/html2pdf.js) for PDF rendering, [SheetJS](https://sheetjs.com/) for `.xlsx` export
- **Vitest** + Testing Library for tests

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- Firefox
- An [Anthropic API key](https://console.anthropic.com/)

### Install & build

```bash
npm install
npm run build     # production build → dist/
```

For iterative development, `npm run dev` runs a watch build (it also rebuilds
when `manifest.json` changes).

### Load the extension in Firefox

1. Run `npm run build`.
2. Open `about:debugging` in Firefox.
3. Click **This Firefox** → **Load Temporary Add-on…**.
4. Select `dist/manifest.json`.

The extension icon appears in the toolbar. (Temporary add-ons are removed when
Firefox restarts; reload it the same way after each restart.)

### First-time setup

1. Open the extension's **Settings** (options page).
2. Paste your Anthropic API key.
3. Fill in your master profile, or import a plain-text résumé to populate it.

Then open a Welcome to the Jungle job listing, click the toolbar icon, and
hit **Generate**.

## Development

```bash
npm run dev        # watch build
npm run build      # production build → dist/
npm run typecheck  # tsc --noEmit
npm test           # vitest run (all tests)
```

Run a single test file:

```bash
npx vitest run tests/anthropicClient.test.ts
```

### Project layout

| Path | Responsibility |
| --- | --- |
| `src/lib/types.ts` | Shared data contracts (`JobData`, `MasterProfile`, `TailoredOutput`, `ApplicationRecord`) |
| `src/lib/storage.ts` | All `browser.storage.local` access |
| `src/lib/anthropicClient.ts` | Prompt building, structured-output request, and response parsing |
| `src/lib/profileImport.ts` | Turns raw résumé text into a `MasterProfile` via Claude |
| `src/lib/pdfTemplate.ts` | Résumé/cover-letter HTML templates and PDF rendering |
| `src/lib/xlsxExport.ts` | `.xlsx` export of tracked applications |
| `src/content-scripts/` | Job-listing parser and its message wiring |
| `src/background/` | Message handler and background worker wiring |
| `src/popup/` | Popup UI state machine |
| `src/options/` | Settings, profile editor, and applications table |

See [`CLAUDE.md`](./CLAUDE.md) for a deeper architectural tour.

## Privacy & security

- Your API key and master profile are stored only in `browser.storage.local`.
- The only network calls are: parsing requests to Welcome to the Jungle (the
  page you're on) and generation requests to the Anthropic API with your key.
- No analytics, no third-party backend.
- **Never commit your API key.** It is entered at runtime through the Settings
  page and is not part of the source tree.

## Limitations (v1)

- Firefox only.
- Job parsing supports Welcome to the Jungle only.
- Exported PDFs are rasterized (image-based), so the text is not selectable.
- Résumé import accepts plain text (`.txt` / `.md`) only.

## License

Released under the [MIT License](./LICENSE).
