# Plume

Novel-writing desktop app (Tauri + React + StudioKit) with a story bible the AI
draws on automatically. AI calls go through the `claude` command line, signed
in with your Claude subscription. No API key.

Plan: [Plume — Roadmap](https://claude.ai/code/artifact/1bbb8ac1-8e0c-4a44-bed0-fcd2de1d195d) (0.2.0 → 0.9.0) ·
first spec: [Plume — Step 1 Spec](https://claude.ai/code/artifact/f1897651-066d-49a1-ae39-1357421b88be)

## What 0.2.6 adds
- **Scene · Chapter · Book** switch in the bottom bar, for both Sheet and Page:
  show the current scene, the whole chapter, or the whole book. In the book,
  each chapter starts on a new page and page numbers run on through the book;
  picking a scene in the tree goes to it.
- Drop cap two lines tall at any line spacing, held inside its paragraph (a
  one-line opening paragraph no longer pushes the next one aside).
- Less space above a chapter's opening on its first page.

## What 0.2.3 – 0.2.5 add
- Side panes pinned by default; clearer Write/Review and Sheet/Page switches.
- **Aa** panel in the bottom bar (font, size, spacing, justify the Sheet,
  paper, what shows above the text, page numbers); Settings in tabs.
- **Sheet shows the whole chapter**: one editor per scene, separated by * * *;
  the scene you click into is the active one (AI panel, counters).
- **Page view is a book view** of the whole chapter, read-only: real pages
  with margins, paragraphs split across pages (measured off-screen at the
  real page size, then shown scaled), chapter opening lower on its page,
  optional page numbers (not on the opening page). Double-click to edit.
  Page numbers count from 1 in each chapter for now.

## What 0.2.2 adds
- **A look after NEO** ([hughhowey/neo](https://github.com/hughhowey/neo), MIT): a
  dark room (#191919) with one paper sheet, a gold accent (#c9a86a; bronze in
  the light theme), Georgia and Bodoni drop caps, letter-spaced chapter heads.
- No sidebar: the **chapters** slide in from the left edge and the **Claude /
  Review** panel from the right edge on hover; pin either to keep it open. The
  Claude panel comes out on its own while a reply streams or waits.
- A thin **bottom bar**: back to the shelf, Write/Review, Sheet/Page, the
  Bible · Plan · Manuscript tabs, counters, plan limits, Claude status, Settings.
- The start screen is a **bookshelf**; Plan shows index cards on a mat.
- StudioKit's components are still used; Plume only overrides its colors in
  `src/styles.css`, so the other apps keep the Ardoise look.

## What 0.2.1 adds
- **Interface language**: Français / English in Settings (first launch follows
  Windows), separate from each book's language. Phrases are written in English
  in the code, wrapped in `t('…')`, and translated in `src/i18n.ts`. The shell's
  own labels come from StudioKit 2.1 (`setShellStrings`).
- **Paper** for Page view: Auto (ivory by day, night in the dark theme),
  ivory, white, sepia, night.
- **Spellcheck**: off while writing; Review turns on the Windows spellchecker
  (Review is now editable). New bible entries get headings in the book's language.

## What 0.2.0 adds
- Three spaces: **Bible**, **Plan** (scene cards; editable in 0.5.0), **Manuscript**.
- Manuscript **Write / Review** switch (Review: read-only text, words, signs,
  feuillets, sentences, dialogue share for the scene, chapter and book) and
  **Plain / Page** switch (paper at book size, justified, drop cap, chapter
  heading, approximate page count).
- **Typography** in Settings: Literata, EB Garamond, Crimson Pro, Courier
  Prime (bundled, offline), size, line spacing, text width, page size, zoom.
- **Enter, Enter, Enter**: at the end of a scene, Enter twice starts a new
  scene, once more a new chapter (with Undo).
- **Focus mode**: controls fade while you type.
- **Signs and feuillets** (1,500 signs) next to words.
- **Prologue / epilogue**: click a chapter's number in the tree; they step out
  of the numbering. Stored as `kind:` in `chapter.md`.

## What 0.1.0 does
- Books as plain folders of Markdown files, French or English per book.
- Bible: characters, places, objects, lore & rules, factions, story lines,
  themes, and a style guide. Aliases, short and full versions, links, facts
  limited to chapter ranges (`[ch 3–8]`, `[ch 12+]`).
- Scene editor: bible names underlined (hover for the short version),
  typography as you type (« », no-break spaces, —, …, ’).
- AI actions: Continue (Ctrl+Enter), Rewrite selection, Beats to prose. The
  reply streams in as a proposal: Accept (Tab), Retry, Discard (Esc).
- Context panel: the request's size before sending, the bible entries picked
  and why, drop any or switch it between short and full, preview the prompt.
- Status bar: real usage of the last call, today's calls, your 5-hour and
  weekly plan usage.

## Book folder
```
My Book/
  plume.json                 title, language, chapter and scene order, AI settings
  bible/style.md             style guide, always sent
  bible/<type>/<slug>.md     one entry per file
  manuscript/<chapter>/chapter.md
  manuscript/<chapter>/sc-<slug>.md
  .plume/trash/              removed scenes and entries (nothing is deleted)
```

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

## Develop
```bash
npm install
npm test              # core logic: files, name detection, context, typography
npm run dev           # the app (Tauri)
npm run build         # release + NSIS installer
```
`npm run dev:vite` then open `http://localhost:5178/?mock` to try the UI in a
browser with a sample book and a fake `claude` (`src/dev/mockTauri.ts`, dev only).

StudioKit is vendored in `src/studio-kit/`: never edit it here. Edit
`audio/StudioKit`, bump its `VERSION`, then `npm run sync-kit`.

## Next steps (planned)
2. Writing: style profile from your samples, POV awareness, scene summaries, snapshots, alternatives
3. Research & Bible AI: brainstorm chat, "turn into entries" with a review list, interview mode
4. Outline: structure templates, scene cards, pacing, story lines
5. Editing: structure, line and copy edits, tracked changes, beta readers, agent tasks, export
