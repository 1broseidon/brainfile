---
id: task-64
title: "Fewer shared files: changelog fragments, Settings sections gathered by glob"
column: todo
position: 7
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
  status: draft
  deliverables:
    - type: file
      path: desktop/src/renderer/components/Settings.svelte
      description: Sections gathered by glob
  validation:
    commands:
      - cd desktop && npm run typecheck && npm test
createdAt: "2026-10-14T15:16:10.887Z"
---

## Description
Settings.svelte was in 2 of the 4 merges that conflicted (2026-08-15 to 2026-10-14); CHANGELOG.md and MANUAL.md are where the release lines collide. The changelog becomes one small file per change, joined into CHANGELOG.md by the release script. Each Settings section becomes its own component under components/settings/, gathered with import.meta.glob in an order each one declares, so adding a section touches no shared file.
