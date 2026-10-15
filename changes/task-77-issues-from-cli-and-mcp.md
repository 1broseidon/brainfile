---
kind: Added
---
- `brainfile issues` lists the open issues of the GitHub repository the
  project's origin points at and marks each one a task on the board, open or
  completed, already carries; `--import <n…>` makes a task from each (title,
  body as the description, labels as tags, the issue's page as `source:`),
  in `--column` or the first column that is not done, and finds one already
  made rather than making it twice. The MCP server has the same as `issues`
  (`action` list or import).
- `brainfile add --source <url>` and MCP `task_add`'s `source` make a task
  from an issue by hand, refused when a task already carries that URL.
- `source` is a typed task field in core (`Task.source`,
  `TaskFileInput.source`), with `issueTask`, `linkedTask`, `labelTag`,
  `sourceKey` and `sourcesOf` in the main and browser entries, and forge
  detection and the GitHub issues client (pages, the ETag, the once-a-minute
  read) in the new Node-only `@brainfile/core/forge`, shared by the CLI and
  the desktop app. Both look for GitHub credentials in one order: `gh auth
  token`, then `GH_TOKEN` or `GITHUB_TOKEN`, then the saved token.
