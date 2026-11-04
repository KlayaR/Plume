# Changelog

Every version of Plume, newest first. The release workflow copies a version's
section into its GitHub Release, so write it for readers, not for developers.

Plume stays below 1.0 until every feature works in daily use without known
bugs (see ROADMAP.md, "Road to 1.0"). Versions 0.10.0 – 0.11.0 were first
numbered 1.0.0 – 1.1.0 and renumbered on 2026-10-14.

## 0.42.0
Third of the six interface releases: one Plan.
- **Outline, Grid, Analysis.** Five tabs of the same outline become one: the Outline switches between Cards, List and Board. Structure moves under Analysis (web novels keep Arcs and Release beside it). In simple mode, Structure now comes with Show everything.
- **One Claude menu.** The five buttons above the outline are now a single menu: from a premise, revise, detail all, check, missing entries. What Claude does for one chapter or one scene stays on it.
- **The story lines can be clicked.** A square opens that chapter's scenes, to tick the ones that move the line; "By scene" shows every scene, and a click ticks it directly.

## 0.41.0
Second of the six interface releases: the Assistant.
- **One box, one main action.** The Assistant now opens on your direction and its button. Quick actions fold away, and the model, prompt, size and bible entries fold into one line: "Sonnet · Fantasy · ≈ 2,643 tokens · 5 entries". It turns orange when the bible goes over budget. Each fold stays as you left it.
- **A rewrite, change by change.** On a proposal that replaces text, "Change by change" puts each difference in the text with ✓ and ✕. Accept stays for taking it whole.
- **One proposal bar.** Accept, Retry and Discard stay above the page; the copy in the Assistant is gone.
- **Hidden panes show a small tab** on each edge of the page. Click it or hover the edge; pinning works as before.

## 0.40.0
The first of six releases that tidy the interface after 0.39 (the plan is in docs/UI_PLAN.md). Nothing about your books changes.
- **A screen that fails no longer leaves a blank window.** Plume says whether your text reached the disk and offers a way back to your books.
- **One View menu above the page.** Sheet or Page, Scene, Chapter or Book, font, size and paper are together; its button shows what you're looking at. It replaces the two switches and Aa.
- **Scene details are quieter.** POV, time, place and status show for the current scene only, and not at all in Book view (right-click a scene or use the Plan there).
- **Calmer bars.** Fewer lines, a quieter space switch, no text under 12px apart from book covers, and bigger click areas.
- **Moved:** Synonyms and New bible entry leave the toolbar. They stay on the selection (right-click, or the bar above it) and on Ctrl+Shift+Y and Ctrl+Shift+B.

## 0.39.1
- **French:** the Outline and the help now call a plan card a "carte" everywhere. Older labels and messages still said "fiche", which is the word for a bible entry.

## 0.39.0
**Writing**
- **Scratch pad (Ctrl+J).** Notes, tasks and an inbox for the whole book, open from any space. It stays with the book and is never sent to Claude. Any item can be pinned to the top or sent on: to the scene at the cursor, a new card, the loose ideas, the grid or a bible entry.
- **Capture lines.** While drafting, start a line with `::idea`, `::todo`, `::bible Name:` or `::comment` (`::idee`, `::tache`, `::fiche Nom :` and `::commentaire` work too) and press Enter. The line leaves the text and lands in the inbox, in your tasks or as a margin comment.
- **Draft mode.** A button in the bottom bar, or Ctrl+K. The text only goes forward: typing lands at the end, Backspace stays within the word (or is off altogether, in Settings → Manuscript), and undo and moving the cursor are off. Enter twice still starts a new scene, and Claude's proposals and capture lines still work. Typewriter sounds are optional. Esc leaves it.
- **Comments beside the text.** When there is room next to the sheet, comments sit in a column level with their passages, and those whose passage is gone are set apart at the bottom. Without the room they stay in the Margin tab.
- **Scenes not written yet show in place.** A scene with a card note or beats but no text shows them where it belongs in the manuscript, with **Write it**. They are never printed.
- **Fixed: a stray `* * *`.** Empty scenes no longer leave a scene break in page view and in print.

**The bible**
- **Fields per type of entry.** Add Age, Role or Home once and every entry of that type gets the row; you choose whether it goes to the AI. **More → Table** compares the entries of a type and edits them in place, and **Gallery** shows their portraits.
- **Links as you type.** `[[` in an entry links another entry, or makes a new one.
- **From entry to name and back.** Mentions now land on the name itself in the scene (click again for the next one), and Ctrl+click on a name in the text opens its entry, as does Open in its hover card.
- **Detect the name in the text.** A switch per entry, for a name that is also an ordinary word: no underline, and Claude only gets the entry when it is @-mentioned, always sent, the point of view or linked.
- **Earlier versions of an entry** (right-click it), one kept at most every ten minutes, and one click to restore.

**The plan**
- **An outline you can type.** Plan → Outline → List: Enter makes a new row, Tab and Shift+Tab change its level (chapter, scene, beat), Alt+Up and Alt+Down move it, Ctrl+Enter opens its note. A change that would lose text or notes is refused.
- **A free-form grid.** Plan → Grid: open sheets of tiles, sticky notes and titles, with lines between them, labels and arrows. A tile can stand for a scene or a bible entry (**Put on the grid**, in their menus), and removing the tile leaves them alone. Sheets stay with the book, are in your backups and are never sent to the AI.

**Everywhere**
- **Undo and redo in the Plan and the Bible.** Ctrl+Z and Ctrl+Y, outside text boxes, take back deletions, renames and changes as well as moves, until the book closes.
- **Snapshots hold the bible and the plan.** Compare a snapshot with the book as it is now and put back a scene, an entry or part of the plan. Older snapshots still work, with the scenes' text only.
- **Ctrl+K knows more.** The tabs of the Plan and the Bible are in it, the actions of the space you are in come first, and each action shows its shortcut. Ctrl+. on an action gives it a short name or a shortcut of your own; Ctrl+/ lists them all.
- **Export the bible or the outline on their own,** as Word or Markdown, from the ⋯ menu (now **Export…**), Ctrl+K, the Outline's ⋯ menu or an entry's right-click menu. Secret entries and private notes stay out unless you tick them. Portraits and the voice settings are left out.

## 0.38.0
- **Fix what's flagged, on text already written.** A new button in the Review panel, for the scene or the chapter (also in the chapter menu and Ctrl+K), asks Claude to fix what Plume measures: your rules, AI tells and every report well over its target. Until now this was only offered right after Claude had written something.
- **The fixes are safer.** Claude sends back only its replacements, so the rest of the scene can't move, and each one shows as a tracked change to accept or reject. A snapshot is taken first. A scene whose fixes would replace more than half of it, or change its length by more than 15 %, is left as written. The summary says how many points are flagged now and how many would remain once everything is accepted. "Fix them", after a chapter written straight in, now works the same way instead of replacing the text.
- **Claude knows where to look.** "Retry fixing" and the new button quote every occurrence of a tell, a long sentence or a passive (up to 30), and up to 12 places per report instead of 3, explained in the book's language.
- **Edit this chapter reads the measurements properly.** Claude now gets the passages behind them instead of a bare count like "AI tells: 3", and knows the French ", et il" and "comme on" habits.
- **Fixed: accepting a tracked change moved the others.** After you accepted one, the changes still waiting stayed at their old positions, so the next one you accepted could overwrite the wrong words. This affected Edit this chapter and Line edit too.
- **Fixed: false alarms in Name spellings.** A small word inside a bible name, such as "sous", made every "Sous" opening a sentence count as a misspelt name.

## 0.37.0
- **Scorecard: two more French habits.** The "AI tells" check now catches ", et il / et elle…" used again and again, a link copied from English, and comparisons in "comme on…" that keep coming back. A single use is never flagged, and "Retry fixing" tells Claude how to rewrite them.

## 0.36.0
**Plan: change the whole outline with one instruction**
- **Revise the outline…** (Plan → Outline) takes one instruction for the whole book: "add a chapter at the start, at court before the ball; move the duel to chapter 8; Marc dies in chapter 12, not 15". Claude adds, moves, rewrites or removes chapters and scenes, and fixes what follows from the change further on.
- What Claude proposes shows first as a list: the new chapter order, each new or changed chapter with its scenes (new, rewritten or moved from another chapter), and what it would delete. Untick what you don't want, then **Apply**. **Undo** puts the whole outline back as it was, and each changed chapter keeps an earlier version.
- Nothing you wrote is lost: written scenes keep their text (they can move or get a new card, never be deleted), locked cards stay as they are, and in a web novel published chapters are never changed or moved.

## 0.35.0
- **Bible: character ranks.** Give a character a rank (**Main, Secondary, Minor, Mentioned**) in its entry or by right-click, and the People list splits into those groups, with unranked characters last. The rank is only for you: it is never sent to the AI.

## 0.34.1
- **Plan:** fixing a spelling or grammar mistake from the LanguageTool card no longer closes the story, the series, a chapter or a scene you are editing.

## 0.34.0
**Web novels: write for Royal Road, chapter by chapter**
- A book can now be a **web novel** (New book → Kind of book, or Settings → This book). Chapters default to 2,000–3,500 words, one scene each, with no total word goal and no epilogue. Your books stay as they are.
- **Release schedule and buffer:** tick your release days; **Plan → Release** shows how many chapters are written ahead, the day the buffer runs out, the next release, this week's releases and how many weeks in a row you kept the schedule. The bottom bar shows the buffer, and the Dashboard warns when it drops under a week.
- **Copy for Royal Road** (Release, or right-click a chapter) puts the chapter on the clipboard the way Royal Road's editor takes it: paragraphs, italics, scene breaks, system boxes. **Copy the title** gives "Chapter 12: The Gate" for its own field.
- **Published chapters are canon:** **Mark as published** locks the chapter (read-only until **Edit anyway**), Claude is told never to contradict it, and its summary is brought up to date.
- **Hooks and endings:** each chapter has an opening hook, what it gives the reader and how it ends (Release or Outline). Claude writes a chapter's last scene to end on a pull to the next one, and **Check hooks with Claude** rates written chapters from their first 150 and last 200 words only.
- **Arcs and volumes** replace the single structure: start an arc on a chapter, give it a shape (web novel arc, progression arc, or any structure) and a planned length, and each beat says around which chapter it is due. Volumes group arcs.
- **Threads** (Plan → Analysis): the mysteries, promises and setups the reader waits on, where each was planted, last touched and paid off; one left untouched too long is flagged. **Find threads with Claude** reads your chapter summaries.
- **Memory for long serials:** Claude reads finished arcs as their summaries and the current arc chapter by chapter, so it stays consistent at chapter 300. Summaries now include one per arc.
- **Review for phones:** a **Walls of text** report (paragraphs over 80 words), and slightly looser targets for book habits web novel readers forgive (adverbs, filter words, tags…).
- **LitRPG and progression** (Settings → This book): lines starting with **|** are system windows, drawn as a box in the editor and exported as one (a table for Royal Road). Characters get **Stats** by chapter in the bible; right-click a status box to update them from it. Claude gets each character's stats as they stand at the chapter, and the Dashboard flags boxes that disagree.
- **A volume as a book:** Export → Chapters → a volume, numbered from 1, with your front and back matter and without "Previously…" recaps, as EPUB, Word, PDF… or **Make it a Plume book** beside the web novel, to revise for Kindle. Export can also take any range of chapters.

## 0.33.0
**Edit this chapter: check a whole chapter and fix what's wrong**
- One button (Review panel, chapter menu, Ctrl+K) for any chapter, written by you or by Claude. Choose **Polish** (language, repetition, clunky sentences, clichés, AI tells) or **Deep** (also continuity with the bible as true at that chapter, character voices against their voice cards, the chapter's plan, pacing and dialogue).
- Claude reads the chapter once and lists the real problems, each with the exact words, grouped into errors, what weakens the chapter, and finish. LanguageTool's spelling and grammar join the list when it is your checker, with its own corrections (no request needed). What Plume measures for free (your rules, the reports) is given to Claude as hints.
- Untick what you disagree with, then **Fix the ticked ones**: Claude fixes only those, in your voice, as tracked changes in the text. A small error becomes a few words; a passage that drags or a missed goal becomes a rewritten passage beside the old one. Accept or reject each with ✓ / ✕, Ctrl+Z works, and a snapshot is taken first.
- **Check again** shows what is left once you have gone through the changes.

## 0.32.0
**Series: Claude knows what comes next, without putting it in this book**
- **The series** (Plan → Outline, above The story, for books in a series): the series' arc and endgame, one line per book, and the big reveals with the book each belongs to. Saved in the series folder, so every book of the series shares it.
- Every outline request (Outline from a premise, Detail, Regenerate, scene cards, Check, Missing entries) reads it with a firm rule: this book tells only its own part; plant and foreshadow what comes later, never resolve, reveal or start later books' events.
- **Later in the series** on bible entries ("Book 3: she is the queen's daughter"): read when planning, so Claude can plant clues, never sent when Claude writes prose. Facts dated in later books ([b3 …]) work the same way. Missing entries fills it from the series plan.
- **Seeds for later books** on scene cards: the clues a scene plants for later books. Detail writes them; when Claude writes the scene, a seed goes in as a passing detail, never named or explained.
- **Check the outline** also flags seeds the series needs from this book that it never plants, and anything that resolves, reveals or starts too early what the series keeps for a later book.
- Books outside a series see none of this.

## 0.31.1
**"Mostly one scene" now means it**
- Claude split chapters into two scenes whenever the character changed place. A scene is now one unbroken stretch of time with one point of view: the character can walk from the ballroom to the garden inside it.
- With **Mostly one**, at least three chapters in four get exactly one scene; a second scene only for a jump in time or a change of point of view, never more than two.
- Your choice of scenes per chapter is kept with the book: Detail, Regenerate, scene cards and the outline check follow it too (they always assumed "mostly one" before).

## 0.31.0
**A richer story foundation: tone, shape, comparable books, a real magic system**
- Three new foundation fields (Plan → Outline → The story): **Subgenre and shape** (grimdark, epic…; one point of view or several; kind of ending; standalone or series), **Tone and limits** (mature, morally gray, dark humour; how much violence, sex and swearing) and **Comparable books** ("characters like Abercrombie, magic like Sanderson").
- **Magic system** replaces "Magic: limits and cost": source, rules, limits, cost, who can use it, how it shows, what it can't do. Propose writes it in full, with limits and costs that create conflict.
- Every outline request, the outline check and Missing entries read all of it. The **tone** also goes with every writing request; the comparable books never do, so the prose stays yours.
- **Check the outline** now also flags magic that solves a problem it was never set up to solve, limits that never cost anyone anything, and scenes or characters that break the tone.
- Characters drafted by **Missing entries** say what they are right and wrong about, and an antagonist gets a point the reader half agrees with.
- **Ask me questions** covers the new fields too. Each new field shows what it asks for when empty.

## 0.30.0
**Spelling and grammar everywhere you write**
- LanguageTool now checks every text box, not only the manuscript: bible entries (blocks, short version, voice card, facts, notes), the outline and its scene cards, Outline from a premise, chapter and scene titles, beats, notes, the chat, voice and style settings, front matter.
- Same underlines as in the manuscript (red spelling, blue grammar, yellow style). Hover one for the explanation and one-click fixes, Add to dictionary or Ignore this rule; a fix can be undone with Ctrl+Z.
- The box you type in is checked a moment after you pause. Names, aliases, tags, searches and keys are never sent.
- Choose LanguageTool in Settings → Writing → Spelling and grammar. The manuscript keeps its own rule (Review mode, or while you write if you turn that on).

## 0.29.0
**Bible entries from the outline**
- **Missing entries** (Plan → Outline bar): Claude reads the whole outline, the foundation, the turning points and the bible, lists every character, place, object, faction, creature, magic or past event the story uses but the bible lacks, then writes full entries for them: main characters one at a time, the rest three at a time, each knowing the whole story and the other new entries.
- A character comes with their part in the story, telling details, a personality with a contradiction and a flaw that matter to the plot, what they want and need, secrets, an arc tied to the turning points and chapters, relationships by name, a full voice card distinct from the others, what they know and don't at the start, and dated facts. Places, magic, objects and factions get what matters for writing them.
- Everything lands in **Bible → To review** to accept, edit or reject; nothing enters the bible on its own. **Stop** ends it after the entry being written.

## 0.28.0
**From an idea to a full outline**
- **The story** (top of Plan → Outline): your premise, the **foundation** (logline, what the protagonist wants and needs, antagonist and their plan, stakes, theme, the limits and cost of magic) and the book's **turning points** (three acts, hero's journey…). Fill them by hand, or **Ask me questions** (Claude interviews you in the chat) then **Propose**; both come back as proposals. Every outline request (from a premise, Detail, Regenerate, Check) now reads them, and *Outline from a premise* places each turning point in its chapter (shown as a badge).
- **Check the outline** goes further: setups never paid off and payoffs never set up, rising stakes, pace (quiet or action chapters in a row), consistency with the foundation. Each problem has a **Fix** button (Claude regenerates that chapter with the fix as direction, as a proposal).
- **Accept all** when several proposals wait; **+ Chapter** at the end of the Outline; **Move up / Move down** for a scene (across chapters at the ends).
- **Earlier versions:** every change Claude makes to a chapter keeps the outline it had. Chapter menu → *Earlier versions* → **Compare** shows one beside the current outline, to bring it back or not.
- **Clean outline** (⋯ in the Outline bar): chapters and scenes with no text go to the trash, written scenes keep their text and lose their cards, goals, endings and turning point notes are cleared. Each chapter's outline is kept as an earlier version; the foundation stays.
- **Fewer tabs:** Plan has Outline, Board, Structure and **Analysis** (Timeline, Story lines, Dashboard). Revision passes moved to Manuscript → Review (this scene's passes, progress, next scene, and the full table).

## 0.27.2
**Merging scenes gives one scene, not two side by side**
- After a merge, Claude rewrites the merged card as a single scene: one summary, the beats in order with no repeats, one arc. It comes back as a proposal (Accept / Reject); rejecting it keeps the plain merge. The written text is joined but never rewritten. A locked card isn't sent to Claude.

## 0.27.1
**A calmer Outline tab**
- Cards now read as text: title, one grey line (POV, place, time, words), the summary, the beats as a plain numbered list, and the other fields only when they're filled in. **Click a card to edit it** (one at a time; Done, Escape or a click elsewhere closes it).
- A chapter's goal and ending show as two lines under its title, editable on click.
- Buttons (Detail, write, lock, ⋯) appear when you point at a card; a locked card keeps its padlock in view.
- **Merge two scenes:** point between them and click **Merge these two scenes** (it's also in the right-click menu).
- Fix: beats were squeezed into narrow boxes.

## 0.27.0
**Plan → Outline: read the whole outline, change any part, keep Claude in check**
- **A new Outline tab**, first in the Plan (the Board stays for the cards): the whole outline on one page, chapter after chapter, every field editable in place. Each chapter has its **goal** and **how it ends**; each scene its summary, POV, place, story time, who is there, numbered **beats** (add, reorder, remove), what the reader learns, the arc and the pace. Search and fold chapters.
- **Two-pass outline:** *Outline from a premise* now proposes mostly one scene per chapter (or as each needs, or a range), with 2-to-3-sentence summaries; then **Detail** (a chapter, or **Detail all**) has Claude fill in the full cards, reading the chapters before it.
- **Regenerate…** a chapter or one card, with your direction ("darker", "Alice doesn't show up"). **Lock** a card and Claude leaves it alone.
- **Claude only proposes:** what it writes for the outline appears first beside what is there; **Accept** (with Undo) or **Reject**.
- **Merge** a scene with the next (outlines and texts), **split** a scene at a beat, **merge** a chapter with the next.
- **Check the outline:** Claude lists gaps, dropped threads, contradictions with the bible and chapters with no turn. **Copy** the outline as Markdown.
- Writing from the plan reads all of it: beats, who is there, what the reader learns, arc, pace, and the chapter's goal and ending.

## 0.26.0
**Fixes that use the Review report, and scenes that reach their length**
- **The scorecard under a proposal now includes the Review report:** the three reports furthest from their target (echoes, repeated phrases, adverbs…) are listed with your rules, for passages of 150 words or more. **Retry fixing** sends them back with a few exact quotes, and Claude changes only those sentences.
- **Repeated images:** Claude is told to use a striking image once (twice at most in a chapter) and to vary how comparisons are built. A new AI tell flags the same simile construction used again and again ("the way…", "comme si…").
- **Scenes written from the plan reach their length:** the length is now a minimum ("at least 3,000 words, up to about 4,500"). If a scene still comes out well short, Claude is asked once to carry it on to its end, in the same proposal.
- **Chapters written from the plan are checked too:** each scene gets the scorecard after it's written; if some miss your rules or targets, the message offers **Fix them**, which fixes only what failed, scene by scene.

## 0.25.1
**Fix: removing entries and scenes**
- Removing an entry or a scene whose file was missing on disk (never saved, or moved outside Plume) silently did nothing. It now removes it from the book; there's simply nothing to put in the trash.
- When moving to the trash really fails, Plume now says why instead of doing nothing.

## 0.25.0
**How a chapter is built**
- **Writing from the plan follows the craft of a chapter:** a concrete, immediate goal for the point-of-view character (not the big quest); every attempt complicates things ("yes, but…" / "no, and what's more…"); the world shown through action, never in a pause to explain it. The scene that opens a chapter is anchored at once in the now (no waking up, no recap); the one that ends it lands on a turn or a question for the next chapter, not a mid-action cliffhanger or a summary. Scenes in between end where they turn.
- **Outline from a premise** gives each chapter its **goal** and its **ending** (the turn or question it lands on). They are written into the notes of the chapter's first and last scenes, where writing from the plan reads them.

## 0.24.0
**Write from the plan**
- **Write a scene from its plan card:** right-click a card (Plan) or a scene (Manuscript) → **Write it from the plan**, or **From the plan** in the Assistant, or Ctrl+K. Claude writes the scene (or the rest of it) from the card's note, POV, time and place, with the scenes around it for continuity; it arrives as a proposal to accept or discard.
- **Write a whole chapter:** right-click a chapter → **Write the chapter from the plan**. Every empty scene that has a note is written in order, straight into the chapter, each one reading the end of the one before. Scenes with text are left alone, a snapshot is taken first, and Stop works between scenes.
- **Usual chapter length** (Settings → This book), 3,000 to 4,500 words by default: a guide, not a rule. A one-scene chapter gets the whole range; with several scenes it is shared between them, and Claude may write shorter or longer when the scene needs it.
- Text written this way counts as Claude's, so it is never used as a sample of your voice.

## 0.23.0
**Scenes stay in their lane, and outlines that breathe**
- **Claude writes only the scene you're in.** Continue, Beats to prose, Describe and Fill now see the scenes on either side: how the previous one ends (or its plan note), and what the next one is about. Continuity comes from them, but Claude is told that the next scene's events, characters and revelations don't happen yet, and to stop once the scene reaches what its note says. Beats to prose writes only the beats given and stops after the last one.
- **Outline from a premise:** Claude now gets the rules of a scene (one place, one stretch of time, one point of view; something changes; action then reaction; usual lengths) and the number of scenes per chapter follows what each chapter needs, instead of three everywhere. You can still set a range ("between 1 and 4"). New: **Book length** (your book goal by default), and each card comes with its **point of view and place**, set on the card when the bible knows them.

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
