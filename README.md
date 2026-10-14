# Plume

Novel-writing desktop app (Tauri + React + StudioKit) with a story bible the AI
draws on automatically. AI calls go through the `claude` command line, signed
in with your Claude subscription. No API key.

Plan: [Plume — Roadmap](https://claude.ai/code/artifact/1bbb8ac1-8e0c-4a44-bed0-fcd2de1d195d) (0.2.0 → 0.9.0) ·
first spec: [Plume — Step 1 Spec](https://claude.ai/code/artifact/f1897651-066d-49a1-ae39-1357421b88be)

## What 1.1.0 changes
**Bible, tuned for the AI**
- **AI check** (Bible tab): what makes the AI's context worse, found locally for free: entries without a short version, short versions over ~90 tokens, huge full versions, characters without a voice card, POV characters without "Knows / Doesn't know", entries that answer to the same name, short lower-case aliases that match ordinary words, entries that always appear together but aren't linked, names used in the text but missing from the bible. One-click fixes; "Write the missing short versions" does them all with Haiku.
- **Short versions written by Haiku** from the full text (button next to the field), with a token count on both versions.
- **Private notes** on every entry: kept in the file, never sent to the AI.
- **Fantasy entry types:** Magic & powers (how it works, the cost, limits), Creature (bestiary), Event or era. They are used by outlines and structure suggestions too.
- **New entry from the text** (Ctrl+Shift+B): select a name; Claude drafts the entry from the passages that mention it, you edit and add.
- Each entry shows where it first and last appears and in how many scenes it is the POV.

**Plan**
- Board: colour cards by POV, story line or tension; show only one POV or story line.
- Dashboard: "Needs attention" (empty scenes, scenes without POV, unplaced beats, unrated tension, outdated summaries that feed the AI's "story so far", next revision step).
- Tension: warns when a beat that usually peaks sits on a calm scene, or the reverse.
- Outline from a premise: untick scenes; a chapter with the same title as one of yours receives the scenes. A new book can start from a premise.
- **Ctrl+Z in the Plan** takes back the last card or chapter move. **Fixed:** dragging a card to another chapter used to lose its note, time, place, story lines, summary, tension and comments.

**Manuscript**
- Story time and place are editable in the scene header.
- Alternatives (x3) can show what changes against your text.
- Margin comments follow their text when you edit, and find the right repeat of a quote.
- "Who says what" jumps to the finding in whichever scene it is.
- Ctrl+/ lists every keyboard shortcut.

## What 1.0.1 adds (ideas taken from NEO)
- **Ctrl+Z right after an autocorrect** (smart quote, ellipsis, dash, capital) gives back exactly what you typed.
- **Automatic capitals** (Settings -> Writing, on by default): a sentence's first letter, and the English "I", as you type. Not after abbreviations (Mr., etc.), initials, ellipses, or ? and ! (a dialogue tag goes on in lower case).
- **Clean paste**: from Word, Google Docs or a web page, only italics and bold are kept, one paragraph per line, typography fixed for the book's language.
- **Front and back matter** (Settings -> This book): copyright, dedication, epigraph, acknowledgments, about the author. **Part pages**: type a part title on a chapter's column in Plan -> Board. Both are printed by every export (EPUB, Word, HTML, Markdown) and shown in Page view of the whole book (so also in the PDF).

## What 1.0.0 adds
- **Fantasy by default.** A new book starts with a fantasy preset (Settings -> Voice -> "Fantasy defaults"): deep point of view, the world shown through action, magic with a cost and a price, scenes that want something, no info-dumps, subtext in dialogue, no cliches. It sets the prompt, the scene rules, your measurable rules and two word lists (AI tics, fantasy cliches). Your tense, adult setting, voice description and taste are never overwritten; an older book gets it once on first open, and the Apply button redoes it.
- **Italics and bold** (Ctrl+I / Ctrl+B, stored as Markdown `*italic*` / `**bold**`): in the editor, Page view and every export.
- **Find and replace** across the whole book (Ctrl+Shift+F): case/accents, whole word, regular expressions, each scene keeps its old text in its history.
- **More reports** in Review: sticky sentences, vague words, alliteration, name spellings.
- **Reference books** (Settings -> Voice): add novels you admire (.epub, .docx, .md, .txt); Plume measures them on your computer, keeps only the numbers, and Review uses them as targets instead of its defaults.
- **Who says what** (Review): lines per character, words per line, voice-card tics, and where a character says something their card says they never say. Zero tokens.
- **Dashboard** (Plan -> Dashboard): chapter by chapter charts of any metric, with your average and your reference books' line; words by POV; scenes by status.
- **Quick actions** under the AI panel: Expand, Shorten, Show it, Sharpen dialogue (on the selection) and Describe (at the cursor).
- **Outline from a premise** (Plan -> Board) and **Synonyms in context** (Ctrl+Shift+Y, Haiku).
- **Tension curve** (Plan -> Structure): Claude rates each scene 0-10, click the chart to correct, structure beats drawn on top.
- **Snapshots** (... menu): name a copy of the whole book, compare it scene by scene, restore a scene.
- **Revision passes** (Plan -> Revision, and checkboxes in a scene's Notes): structure, line edit, proofread, with the next scene to do.
- Settings: **typewriter scrolling**, and **LanguageTool while writing** (off by default).
- **HTML export** for beta readers: one self-contained page, light/dark, with a table of contents.

## What 0.9.2 changes
- **Scrollbar:** the page area now ends where a pinned pane begins, so its scrollbar is no longer hidden behind the pane.
- **LanguageTool** in Review mode (Settings → Écriture → Orthographe et grammaire): spelling and grammar in the book's own language, French or English (US / UK / CA / AU). Underlines in the text (red spelling, blue grammar, yellow style); hover for the explanation, one-click fixes, "Add to dictionary" (per book) and "Ignore this rule". Bible names are never flagged. It uses the public server (free, about 20 checks a minute, the scene's text is sent to it), your own server (a local LanguageTool server keeps everything private) or your Premium key.
- **Why the Windows spellchecker used French:** it only knows the languages installed in Windows; the book's language is just a hint. It stays available as an option.
- **Read aloud** now uses only voices in the book's language, and says so when none is installed (Windows Settings → Time & language → Speech → Add voices) instead of reading English with a French voice.

## What 0.9.1 changes
- **Resizable panes:** drag the edge of the right (chat, Claude) or left pane; double-click the edge to reset. They never squeeze the page below 440 px.
- **Old brainstorms:** conversations are kept with the book (`.plume/chats.json`); the clock button lists them to reopen, rename or delete; the + button starts a new one. Each book opens on a fresh conversation.
- **Toolbar above the page** in the Manuscript (Write / Review, Sheet / Page, Scene / Chapter / Book, split, Aa); the bottom bar keeps counters, goals, usage and a ⋯ menu (agent tasks, export, quick tour). A short **quick tour** opens the first time.
- **Prompt library** lives in Plume's own data file (`prompts.json`) and each book keeps a copy of the prompts it uses, so it works on another computer.
- **Long books:** in the whole-book Sheet, scenes far from the screen are plain text until you scroll near them; Page view lays a long book out a few pages at a time; word counts are cached per scene (a 137,000-word test book: 522 pages in ~3 s).
- **Sync:** a file whose date changed but whose content did not (a cloud-sync tool) is no longer reported as a conflict.
- **Checks:** French passive voice now catches "a été vue" and ignores "était gris"; forms of être are no longer echoes; "[ch ?]" from Claude is dropped from imported facts.
- Agent tasks (file audit, web research) were checked against the real `claude` CLI.

## What 0.3.0 – 0.9.0 add
Built in one go from the roadmap; expect rough edges.

**0.3.0 Your voice.** Settings → Voice: a prompt library (yours, kept on this
computer, plus genre presets) with variables (`{book.tense}`, `{scene.pov}`,
`{list.AI-isms}`…), the book's tense, an adult-fiction line, scene rules, and
measurable rules. Every proposal gets a scorecard against those rules, with
"Retry fixing these" (zero tokens). Style profile measured from your excerpts
or finished scenes, and "Describe my voice" (one Sonnet call). New bible types:
word lists (banned from AI text) and excerpts of your prose (sent as examples,
matched to the kind of passage). Characters get a voice card (always sent with
them) and what they know / don't know (for POV scenes).

**0.4.0 Bible with AI.** A brainstorm chat in every space (right pane), aware of
the bible; "Turn into entries" drafts entries into a review list (accept, edit,
reject). Interview mode on an entry. Contradiction check. Unknown names in the
text get a dotted mark and "Add to bible?". Secret entries (never sent).
Appearance tracker, portraits, a map with pinned places, a relationship web.

**0.5.0 Plan.** A board of index cards that are the real scenes: drag cards and
chapters, loose ideas, zoom, an inspector (note, POV, status, story time, place,
story lines). Card notes show in grey in the manuscript and feed Beats to prose.
Structure templates with AI-suggested beats and a pacing view; a timeline from
story time and dated facts that flags time running backwards; a story-lines
tracker.

**0.6.0 Writing tools.** Darlings (Ctrl+Shift+D, restored to the exact spot),
placeholders ⟦…⟧ (Ctrl+Shift+X) with Fill with AI and red dots in the tree,
margin comments, split view, version history with a word diff, scene / chapter
/ book summaries (Haiku, redone only when the text changes, used as "story so
far"), alternatives ×3, "Learn from my choices", cheap mode.

**0.7.0 Review, after AutoCrit.** A score and reports by category (pacing,
dialogue, strong writing, word choice, repetition, readability) with targets,
highlights in the text and next / previous; most-used words; sentence rhythm.
On demand: voice check, continuity check, beta-reader personas, a line edit as
tracked changes (✓ / ✕ in the text). Read aloud with Windows voices.

**0.8.0 Library and safety.** Bookshelf with generated covers, word-goal
progress and one shelf per series; goals (daily, book), streak, word sprints,
30-day chart; a daily zip backup kept two weeks; safe sync (a file changed on
another computer is never overwritten: your version goes to a `.conflict`
copy, and a lock warns when the book is open elsewhere); import .docx / .md /
.txt with chapters and scene breaks detected; series with a shared bible and
facts dated per book (`[b2 ch 3+]`).

**0.9.0 Export and agent tasks.** EPUB (with a KDP-ready table of contents),
Word (book layout or submission format: French publishers or English
manuscript format), PDF printed from Page view, Markdown; placeholders removed
and typography fixed. Agent tasks with the estimated cost shown first:
whole-book continuity audit and structure edit through the summaries, a deep
audit that reads the files itself (read-only tools), web research with sources.

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

## Book folder, continued
`.plume/` also holds the chat, the review list, darlings, the taste log,
agent findings, version history (`history/<scene>/`) and the lock file. Backups
go to Plume's own folder on this computer (`%LOCALAPPDATA%`), not the book.
