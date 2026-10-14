---
id: task-71
title: "In-app updates: check, a badge, and update in place"
column: in-progress
position: 3
description: "main/updater.ts: status (current, available {version, notes}, checkedAt, phase idle|checking|downloading|installing|waiting|restarting, downloaded/total, error, disabledReason), pushed to the window on change. Checks 20s after launch and every 6h, cached in userData/update.json; only the packaged app checks (BRAINFILE_PREVIEW_UPDATE pretends one is out, in dev). The newest non-draft desktop-v* release from the GitHub API; its brainfile-desktop.json manifest verified against brainfile-desktop.json.sig with the app's Ed25519 public key; the zip for this Mac's arch downloaded with progress, its sha256 checked, unpacked with ditto, its Info.plist version checked, then the bundle swapped in place (the old one set aside and removed on the next launch) and the app relaunched, waiting while agents are at work unless the person says now. Window: a small dot on the settings key while an update is out; Settings › Updates says the version, the notes, Check now, Update to x, progress, Cancel, Restart now."
tags:
  - desktop
  - updates
relatedFiles:
  - desktop/src/main/updater.ts
  - desktop/src/main/update-key.ts
  - desktop/src/renderer/components/settings/Updates.svelte
  - desktop/src/renderer/App.svelte
parentId: epic-5
contract:
  status: draft
  deliverables:
    - type: file
      path: desktop/src/main/updater.ts
      description: Check, verify, download, swap and relaunch
    - type: test
      path: desktop/test/updater.test.ts
      description: Newer versions, release choice, signature and checksum refusals
  validation:
    commands:
      - cd desktop && npm run typecheck && npm test
createdAt: "2026-10-14T21:43:50.927Z"
---

## Description
main/updater.ts: status (current, available {version, notes}, checkedAt, phase idle|checking|downloading|installing|waiting|restarting, downloaded/total, error, disabledReason), pushed to the window on change. Checks 20s after launch and every 6h, cached in userData/update.json; only the packaged app checks (BRAINFILE_PREVIEW_UPDATE pretends one is out, in dev). The newest non-draft desktop-v* release from the GitHub API; its brainfile-desktop.json manifest verified against brainfile-desktop.json.sig with the app's Ed25519 public key; the zip for this Mac's arch downloaded with progress, its sha256 checked, unpacked with ditto, its Info.plist version checked, then the bundle swapped in place (the old one set aside and removed on the next launch) and the app relaunched, waiting while agents are at work unless the person says now. Window: a small dot on the settings key while an update is out; Settings › Updates says the version, the notes, Check now, Update to x, progress, Cancel, Restart now.
