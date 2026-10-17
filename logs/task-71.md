---
id: task-71
title: "In-app updates: check, a badge, and update in place"
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
updatedAt: "2026-10-17T05:09:14.421Z"
completedAt: "2026-10-17T05:09:14.421Z"
---

## Description
main/updater.ts: status (current, available {version, notes}, checkedAt, phase idle|checking|downloading|installing|waiting|restarting, downloaded/total, error, disabledReason), pushed to the window on change. Checks 20s after launch and every 6h, cached in userData/update.json; only the packaged app checks (BRAINFILE_PREVIEW_UPDATE pretends one is out, in dev). The newest non-draft desktop-v* release from the GitHub API; its brainfile-desktop.json manifest verified against brainfile-desktop.json.sig with the app's Ed25519 public key; the zip for this Mac's arch downloaded with progress, its sha256 checked, unpacked with ditto, its Info.plist version checked, then the bundle swapped in place (the old one set aside and removed on the next launch) and the app relaunched, waiting while agents are at work unless the person says now. Window: a small dot on the settings key while an update is out; Settings › Updates says the version, the notes, Check now, Update to x, progress, Cancel, Restart now.

## Log
- 2026-10-14T21:54:34.341Z: [claude] Built and pushed in a3106a3. main/updater.ts (pure parts plus an Updater taking its deps), update-key.ts (Ed25519 public key; the private key is the BRAINFILE_UPDATE_KEY secret, with a copy at ~/brainfile-update-key.pem for the person's password manager), wired in main (local IPC, update channel, busy = live agent runs, relaunch = app.relaunch + quit so the host flushes). Window: a dot on the settings key, Settings › Updates first. 8 tests incl. a real install on a scratch bundle (ditto, plutil, codesign, swap, relaunch), a tampered zip refused, the restart waiting for agents and Restart now. Seen in dev with BRAINFILE_PREVIEW_UPDATE=0.2.0. Not yet seen updating a real installed release: that needs 0.1.0 out and a later one.
- 2026-10-17T05:09:13.948Z: [claude] Landed on main in a3106a3 (desktop updates itself from signed releases, with task-72). Completed in the 2026-10-17 audit; nothing was waiting to land.
