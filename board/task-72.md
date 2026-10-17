---
id: task-72
title: "Desktop release workflow: signed, notarized, both architectures, with the update manifest"
column: review
position: 1
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
updatedAt: "2026-10-14T21:54:34.854Z"
---

## Description
On a desktop-v* tag: a macOS runner builds core and the app, sets the app's version from the tag, packages zip and dmg for arm64 and x64 with electron-builder, signs with the Developer ID and notarizes when APPLE_* secrets are set (ad-hoc otherwise, as Hotline's is optional), then writes brainfile-desktop.json (version, notes from desktop/notes/<version>.md, each arch's url, sha256, size) and signs it with BRAINFILE_UPDATE_KEY, and publishes a GitHub Release with the zips, dmgs, manifest and signature. Not marked latest, so the CLI's releases keep /releases/latest.

## Log
- 2026-10-14T21:54:34.600Z: [claude] Built and pushed in a3106a3: .github/workflows/desktop-release.yml (desktop-v* tag; checks the tag against desktop/package.json and desktop/notes/<version>.md; macos-15; zips and dmgs for arm64 and x64; Developer ID + notarization when APPLE_P12_BASE64, APPLE_P12_PASSWORD, APPLE_API_KEY, APPLE_API_ISSUER, APPLE_API_KEY_P8 exist, ad-hoc otherwise; manifest signed with BRAINFILE_UPDATE_KEY; release not marked latest), electron-builder.release.cjs, build/entitlements.mac.plist, scripts/update-manifest.mjs (refuses a key that is not the one the app trusts). Dry run here, unsigned: both archs packaged, the manifest verified under the app's key, the arm64 zip unpacked to 0.1.0 and passed codesign --verify --deep --strict. Signing and notarization untried until the Apple secrets are in the repo.
- 2026-10-17T05:09:14.921Z: [claude] 2026-10-17 audit: the workflow landed on main in a3106a3 with task-71, but no desktop-v* release has been cut and the repo has only BRAINFILE_UPDATE_KEY, no Apple Developer ID secrets. Moved back to To Do: waiting on the signing secrets (George) and the first release.
