# Plume

**A novel-writing app for Windows, with a story bible the AI actually uses.**

Plume is where you plan, write and revise a book. You keep a bible of your
characters, places, magic and history; when you ask Claude to continue a scene,
rewrite a passage or check your continuity, Plume picks the few bible entries
that scene needs and sends only those. It works with your own Claude
subscription through the `claude` command line: no API key, no account with us,
and a request costs about 830 tokens of overhead instead of tens of thousands.
When your plan runs out, Plume can carry on with any model on
[OpenRouter](https://openrouter.ai) (your own key), and named model presets
keep the choice to one short list.

Your books are plain folders of Markdown files on your disk. Open them in any
editor, back them up however you like.

> Plume is young and built by one writer for fantasy novels, in French and
> English. Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).

## What it does

**Write**
- A quiet page, sheet or real book pages, with drop caps, your fonts and paper.
- Typography as you type for French and English (quotes, dashes, ellipses,
  French spaces), automatic capitals, italics and bold, clean paste from Word.
- Enter, Enter, Enter: a new scene, then a new chapter. Darlings drawer,
  placeholders to fill later, margin comments, version history per scene.

**Write with Claude**
- Continue, rewrite, beats to prose, fill a placeholder, and quick actions
  (expand, shorten, show don't tell, sharpen dialogue, describe), three
  alternatives side by side, a scorecard against your own measurable rules.
- A default voice for fantasy (deep point of view, magic with a cost, no
  info-dumps) that you can rewrite, a prompt library, and a taste log that
  learns from what you accept and reject.
- A chat to brainstorm, turn a conversation into bible entries, interview you
  about a character, and agent tasks for whole-book audits.

**The bible**
- Characters with voice cards and what they know, places on a map, objects,
  lore, magic systems, creatures, history, factions, story lines, word lists,
  excerpts of your own prose, a style guide.
- Facts dated by chapter ("blind in the left eye from chapter 12"), series
  shared across books, a relationship web, an appearance tracker.
- **AI check:** finds what makes the AI's context worse (missing short versions,
  bloated entries, characters without a voice, duplicate names) and fixes it.

**Plan**
- Index cards that are the real scenes, structure templates with a pacing
  view, a tension curve, a timeline in story time, story lines, a dashboard,
  revision passes, an outline from a premise.

**Review** (after AutoCrit)
- Reports for pacing, dialogue, strong writing, word choice, repetition and
  readability, compared with targets or with books you admire; who says what;
  LanguageTool spelling and grammar; read aloud; beta-reader and line-edit passes.

**Out**
- EPUB (KDP-ready), Word (book or submission format), PDF, HTML for beta
  readers, Markdown; front and back matter, part pages; named snapshots.

## Install

Plume runs on Windows 10 and 11.

1. Download `Plume_<version>_x64-setup.exe` from the Releases page and run it.
   The installer isn't code-signed yet, so Windows SmartScreen may warn about an
   unknown publisher: choose *More info*, then *Run anyway*.
2. For the AI features, install the [Claude Code](https://claude.com/claude-code)
   command line and sign in once with your Claude subscription. Plume finds it
   on its own (or set its path in Settings). Everything else works without it.

To build it yourself, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Privacy

- Your books never leave your computer, except the passages and bible entries
  sent to Claude when you ask for something, through your own `claude` CLI.
- Secret bible entries and private notes are never sent.
- If you turn on OpenRouter, the passages and entries of a request go to
  OpenRouter and the model you chose instead of Claude. Your key stays on your
  computer, never in a book.
- LanguageTool (optional, off unless chosen) sends the scene you check to the
  server you set; a server on your own computer keeps it all local.

## Learn more

- [CHANGELOG.md](CHANGELOG.md): what each version added.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the book folder format, how AI
  calls stay small, where things are in the code.
- [ROADMAP.md](ROADMAP.md): what's next, and where help is welcome.
- [NOTICE.md](NOTICE.md): what Plume builds on.

## License

[MIT](LICENSE).
