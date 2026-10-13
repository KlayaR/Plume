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

## In progress (0.2.7, not yet type-checked or built)
Drop cap: after a one-line opening paragraph the next one wraps beside the
letter without indent (`dropcapMeasure` in `src/editor/cm.ts`, and in
`paginate` in `BookView.tsx`). Book name and back button at the top of the
chapters pane. Bottom bar: Bible/Plan/Manuscript as the main pill switch; the
manuscript switches quieter, in groups. Less space at scene breaks. Book
language in Settings → This book. Still to do: type-check, check in `?mock`,
bump to 0.2.7, build.
