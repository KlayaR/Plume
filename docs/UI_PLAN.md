# UI plan: consolidate what 0.39 built up

Written after 0.39.1, from an audit of the app in the browser mock and a read of
what writers say about similar apps. The look stays (dark room, paper sheet, gold).
The problem is build-up: new features became sibling tabs, panels and notes.
Nothing here changes how books are stored, and each phase is one release.

## Principles
1. **Consolidate, don't add.** A new surface needs an old one to go.
2. **The page comes first.** Chrome recedes; it doesn't compete for attention it
   hasn't earned.
3. **One view switch per thing.** One outline with several views, one bible with
   several views, one inbox with several filters.
4. **Advanced one click away.** The summary line stays; the detail folds.
5. **Readable and reachable.** 12px minimum for text, 24px minimum for targets.

## Phase 1: Quiet and safe (0.40.0)
| # | What | How | Size |
|---|------|-----|------|
| 1.1 | **Error screen** instead of a blank window, saying what is safe, with Reload | React error boundary in `main.tsx` | S |
| 1.2 | **Quieter chrome**: dimmer bars, fewer separators, 12px minimum, bigger click areas | `styles.css` | M |
| 1.3 | **One View menu** in the Manuscript: Sheet/Page, Scene/Chapter/Book and Aa together | `BottomBar.tsx`, `ManuscriptOptions.tsx` | M |
| 1.4 | **Scene details fold** to one quiet line for the current scene, hidden in Book view | Scene header in `WritingView.tsx` | S |

**Check:** force a display error and reload; the Manuscript at 1280×720 with both panes pinned.

## Phase 2: Assistant (0.41.0)
| # | What | How | Size |
|---|------|-----|------|
| 2.1 | **One box, one main action**; model, prompt, tokens and entries fold into a summary line | `ContextPanel.tsx` | M |
| 2.2 | **Rewrite accepted change by change**, reusing tracked changes | `edit.ts`, `ContextPanel.tsx` | M |
| 2.3 | **Hidden panes get a small visible handle** | `WritingView.tsx`, `styles.css` | S |

**Check:** a proposal, part accepted, undone; the handle opens each pane.

## Phase 3: One Plan (0.42.0)
| # | What | How | Size |
|---|------|-----|------|
| 3.1 | **Tabs become Outline, Grid, Analysis**; Outline switches Cards, List, Board | `PlanView.tsx` | M |
| 3.2 | **Structure moves beside the story**, under Analysis | `PlanView.tsx` | S |
| 3.3 | **One main action and one Claude menu** in the toolbar | `OutlineView.tsx` | M |
| 3.4 | **Story-line tracker you can click**, down to the scene | `PlanView.tsx` `Lines()` | M |

**Check:** every old tab is reachable in one or two clicks; serial tabs still appear; simple mode.

## Phase 4: One inbox (0.43.0)
| # | What | How | Size |
|---|------|-----|------|
| 4.1 | **The scratch pad lists** loose ideas, placeholders and open comments as filters, with no data moved | `ScratchPad.tsx`, `src/lib` | M |
| 4.2 | **"Bible beside the text" merges into the second view** | `BottomBar.tsx`, `DualView.tsx` | S |

**Check:** clicking a filtered item jumps to its place; existing notes are untouched.

## Phase 5: Bible (0.44.0)
| # | What | How | Size |
|---|------|-----|------|
| 5.1 | **List, Table, Gallery as one switch** | `BibleView.tsx` | S |
| 5.2 | **Presence, Map, Relations, Contradictions under Analysis**, matching the Plan | `BibleView.tsx` | M |
| 5.3 | **Entry reading on paper**, as an option | `BibleView.tsx`, `styles.css` | S |

**Check:** every old Bible tab is reachable; simple mode hides Analysis.

## Phase 6: Reach and comfort (0.45.0)
| # | What | How | Size |
|---|------|-----|------|
| 6.1 | **Every action in Ctrl+K** | `commands.ts` | M |
| 6.2 | **Keyboard use of the board** | `PlanView.tsx` | L |
| 6.3 | **Settings search; Show everything moves out of Appearance** | `SettingsView.tsx` | S |
| 6.4 | **"What moved" note** once, help and tour updated | `App.tsx`, `lib/help.ts` | S |
| 6.5 | **A full-length book test** (100+ scenes), generated in the mock | `src/dev/mockTauri.ts` | M |

**Check:** move a card with the keyboard alone; find a setting by typing; the large book scrolls.

## Every phase
- **Tests:** pure logic in `src/lib/` with tests in `core.test.ts`.
- **French and English:** every new phrase in `i18n.ts`; `npm run check` must pass.
- **Help (F1)** updated in the same release.
- **Release:** version bump, `CHANGELOG.md` section, commit, `npm run release`.
- **Verification:** each changed screen in the browser mock, in French too. The installed
  app is the maintainer's check.

## Decisions taken
1. **Hover panes:** they stay, with a small always-visible handle (2.3).
2. **Marking Claude's text:** left out. It needs new data saved with each scene.
3. **Simple mode:** stays, the default for new installs.

## Not doing
Translucency, bento layouts, interfaces that rearrange themselves, a chat-first layout,
celebrations, a new look.
