# Plume, for coding agents

Novel-writing desktop app: Tauri 2 + React 18 + TypeScript + Vite, zustand,
CodeMirror 6. AI through the user's own `claude` CLI. Read `README.md`, then
`docs/ARCHITECTURE.md` (book folder format, how AI calls stay small, where
things are) and `CONTRIBUTING.md` (house rules).

## Working here
- `npm install`, `npm test` (vitest, core logic), `npm run build:renderer`
  (type-check and build), `npm run check` (French strings, versions).
- Try the UI without Tauri: `npm run dev:vite`, open `http://localhost:5178/?mock`
  (sample book and a fake `claude`, `src/dev/mockTauri.ts`). In the mock,
  `window.__mockFiles` holds the book's files and `window.__lastClaude` the last request.
- Interface text is English in the code, wrapped in `t('…')`; every new phrase
  needs its French in `src/i18n.ts`.

## Rules
- Never edit `src/studio-kit/` (a generated copy; the build checks it). Plume's
  look is in `src/styles.css`.
- Pure logic in `src/lib/`, tested in `src/lib/core.test.ts`.
- Keep diffs minimal and match the surrounding style.
- Never put jailbreak text from user-supplied personas into prompts.
- Never delete a writer's files: move them to `.plume/trash/`.
- A release bumps `package.json`, `src-tauri/tauri.conf.json` and
  `src-tauri/Cargo.toml` together and adds a `CHANGELOG.md` section.
