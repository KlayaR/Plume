# Plume

Novel-writing desktop app: Tauri 2 + React 18 + TypeScript + Vite, zustand,
CodeMirror 6. AI through the `claude` CLI on the user's subscription. Read
README.md first (features, book folder format, how AI calls stay small).

## Working here
- `npm install`, `npm test` (vitest, core logic), `npx tsc --noEmit -p .`.
- Try the UI without Tauri: `npm run dev:vite`, open `http://localhost:5178/?mock`
  (sample book and a fake `claude`, `src/dev/mockTauri.ts`). In the mock,
  `window.__mockFiles` holds the book's files and `window.__lastClaude` the last request.
- The installer (`npm run build`, NSIS) is built on the user's Windows PC, not in the cloud.
- Interface text is English in the code, wrapped in `t('…')`; every new phrase
  needs its French in `src/i18n.ts`.

## Rules
- Every build with changes gets a new version: bump `package.json`,
  `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` together.
- Never edit `src/studio-kit/`: it is a generated copy of StudioKit (a separate
  repo on the user's PC); `npm run sync-kit` only works there.
- Plume's look (after NEO) is in `src/styles.css`, overriding the kit's colours.
- Never put jailbreak text from user-supplied personas into prompts.
- "What could we add / how could X be better" means: list proposals and wait for a choice.
- Keep diffs minimal and match the surrounding style.

## Where things are
- `src/lib/`: pure logic (types, files, context engine, analysis, review reports, voice, structures, export, zip); tested in `core.test.ts`.
- `src/*.ts` at the top: stores and AI tasks (`ai.ts` one-shot calls and cheap mode, `chat.ts`, `writing.ts`, `review.ts`, `library.ts`, `agents.ts`).
- `src/editor/marks.ts`: editor overlays (unknown names, placeholders, highlights, tracked changes).
- 0.3.0 – 0.9.0 were built in one pass (see README); the user tests and reports bugs next.
- 1.0.0 adds the fantasy defaults (`lib/defaults.ts`), find/replace (`lib/find.ts`), reference books (`lib/references.ts`), speakers (`lib/speakers.ts`), snapshots (`lib/snapshots.ts`), revision passes (`lib/revision.ts`) and the Dashboard, Tension, Outline, Synonym and Snapshots components.
