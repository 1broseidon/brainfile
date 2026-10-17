---
id: epic-5
title: "Brainfile Desktop 0.1.0: in-app updates and a release workflow"
type: epic
column: in-progress
position: 2
description: "The first desktop release. Updates follow Hotline's concepts (crates/hotline-app/src/updater.rs, ui UpdateFloat and Settings › Updates): a signed manifest per release, checked 20 seconds after launch and every six hours, cached; a badge when one is out; update in place with progress and cancel, the restart waiting for idle. Electron has no Tauri updater and its own needs an Apple-signed app, so the app does it itself: an Ed25519-signed manifest (public key in the app, private key the BRAINFILE_UPDATE_KEY secret), the zip checked against its sha256, unpacked with ditto, the bundle swapped in place and relaunched. The repo's GitHub releases also carry the CLI's, so the app reads the newest desktop-v* release through the API rather than /releases/latest. Releases are signed and notarized with Hotline's Apple Developer ID when the repo has the secrets; arm64 and x64."
tags:
  - desktop
  - release
  - updates
createdAt: "2026-10-14T21:43:38.259Z"
---

## Description
The first desktop release. Updates follow Hotline's concepts (crates/hotline-app/src/updater.rs, ui UpdateFloat and Settings › Updates): a signed manifest per release, checked 20 seconds after launch and every six hours, cached; a badge when one is out; update in place with progress and cancel, the restart waiting for idle. Electron has no Tauri updater and its own needs an Apple-signed app, so the app does it itself: an Ed25519-signed manifest (public key in the app, private key the BRAINFILE_UPDATE_KEY secret), the zip checked against its sha256, unpacked with ditto, the bundle swapped in place and relaunched. The repo's GitHub releases also carry the CLI's, so the app reads the newest desktop-v* release through the API rather than /releases/latest. Releases are signed and notarized with Hotline's Apple Developer ID when the repo has the secrets; arm64 and x64.

## Log
- 2026-10-17T05:09:16.355Z: [claude] 2026-10-17 audit: task-71 complete (a3106a3). Left: task-72, the first signed release, waiting on Hotline's Apple Developer ID secrets in this repo.
