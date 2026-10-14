# UX plan: simpler, calmer, more intuitive

Written after 0.16.0, from the UX review and the "make it pleasant" ideas.
Nothing here changes how books are stored: every phase keeps files compatible,
and nothing the writer made is deleted. Each phase is one release, built with
`npm run release`, and each ends with a checklist the maintainer tries in the
installed app.

## Principles
1. **One place for each thing.** If a choice exists in two screens, keep one.
2. **Show, don't hide.** A feature the writer can't see doesn't exist. Hints,
   visible buttons, and a command palette over memorised keys.
3. **Advanced behind a fold.** The first view of any screen answers "what do I
   do now?"; the rest is one click away.
4. **Trust.** Always say whether the work is saved; every deletion can be undone.
5. **Same words everywhere.** One vocabulary in French and English, in the app,
   the help and the docs.

## Phase 1: Trust and clarity (0.17.0)
| # | What | How | Size |
|---|------|-----|------|
| 1.1 | **Saved indicator** in the bottom bar: "Saved", "Saving…", or "Not saved: <reason>" with a retry | `store.ts` knows the pending write queue (`later`) and failures (`fail`); `BottomBar.tsx` shows it; failure keeps a toast | S |
| 1.2 | **Undo after deleting** a scene, chapter or entry: a toast with "Undo" for ~10 s | Keep the deleted files' text in memory for the toast's life; Undo writes them back and restores the state (scene order, chapter folder). Trash copy stays either way | M |
| 1.3 | **Visible hints**: delete buttons shown (dim) instead of hover-only; three first-use tips (right-click menus, Ctrl+K, Tab/Esc on a proposal), each once, with "Got it" | `prefs.seen` list; small `Tip` component anchored to its control | S |
| 1.4 | **Empty states** that say what to do next: empty bible, plan, chat, review, notes | Short text + one primary button per screen | S |
| 1.5 | **Vocabulary pass** (FR + EN): one word per concept (entry / card / scene / note), "Notes" tab renamed to what it holds, labels as short verbs | List of terms in `docs/VOCABULARY.md`; update `i18n.ts`, help text, README | M |
| 1.6 | **Breadcrumb** (Book › Chapter › Scene) at the top of the Manuscript; **Ctrl+PageUp/PageDown** for previous/next scene; **Alt+Left/Right** to go back/forward after a Ctrl+K or bible jump | A small history stack in the store (`selectScene`, `showEntry`) | M |

**Check:** delete a scene, a chapter and an entry and undo each; turn off the disk
(read-only folder) and see "Not saved"; clear tips and see them once.

## Phase 2: One way to do each thing (0.18.0)
| # | What | How | Size |
|---|------|-----|------|
| 2.1 | **One model selector**, two steps (backend, then model), used in the Assistant and the Chat; presets live only in Settings → Claude (renamed "Models") | New `ModelChoice` component replaces `PresetSelect` in `ContextPanel` and `BackendModelSelect`; Settings → This book "AI for this book" rows become one default plus a "Per action" fold; existing per-action presets are kept as overrides | M |
| 2.2 | **Remove the old split view**, keep the second view | Migrate `prefs.split` to `prefs.dual` where it held a scene or entry; delete `SplitPane`, the toolbar button and its strings | M |
| 2.3 | **Floating bar on selected text** (Rewrite, Shorten, Expand, Comment, Synonyms, more…) | CodeMirror tooltip extension; reuses the actions of `editorMenu` | M |
| 2.4 | **Same place, same behaviour for Status / POV / time / place**: keep the header above the text and the right-click menu; keep the Plan inspector but make it use the same components | One `SceneFields` component used by header and inspector | S |

**Check:** change the model in the Assistant and in the Chat and see both remember; old
books open with their per-action presets; the second view still works after the split removal.

## Phase 3: Bible simplified (0.19.0)
| # | What | How | Size |
|---|------|-----|------|
| 3.1 | **Five entry families** in the list (People, Places, Things, Lore, Story lines), collapsible; the "New entry" menu is grouped the same way | Mapping type → family in `lib/types.ts`; types and folders on disk don't change | S |
| 3.2 | **Voice materials leave the bible list**: word lists, excerpts and the style guide move to Settings → Voice ("Your voice materials") | Reuse `EntryEditor` inside Voice settings; files stay in `bible/` so prompts (`{list.Name}`) and exports keep working | L |
| 3.3 | **Entry form: Advanced fold** (Links, Facts, Voice card, Knows/Doesn't know, Tags); visible: name, type, short, blocks, Sent to the AI, aliases | `EntryEditor` sections; fold state remembered per type | M |
| 3.4 | **Bible tabs**: Entries, To review, AI check, and "More" (Presence, Map, Relations, Contradictions) | `BibleView` tabs | S |

**Check:** a book with every entry type shows the same data as before; prompts that use
`{list.…}` still expand; word lists still ban words.

## Phase 4: Voice, Review, Settings, beginner mode (0.20.0)
| # | What | How | Size |
|---|------|-----|------|
| 4.1 | **Voice settings in three steps**: Your voice (excerpts, description), Your rules, Your prompt; the rest under Advanced | Re-layout `VoiceSettings.tsx`; no data change | M |
| 4.2 | **Review starts with the score and the top 3 problems**; "All reports" expands the full list; AI checks in their own section | `ReviewPanel.tsx` ranking by distance from target | M |
| 4.3 | **Settings: "Advanced connections" fold** for LanguageTool server/user/key and spell engine details; OpenRouter key stays visible | `SettingsView.tsx` | S |
| 4.4 | **Beginner mode** (`prefs.simple`): hides Plan's Timeline / Story lines / Revision / Dashboard, Review's secondary reports and the Bible's More tab until the writer turns on "Show everything". New installs start in beginner mode; existing installs keep everything | One flag read by the tab lists; a switch in Settings → Appearance | M |

**Check:** with beginner mode on, a new writer can write, ask Claude and use the bible
without opening Plan; turning it off restores every tab.

## Phase 5: Daily comfort (0.21.0)
| # | What | How | Size |
|---|------|-----|------|
| 5.1 | **Open where you stopped** (book, scene, cursor) and a **"Today" strip**: goal progress and a "Continue writing" button | Save last scene and cursor in prefs per book; strip in the start screen and bottom bar | M |
| 5.2 | **Command palette**: Ctrl+K also runs actions (Export, New chapter, Take a snapshot, Open Review, Settings pages) | Action registry; `QuickJump` ranks scenes, entries and actions together | M |
| 5.3 | **Distraction-free mode** (F11): hides panes and bars, keeps the page and typewriter scrolling; optional "dim all but the current paragraph" | `body` class + CodeMirror decoration | M |
| 5.4 | **After a session**: one line ("640 words in 52 minutes") | Uses the daily-progress record in `library.ts` | S |
| 5.5 | **Remembered layout** per space (pane widths, second view, scroll) | Extend prefs; restore on view switch | S |
| 5.6 | **Saved directions**: recent instructions as chips, pin favourites | `prefs.directions`; chips above the instruction box | S |
| 5.7 | **After Accept**, the new text stays softly highlighted for a few seconds; one Ctrl+Z reverts the whole proposal | Check `acceptProposal` is a single transaction; add a fading decoration | S |
| 5.8 | **Cost as a share of your window** next to heavy actions ("about 3% of your 5-hour window") | Learn tokens per % from the `limits` change after each call; show only when confident. Experimental; falls back to tokens | M |
| 5.9 | **Comfort**: font size shortcuts (Ctrl +/−), a warmer paper theme, narrow windows turn panes into overlays | CSS + prefs | M |
| 5.10 | **Example book** in the new-book dialog (short bible, plan, scenes) | Ship the mock book as a template under `src/dev/example` (not dev-only) | M |

**Check:** close and reopen the app, and land on the same scene and cursor; run an action from the
palette; use the app at a laptop-sized window.

## Every phase
- **Tests:** pure logic in `src/lib/` with tests in `core.test.ts` (history stack, family mapping,
  ranking, migration of prefs).
- **French and English:** every new phrase in `i18n.ts`; `npm run check` must pass.
- **Help (F1)** and the shortcuts sheet updated in the same release.
- **Release:** version bump, `CHANGELOG.md` section, `npm run release`.
- **Verification:** walked through in the browser preview (every changed screen, in French),
  then the installed app by the maintainer with the phase's checklist.

## Decisions needed
1. **Beginner mode (4.4):** default for new installs only (proposed), or off for everyone?
2. **Old split view (2.2):** remove it (proposed) or keep both?
3. **Voice materials (3.2):** move them to Settings → Voice (proposed). It's the largest change; do it after the others if you want to wait.
4. **Cost as a share of the window (5.8):** worth building, or leave tokens?
5. **Order:** as above (trust, one way, bible, voice/review/settings, comfort), or comfort first?

## Not doing
- Better Shorten / Rewrite prompts (declined; they can be revisited).
- Custom entry types and sub-entries (not scheduled; ask if wanted).
- UK single quotes, other interface languages, macOS (see `ROADMAP.md`).

## Risks
| Risk | Mitigation |
|------|------------|
| Moving settings and entries confuses people who know the old layout | Same data, new place; the help and the changelog say where things went; a one-time "what moved" note on first launch after each phase |
| Undo for deletes restores a wrong order or loses a scene | Keep the trash copy; test with chapters of many scenes; the toast holds the data, not the trash |
| Removing split view breaks saved layouts | Migrate `prefs.split` to a second view on load |
| Beginner mode hides something a writer needs | One switch in Settings, and a "More" link in each hidden place |
| Too many changes at once | One phase per release; the writer tries each before the next |
