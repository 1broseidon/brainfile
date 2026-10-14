---
id: task-72
title: "Desktop release workflow: signed, notarized, both architectures, with the update manifest"
column: todo
position: 3
description: "On a desktop-v* tag: a macOS runner builds core and the app, sets the app's version from the tag, packages zip and dmg for arm64 and x64 with electron-builder, signs with the Developer ID and notarizes when APPLE_* secrets are set (ad-hoc otherwise, as Hotline's is optional), then writes brainfile-desktop.json (version, notes from desktop/notes/<version>.md, each arch's url, sha256, size) and signs it with BRAINFILE_UPDATE_KEY, and publishes a GitHub Release with the zips, dmgs, manifest and signature. Not marked latest, so the CLI's releases keep /releases/latest."
tags:
  - desktop
  - release
  - ci
relatedFiles:
  - .github/workflows/desktop-release.yml
  - desktop/scripts/update-manifest.mjs
  - desktop/build/entitlements.mac.plist
parentId: epic-5
dependsOn:
  - task-71
contract:
  status: draft
  deliverables:
    - type: file
      path: .github/workflows/desktop-release.yml
      description: The release workflow
    - type: file
      path: desktop/scripts/update-manifest.mjs
      description: Manifest and its signature
  validation:
    commands:
      - cd desktop && npm run typecheck && npm test
createdAt: "2026-10-14T21:43:51.193Z"
---

## Description
On a desktop-v* tag: a macOS runner builds core and the app, sets the app's version from the tag, packages zip and dmg for arm64 and x64 with electron-builder, signs with the Developer ID and notarizes when APPLE_* secrets are set (ad-hoc otherwise, as Hotline's is optional), then writes brainfile-desktop.json (version, notes from desktop/notes/<version>.md, each arch's url, sha256, size) and signs it with BRAINFILE_UPDATE_KEY, and publishes a GitHub Release with the zips, dmgs, manifest and signature. Not marked latest, so the CLI's releases keep /releases/latest.
