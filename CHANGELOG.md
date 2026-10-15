# Changelog

Every version of Plume, newest first. The release workflow copies a version's
section into its GitHub Release, so write it for readers, not for developers.

Plume stays below 1.0 until every feature works in daily use without known
bugs (see ROADMAP.md, "Road to 1.0"). Versions 0.10.0 – 0.11.0 were first
numbered 1.0.0 – 1.1.0 and renumbered on 2026-10-14.

## 0.22.2
**Fix: drafted entries land in the right fields**
- Entries drafted with **Turn into entries** now come in **blocks** (Appearance, Personality, History… the headings of their type), not one long text. For characters, the **voice card** and **Knows / Doesn't know** are filled too, and shown in To review before you accept.
- The chat writes characters' voice (register, tics, sample lines…) when it creates them.
- **Bible → AI check** spots entries whose full version is a "**Label:** text" list in one block, with **Split into blocks** (one entry or all at once) to repair those already accepted.

## 0.22.1
**Fix: the bible chat makes entries again**
- Asked to create entries, the brainstorming chat answered that it couldn't. It now writes them out in full (and draws on the published canon when your book continues or is set in an existing work), then points you to **Turn into entries**.
- **Turn into entries** now keeps the full detail of entries Claude wrote at your request, and no longer drafts "additions" to existing entries that bring nothing new. When there's nothing to draft, it says so instead of making thin drafts.

## 0.22.0
**Better prose for fewer tokens**
- **The prompt cache now works across requests.** Your rules, your prompt, your style guide and samples of your voice form a system prompt that stays the same in every scene, so it is served from the cache (about a tenth of the price) instead of being written again. The bible entries, which change with the passage, now travel with the story and the task. Scene details (POV, title, chapter) in your prompts are said with the task, not in the cached part.
- **Samples of your own prose with every request:** your excerpts, then passages of your revised or done scenes that Claude wrote little of (up to about 1,100 words, from other chapters than the one you're writing). Plume now counts the words you accept from Claude in each scene; right-click a scene → **Sample of my voice** to include or leave one out. The excerpt "kind" setting is gone: every excerpt is sent.
- **"Retry fixing" fixes only what failed:** it sends back the proposal and the failed points (no bible, no story again) and changes only those sentences, keeping the rest word for word.
- **AI tells in the scorecard:** "not X, but Y" contrasts used as a habit, em dashes in the middle of sentences, three sentences in a row starting with the same word, lists of three again and again. Checked on your computer, no tokens.
- **OpenRouter:** Claude models there now cache the system prompt too.

## 0.21.0
**Daily comfort** (UX plan, phase 5, the last one)
- **Open where you stopped:** a book reopens on the scene and at the cursor where you left it. The start screen has a **Today** strip with your last book, its progress, your last session, and **Continue writing**.
- **After a session**, one line: "640 words in 52 minutes".
- **Ctrl+K runs actions too:** Export, New chapter, Snapshots, Find and replace, Review mode, Settings → Voice, Help, and more.
- **Distraction-free mode (F11):** only the page. "Dim the rest" greys every paragraph but the one you are writing.
- **Saved directions:** what you ask the Assistant comes back as chips above its box; right-click a chip to pin or remove it.
- **After Accept**, the new text glows softly for a few seconds, and one Ctrl+Z takes the whole proposal back.
- **Cost as a share of your 5-hour window** (experimental): Review's Claude checks say "about 3 % of your 5-hour window" once Plume has seen enough of your calls to estimate it; until then they show tokens.
- **Comfort:** Ctrl + / Ctrl − / Ctrl 0 change the text size; a new **Candle** paper (dark and warm); in a narrow window the panes slide over the page instead of squeezing it; the Plan and the Bible come back scrolled where you left them.
- **Example book:** New book → "Open an example book" makes a short book (bible, plan, three scenes) in French or English to try Plume on.

## 0.20.0
**Voice, Review, Settings and a simpler start** (UX plan, phase 4)
- **Settings → Voice in three steps:** 1. Your voice (tense, adult fiction, fantasy defaults, then your voice materials), 2. Your rules, 3. Your prompt. Scene rules, the style profile and reference books are under Advanced.
- **Review opens on the three reports worth a look first** (furthest above their target). **All reports** shows every category, readability and Who says what. The Claude checks keep their own section.
- **Settings → Writing:** the LanguageTool server, Premium account and connection test are folded under **Advanced connections**.
- **Beginner mode for new installs:** the Plan shows Board and Structure, the bible hides its More tab, and Review shows only the top reports. **Show everything** (at the end of each tab bar, or Settings → Appearance) brings everything back. If you already used Plume, nothing is hidden.

## 0.19.0
**A simpler bible** (UX plan, phase 3)
- **Five families** in the bible list: People, Places, Things (objects, creatures), Lore (lore and rules, magic, events, factions, themes) and Story lines. Click a family to fold it; the New entry menu is grouped the same way. Nothing changes on disk.
- **Advanced fold** in each entry: tags, links, facts, private notes and, for characters, the voice card and Knows / Doesn't know. The form now opens on what matters most (name, aliases, sent to the AI, short and full versions). Plume remembers, per entry type, if you leave it open.
- **Your voice materials** (style guide, word lists, excerpts of your prose) moved to Settings → Voice. They stay in the book's bible folder, so `{list.…}` in prompts and banned words keep working.
- **Bible tabs:** Entries, To review, AI check and More (Presence, the former Tracker, Map, Relations, Contradictions).

## 0.18.0
**One way to do each thing** (UX plan, phase 2)
- **Choosing the AI is the same everywhere:** under the Assistant and under the Chat, first which AI answers (Claude command line or OpenRouter), then the model. The per-action model rows in Settings → This book are gone (the effort per action stays). Settings → Claude now lists **your OpenRouter models**: the short list offered when you pick OpenRouter.
- **A bar above selected text** with Rewrite, Shorten, Expand, Show it, Comment, Synonyms and "…" for the full menu. It can be turned off in Settings → Writing.
- **One second view:** the old split view (a scene or entry squeezed beside the text) is gone; the toolbar button now opens the Bible beside the text, in the same second view as the bottom-bar button. Reading another scene beside the one you write is no longer possible; say if you miss it.

## 0.17.0
**Trust and clarity** (first part of the UX plan, `docs/UX_PLAN.md`)
- **Saved indicator** in the bottom bar: "Saved", "Saving…", or "Not saved: retry" when a write failed (click to try again).
- **Undo after deleting** a scene, a chapter or a bible entry: the toast that confirms it has an Undo button for ten seconds. Chapters can now be deleted from their right-click menu.
- **Where you are:** Book › Chapter › Scene at the left of the toolbar, with arrows to the previous and next scene. **Ctrl+PageUp / PageDown** go to the previous / next scene; **Alt+Left / Alt+Right** go back and forward through the scenes and entries you opened.
- **Easier to discover:** a one-time card with the three things nobody guesses (right-click, Ctrl+K, Tab/Esc on a proposal); delete buttons are visible instead of appearing only on hover; an empty bible and an empty plan say what to do first.
- **Clearer words:** the Notes tab is now **Margin**; in French the world map is "carte du monde" so it isn't confused with plan cards. The words used everywhere are listed in `docs/VOCABULARY.md`.

## 0.16.0
- **Help (F1, or the ... menu):** how to use Plume, by topic, with a search box, in French and English: starting, writing, asking Claude, the chat, the bible, the plan, review, export and safety, Claude and OpenRouter. It links to the quick tour and the shortcuts.
- **Proposals are easier to find and decide:** when Claude proposes text, a small bar appears next to the text with **Accept (Tab)**, **Retry** and **Discard (Esc)**, and the Assistant tab opens on its own (before, the buttons stayed hidden if you were on the Chat or Notes tab, which made the text look locked).

## 0.15.1
- Releases are now built on the maintainer's PC and published with `npm run release` (faster than GitHub's build). The GitHub workflow stays as a backup and does nothing when a release already has its installer. No change in the app itself.

## 0.15.0
**Right-click menus everywhere** (Plume's own, instead of the web view's Back / Reload / Inspect; text fields keep the system menu, and Shift + right-click always gives it).
- **In the text:** Cut, Copy, Paste, Paste as plain text, Select all; Italic, Bold; **Ask Claude** (Rewrite, Expand, Shorten, Show it, Sharpen dialogue, Synonyms on a selection; Continue from here and Describe here without one); Comment on this, Cut to the darlings drawer, Drop a placeholder, Read aloud, Search the book for this, New bible entry from this. On a **bible name:** Open it, Open it beside, Add the selection as an alias. On a **name the bible doesn't know:** Add it to the bible as (any type), Ignore. On a **margin comment:** Show it in Notes, Delete it. During a **proposal:** Accept, Retry, Discard. (In Review with the Windows spellchecker, the system menu stays, for its spelling suggestions.)
- **Scene list and plan cards:** Write it, Rename, Status, Point of view, Story lines (cards), Move to chapter, New scene after, Duplicate, Remove. **Chapters:** New scene, Rename, Kind, Start a part here, Move up or down, **Delete the chapter** (new). Empty space: New chapter, New idea.
- **Bible:** on an entry: Open (also in the second pane), Sent to the AI, Add or remove a tag, Share with the series, Duplicate, Remove; on a heading: New entry; on a block: what the AI may read, Move, Duplicate, Delete.
- **Chat messages:** Copy, Insert in the manuscript, Turn into entries, Delete the message. **Page view paragraphs:** Edit, Go to the scene.

## 0.14.2
- **Icon:** the gold quill is larger and has no dark square behind it, so it fills its space like other apps' icons on the Windows taskbar and Start menu.

## 0.14.1
- **The brainstorm chat has two choices under the input:** first which AI answers (Claude command line, or OpenRouter), then the model (Haiku, Sonnet or Opus for Claude; for OpenRouter your saved models plus "Search all models"). This replaces the single preset list there.

## 0.14.0
**Modular bible entries**
- An entry's full text is now a stack of **blocks** (Appearance, Personality, Secrets, History… whatever you need): add, rename, reorder, delete. Each block has its own switch for the AI: **always sent** (travels with the short version), **with the full entry** (default), or **never sent** (a secret stays in your file but the AI never reads it, in the AI panel, the chat, the checks and the contradiction search). "Edit as text" shows the same content as Markdown with ### headings, so existing entries and files work unchanged.
- **Tags** on entries, with filter chips above the bible list; search also looks in tags.
- Without a short version, the AI now gets the first block that has text instead of a bare heading.

**Two views side by side**
- The button next to the menu (top right of the bottom bar) shows **Bible, Plan or Manuscript beside** the current view, with a draggable divider; swap or close from the second pane's header. Ctrl+K and "Add to the bible" open the entry in the second pane when the Bible is there, instead of leaving your manuscript.

## 0.13.0
- **Choose the model in the brainstorm chat:** a preset list under the chat input (Claude or OpenRouter models), and a note of which one answered last. The choice is remembered.
- **Ctrl+K:** type a few letters and open any scene or bible entry.
- **New icon:** a gold quill on the dark background, replacing the blue StudioKit one.
- The bottom bar shows "OpenRouter" when the last answer came from there.

## 0.12.0
**Other models, and model presets**
- **OpenRouter** (Settings -> Claude): add your OpenRouter key and Plume can use hundreds of other models, or keep you writing when your Claude plan runs out. "Use OpenRouter": Never, **When Claude runs out** (the request that failed because of the usage limit is repeated on your fallback model, with a notice; and once the plan's window is full, requests go straight there), or Always. The key stays on your computer, never in a book. "Test" checks it and shows your remaining credit.
- **Model presets:** a preset is a named choice of model and effort ("Quick", "Writing", "Deep" to start with). The AI panel and Settings -> This book now show one short list of presets instead of a model list plus an effort list. Add your own Claude presets, or **OpenRouter models picked from a searchable list** (462 at the time of writing, with context size and price) so you never scroll the whole list again.
- Agent tasks that read files still need the Claude command line; everything else (continue, rewrite, quick actions, chat, summaries, checks) can run on OpenRouter.

**Tested and fixed**
- The whole app was walked through (every tab, dialog and export, find and replace, comments, moving cards between chapters, chat, the AI panel) with no errors found. Two small fixes: the HTML export format showed in English in the French interface, and front matter pages (dedication, epigraph) showed a page number in Page view.

## 0.11.0
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

## 0.10.1 — ideas taken from NEO
- **Ctrl+Z right after an autocorrect** (smart quote, ellipsis, dash, capital) gives back exactly what you typed.
- **Automatic capitals** (Settings -> Writing, on by default): a sentence's first letter, and the English "I", as you type. Not after abbreviations (Mr., etc.), initials, ellipses, or ? and ! (a dialogue tag goes on in lower case).
- **Clean paste**: from Word, Google Docs or a web page, only italics and bold are kept, one paragraph per line, typography fixed for the book's language.
- **Front and back matter** (Settings -> This book): copyright, dedication, epigraph, acknowledgments, about the author. **Part pages**: type a part title on a chapter's column in Plan -> Board. Both are printed by every export (EPUB, Word, HTML, Markdown) and shown in Page view of the whole book (so also in the PDF).

## 0.10.0
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

## 0.9.2
- **Scrollbar:** the page area now ends where a pinned pane begins, so its scrollbar is no longer hidden behind the pane.
- **LanguageTool** in Review mode (Settings → Écriture → Orthographe et grammaire): spelling and grammar in the book's own language, French or English (US / UK / CA / AU). Underlines in the text (red spelling, blue grammar, yellow style); hover for the explanation, one-click fixes, "Add to dictionary" (per book) and "Ignore this rule". Bible names are never flagged. It uses the public server (free, about 20 checks a minute, the scene's text is sent to it), your own server (a local LanguageTool server keeps everything private) or your Premium key.
- **Why the Windows spellchecker used French:** it only knows the languages installed in Windows; the book's language is just a hint. It stays available as an option.
- **Read aloud** now uses only voices in the book's language, and says so when none is installed (Windows Settings → Time & language → Speech → Add voices) instead of reading English with a French voice.

## 0.9.1
- **Resizable panes:** drag the edge of the right (chat, Claude) or left pane; double-click the edge to reset. They never squeeze the page below 440 px.
- **Old brainstorms:** conversations are kept with the book (`.plume/chats.json`); the clock button lists them to reopen, rename or delete; the + button starts a new one. Each book opens on a fresh conversation.
- **Toolbar above the page** in the Manuscript (Write / Review, Sheet / Page, Scene / Chapter / Book, split, Aa); the bottom bar keeps counters, goals, usage and a ⋯ menu (agent tasks, export, quick tour). A short **quick tour** opens the first time.
- **Prompt library** lives in Plume's own data file (`prompts.json`) and each book keeps a copy of the prompts it uses, so it works on another computer.
- **Long books:** in the whole-book Sheet, scenes far from the screen are plain text until you scroll near them; Page view lays a long book out a few pages at a time; word counts are cached per scene (a 137,000-word test book: 522 pages in ~3 s).
- **Sync:** a file whose date changed but whose content did not (a cloud-sync tool) is no longer reported as a conflict.
- **Checks:** French passive voice now catches "a été vue" and ignores "était gris"; forms of être are no longer echoes; "[ch ?]" from Claude is dropped from imported facts.
- Agent tasks (file audit, web research) were checked against the real `claude` CLI.

## 0.3.0 – 0.9.0
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

## 0.2.6
- **Scene · Chapter · Book** switch in the bottom bar, for both Sheet and Page:
  show the current scene, the whole chapter, or the whole book. In the book,
  each chapter starts on a new page and page numbers run on through the book;
  picking a scene in the tree goes to it.
- Drop cap two lines tall at any line spacing, held inside its paragraph (a
  one-line opening paragraph no longer pushes the next one aside).
- Less space above a chapter's opening on its first page.

## 0.2.3 – 0.2.5
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

## 0.2.2
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

## 0.2.1
- **Interface language**: Français / English in Settings (first launch follows
  Windows), separate from each book's language. Phrases are written in English
  in the code, wrapped in `t('…')`, and translated in `src/i18n.ts`. The shell's
  own labels come from StudioKit 2.1 (`setShellStrings`).
- **Paper** for Page view: Auto (ivory by day, night in the dark theme),
  ivory, white, sepia, night.
- **Spellcheck**: off while writing; Review turns on the Windows spellchecker
  (Review is now editable). New bible entries get headings in the book's language.

## 0.2.0
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

## 0.1.0
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
