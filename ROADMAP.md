# Roadmap

What's planned, roughly in order. Items marked *help wanted* are good places to start.

## Road to 1.0
Plume stays in 0.x until it is ready to be called finished. 1.0 is released when:
- every feature listed in the README has been used on a real book in the
  installed app (not only in the browser preview) and works;
- there are no open bugs that lose text, corrupt a book or block writing;
- AI requests behave as documented (context, costs, secret entries never sent);
- export (EPUB, Word, PDF, HTML) is checked on a full-length book;
- French and English interfaces are complete.

Until then, each version is a pre-release: 0.x.y, where y fixes bugs and x adds
or changes features.

## Next
- Test every feature in daily use on real books and fix what breaks.
- Undo for deletions and renames in the Plan and the Bible (moves already undo).
- Code-signed installer, so Windows stops warning about an unknown publisher.

## Later
- UK single quotes as an option for English books. *help wanted*
- More interface languages (the interface is English and French). *help wanted*
- macOS build (Tauri supports it; Plume has only been tested on Windows). *help wanted*
- Keyboard-only use of the Plan board. *help wanted*

## Not planned
- A Plume account or cloud: books stay files on your disk.
- Bundled API keys: AI goes through the user's own `claude` command line.
