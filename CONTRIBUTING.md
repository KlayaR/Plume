# Contributing to Plume

Thank you for wanting to help. Plume is a writing tool first: changes should
make writing a book easier, calmer or better, and keep AI requests small.

## Get it running

You need Node.js 22 or newer, and for the desktop app Rust (stable) and the
[Tauri prerequisites for Windows](https://tauri.app/start/prerequisites/).

```bash
npm install
npm test               # core logic (vitest)
npm run dev:vite       # the interface in a browser
```

Open `http://localhost:5178/?mock`: a sample book and a fake `claude` let you
try everything without Tauri or a Claude subscription. In the browser console,
`window.__mockFiles` holds the book's files and `window.__lastClaude` the last
AI request (handy to check what a feature sends).

```bash
npm run dev            # the desktop app
npm run build          # release build and NSIS installer
```

## Before you open a pull request

```bash
npm test
npm run build:renderer   # type-check and build
npm run check            # French strings and version numbers
```

The CI runs the same on every pull request.

## House rules

- **Interface text** is English in the code, wrapped in `t('…')`. Every new
  phrase needs its French in `src/i18n.ts`; `npm run check` lists the missing ones.
- **Pure logic goes in `src/lib/`** with a test in `src/lib/core.test.ts`.
- **Keep diffs small.** Change what the task needs, match the style around it,
  and mention unrelated problems in the pull request instead of fixing them.
- **Don't edit `src/studio-kit/`.** It is a generated copy of StudioKit, a shared
  kit used by other apps; the build fails if it is edited. Plume's own look lives
  in `src/styles.css`, which overrides the kit.
- **AI requests stay lean.** New AI features go through `ask()` in `src/ai.ts`
  or the context engine, use the cheapest model that does the job, and say what
  they cost in the interface when it isn't trivial.
- **Prompts never include jailbreak text**, even from a persona a user supplies.
- **Books are the writer's files.** Never delete: move to `.plume/trash/`. Keep
  unknown front-matter keys. Write atomically.
- **Versions:** Plume is in 0.x until the "Road to 1.0" in ROADMAP.md is met:
  a bug-fix release bumps the last number (0.11.1), a feature release the
  middle one (0.12.0). A release bumps `package.json`, `src-tauri/tauri.conf.json` and
  `src-tauri/Cargo.toml` together and adds a section to `CHANGELOG.md`. You don't
  need to bump the version in a pull request; the maintainer does it on release.

## Reporting bugs and ideas

Use the issue templates. For a bug, say what you did, what you expected, what
happened, and your Plume and Windows versions. Don't attach your manuscript;
a few lines that reproduce the problem are enough.

## Releases (maintainer)

Add the version's section to `CHANGELOG.md`, bump the three version files,
commit, then tag and push: `git tag v0.12.0 && git push origin v0.12.0`. The
Release workflow builds the Windows installer and publishes a release (a
pre-release while Plume is in 0.x) with the changelog section.
