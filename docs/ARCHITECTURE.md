# Architecture

Plume is a Tauri 2 desktop app: a React 18 + TypeScript front end (Vite,
zustand, CodeMirror 6) and a small Rust back end (`src-tauri/src/lib.rs`) for
files, backups and running the `claude` command line.

## The book folder

```
My Book/
  plume.json                 title, language, chapter and scene order, AI settings
  bible/style.md             style guide, always sent
  bible/<type>/<slug>.md     one entry per file
  manuscript/<chapter>/chapter.md
  manuscript/<chapter>/sc-<slug>.md
  .plume/trash/              removed scenes and entries (nothing is deleted)
```

`.plume/` also holds the chat, the review list, darlings, the taste log,
agent findings, version history (`history/<scene>/`) and the lock file. Backups
go to Plume's own folder on this computer (`%LOCALAPPDATA%`), not the book.

Front matter is YAML at the top of each Markdown file. Keys Plume doesn't know
are kept as they are, so a file edited by hand or by another tool survives.

## How the AI calls stay small

- `claude -p --safe-mode --tools "" --strict-mcp-config --disable-slash-commands
  --no-session-persistence --system-prompt-file …`: about 830 tokens of CLI
  overhead instead of ~54,000 with Claude Code's defaults (measured, CLI 2.1.296).
- Rules, style guide and bible go in the system prompt, which the CLI caches
  for an hour; story text and the task go in the message. Only the system
  prompt is reused from the cache (tested), so its content is kept stable
  between calls (entries sorted by id, the same rules for every action).
- Short entry versions by default, a bible budget (3,000 tokens), a story
  window (1,500 words before the cursor), word targets on every reply.
- Runs from an empty folder in Plume's app data, so no CLAUDE.md is read.

The context engine (`src/lib/context.ts`) decides what a request carries: the
bible entries named in the passage (short version), the point-of-view character
and @-mentioned entries (full version), their voice cards and dated facts, the
author's style guide and prompt, and summaries of the story so far. It runs
locally and costs no tokens. The size meter in the AI panel shows the result
before anything is sent.

## Where things are

- `src/lib/`: pure logic, no React: types, book files, the context engine,
  analysis and review reports, voice rules, structures, export, typography,
  find, the bible check. Tested in `src/lib/core.test.ts`.
- `src/*.ts` at the top: stores and AI tasks (`ai.ts` one-shot calls and
  cheap mode, `chat.ts`, `writing.ts`, `review.ts`, `library.ts`, `agents.ts`,
  `bibleAI.ts`).
- `src/editor/`: CodeMirror pieces: typography as you type, AI proposals,
  overlays (unknown names, placeholders, highlights, tracked changes).
- `src/components/`: the screens and dialogs.
- `src/i18n.ts`: the interface in French (code is written in English).
- `src/studio-kit/`: the vendored app shell and theme (read-only, see CONTRIBUTING).
- `src/dev/mockTauri.ts`: a fake back end and sample book for the browser preview.
- `src-tauri/`: the Rust side and the installer configuration.
