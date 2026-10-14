# changes/

One small file per change, instead of an edit to `CHANGELOG.md`: two branches
never touch the same lines, so they never conflict there. `npm run
version:set <version>` folds every file here, and whatever `## [Unreleased]`
already holds, into the release's dated section, and removes them.
`npm run changelog` prints what the next release will say.

A file is a paragraph of prose for the release's opening, or, with a `kind:`
(Added, Changed, Deprecated, Removed, Fixed or Security), entries for that
kind's list. Name it after the change, e.g. `task-64-changelog-fragments.md`:

```md
---
kind: Changed
---
- Changes are written to `changes/`, one file each, and folded into
  CHANGELOG.md at release.
```
