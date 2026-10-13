---
id: spec-17
title: "Mobile companion: serverless on GitHub refs, desktop link for agents"
type: spec
column: in-progress
position: 0
priority: high
tags:
  - mobile
  - github
  - companion
createdAt: "2026-10-13T02:29:38.358Z"
subtasks:
  - id: spec-17-1
    title: "Repo brainfile-mobile: Expo SDK 57 app, native stack, theme from Forge tokens, Plex fonts, icon and splash from the box mark"
    completed: true
  - id: spec-17-2
    title: GitHub sign-in with a fine-grained token in SecureStore; projects = repos with refs/brainfile/*
    completed: true
  - id: spec-17-3
    title: Read a board through one GraphQL request and @brainfile/core/browser; cache for offline reading
    completed: true
  - id: spec-17-4
    title: "Board UI: list grouped by column with the outline, decisions view, task sheet (description, subtasks, log, decisions)"
    completed: true
  - id: spec-17-5
    title: "Writes as commits on the ref (Git Data API) with re-read and retry when it moved: add, move, priority, subtasks, note, complete, decide"
    completed: true
  - id: spec-17-6
    title: "Build: simulator and a WiFi install on the iPhone (Release, team F3E8V88BVB, devicectl); scripts and README"
    completed: true
  - id: spec-17-7
    title: "v2: desktop link by QR (chat, hand-offs, runs, asks)"
    completed: false
  - id: spec-17-8
    title: Device-flow sign-in once an OAuth app is registered
    completed: false
updatedAt: "2026-10-13T03:28:19.911Z"
---

## Description
A phone companion for Brainfile, like Hotline Mobile and Orca's. Serverless first: a board shared through GitHub already lives at `refs/brainfile/<name>`, so the phone is one more machine that reads that ref and commits to it. No server, works anywhere, desktop optional. Linking the desktop (a QR from its Settings) adds what needs agents: the chat, hand-offs, live runs and asks.

**Serverless (v1).**
- Sign in with a fine-grained GitHub token, pasted once and kept in the Keychain (SecureStore). GitHub's device flow replaces it once an OAuth app is registered; a QR from the desktop can hand over its login once linking exists.
- Projects: the person's repositories that have `refs/brainfile/*`, found through the API, added by choice (as on the desktop).
- Read: one GraphQL request per board returns `brainfile.md`, `board/` and `logs/` as text from the ref; `@brainfile/core/browser` parses them (parseBoardConfig, parseTaskContent, the types graph). The last copy of each board is kept for reading offline.
- Write: add a task, move it, set priority, toggle subtasks, add a note, complete it, record a decision. Each is a commit on the ref through GitHub's Git Data API (blob, tree on the tip's tree, commit with the tip as parent, update the ref without force), marked `[mobile]`. If the ref moved, GitHub refuses; the phone re-reads, re-applies the edit to the fresh files and tries again.
- Fresh: pull to refresh, a check when the app comes forward and every 30 seconds while open, ETags so an unchanged board costs nothing.

**Linked to the desktop (v2).** Pair by scanning a QR in the desktop's Settings (a one-time secret, as Hotline does); the desktop serves its own API on the LAN. Adds the chat (ask, hand off, runs, stop), live `codex · editing` on rows, agents' asks to answer, the review moment. Boards that live on one machine appear through the link too.

**Design.** Brainfile's system on a phone: the Forge planes, ink and accent from desktop/src/renderer/styles/tokens.css converted to hex in theme.ts (dark first), IBM Plex Sans and Mono, the box mark, calm rows (status box, title, only signals at rest), the decisions view, a sheet for a task. Hotline Mobile's conventions: Expo SDK 57, React Native 0.86, one native stack, StyleSheet, SF Symbols, haptics on selection, Prettier, tsx tests for logic.

**Build.** A local native build, never Expo Go: `expo prebuild` (ios/ generated, not committed), the simulator from xcodebuild, and the phone over WiFi: a Release build signed by Apple team F3E8V88BVB and installed with `xcrun devicectl device install app`. The icon and splash are generated from the box mark.

**Not in scope (v1).** Android builds (the code stays portable), push notifications, offline writes, GitLab and other forges, the App Store.

## Log
- 2026-10-13T03:13:17.502Z: [claude] Milestone: ~/Projects/personal/brainfile-mobile (local repo, not pushed) runs in the iPhone 18 Pro simulator as a Release build. Data layer is pure TS in src/data with 58 tsx tests; every write op (add, move, priority, subtask, note, complete with ledger, decide with supersede) matches @brainfile/core 0.22.0 file for file in tests/parity.test.ts. Reads use REST git/ref with ETag (304 when unchanged) then one GraphQL query at the commit oid: GraphQL ref(qualifiedName:) and refs(refPrefix:) do not reach refs/brainfile/*, but object(expression:) does. Signed in with the gh token in the simulator: discovery finds the 7 boards, brainfile reads in ~1.2 s. iOS 27 needs expo-build-properties enableSceneSupport (as hotline-mobile).
- 2026-10-13T03:28:20.390Z: [claude] Milestone: v1 installed on George's iPhone 16 Pro over WiFi (Release, signed by F3E8V88BVB, xcodebuild generic/platform=iOS + xcrun devicectl device install app; launched). expo run:ios --device built the same app but its usbmuxd installer hung at 'Connecting to: iPhone' with the phone on WiFi, so npm run phone uses xcodebuild + devicectl and keeps PHONE_ROUTE=expo for a cable. Writes are verified with fetch mocked (request sequence, sha:null deletes, 422 re-read and re-apply, give up after 3) and against core's own operations file for file; no live write was made to any real board.
- 2026-10-13T03:31:19.765Z: [claude] Decision: v1 of the mobile companion is ~/Projects/personal/brainfile-mobile (local only, 7 commits), installed on George's iPhone. (1) Read = REST git/ref/brainfile/<name> with If-None-Match, then one GraphQL query at that commit oid for brainfile.md, board/ and logs/ as text; ref(qualifiedName:) and refs(refPrefix:) cannot see refs/brainfile/*, object(expression:) can. Done shows the 100 latest plus completed children of shown work; the offline copy keeps only those and drops the ledger. (2) Discovery = GraphQL repo pages resolving refs/brainfile/board and /home, then a REST matching-refs sweep for other names; or add by owner/name. (3) Writes always re-read the tip (never the cached copy), put blob contents inside POST git/trees, commit on the tip, PATCH force:false; on 422 re-read and re-apply, 3 tries. Ops carry intent (subtask set done, not flipped). Notes use the CLI note's '- <ISO>: [mobile] text' at the end of ## Log, keeping other sections; complete appends the ledger record (core's buildLedgerRecord ported); decide supersedes the claim key's current decision (no stance or predicates on the phone). Commit messages are the CLI's with [mobile]. Edits show at once, queue per board, and drop if refused. (4) iOS 27 SDK needs expo-build-properties enableSceneSupport. (5) npm run phone = xcodebuild generic/platform=iOS + devicectl install/launch, because expo run:ios --device hung at 'Connecting to: iPhone' on WiFi (PHONE_ROUTE=expo for a cable). (6) The simulator is driven by launch arguments read through RN Settings on a simulator only (a brainfile:// dev link raised SpringBoard's 'Open in' prompt). (7) Icon = the desktop tile drawn full bleed (iOS masks it); Plex embedded by expo-font; the accent is spent only on done ticks and an actionable primary key. Left for later: v2 desktop link, device-flow sign-in, editing title/description/assignee, live write verification (none made to real boards).
