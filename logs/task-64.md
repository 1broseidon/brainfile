---
id: task-64
title: "Fewer shared files: changelog fragments, Settings sections gathered by glob"
priority: low
tags:
  - git
  - desktop
  - release
relatedFiles:
  - desktop/src/renderer/components/Settings.svelte
  - CHANGELOG.md
parentId: epic-4
contract:
  status: delivered
  deliverables:
    - type: file
      path: desktop/src/renderer/components/Settings.svelte
      description: Sections gathered by glob
  validation:
    commands:
      - cd desktop && npm run typecheck && npm test
  metrics:
    deliveredAt: "2026-10-14T21:04:52.825Z"
createdAt: "2026-10-14T15:16:10.887Z"
updatedAt: "2026-10-14T21:16:24.511Z"
completedAt: "2026-10-14T21:16:24.511Z"
---

## Description
Settings.svelte was in 2 of the 4 merges that conflicted (2026-08-15 to 2026-10-14); CHANGELOG.md and MANUAL.md are where the release lines collide. The changelog becomes one small file per change, joined into CHANGELOG.md by the release script. Each Settings section becomes its own component under components/settings/, gathered with import.meta.glob in an order each one declares, so adding a section touches no shared file.

## Log
- 2026-10-14T21:04:53.312Z: [claude] Built on main (uncommitted). Changelog: .github/scripts/changelog.mjs folds changes/*.md (prose, or 'kind:' entries for Keep a Changelog's lists) and whatever Unreleased holds into a dated section; npm run version:set runs it and removes the fragments; npm run changelog previews. changes/README.md says how; CONTRIBUTING's release steps too; this task's own entry is the first fragment. Settings: each section (List, Agents, Editor, GitHub, Phone) is its own component under components/settings/ with a module 'order', gathered by import.meta.glob; shared styles in styles/settings.css under @scope (.settings) to (.own), nested components (AgentServers, LinkPhone, Switch) wrapped in .own so the shared .row/.name/.note never reach them; vite-env.d.ts for the glob's types. Checked: computed styles of headings, groups, rows and the custom-agents form identical before and after, captures differ only where agent modes were still loading; vite build keeps @scope. MANUAL.md not split (not in the contract). 3 new tests; 198/198, typecheck clean.
