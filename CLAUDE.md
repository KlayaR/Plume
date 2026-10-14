@AGENTS.md

## Maintainer notes
- The repo is private for now: pull before working locally.
- "What could we add / how could X be better" means: list proposals and wait for a choice.
- Plume stays in 0.x until the user declares it finished (ROADMAP.md, "Road to 1.0").
  Never bump to 1.0 or above on your own: fixes bump the last number, features the middle one.
- Every build with changes gets a new version (all three files) and a
  `CHANGELOG.md` section, and is released on GitHub: commit, push, then
  `git tag v<version> && git push origin v<version>`. The Release workflow builds
  the installer and publishes the release; give the user the release link.
  `npm run build` locally is only for trying a build before tagging.
- StudioKit lives in a separate repo on the maintainer's PC: edit it there,
  bump its `VERSION`, then `npm run sync-kit` here.
