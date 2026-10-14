---
id: plan-1
title: Reach the desktop through GitHub when it is away (relay on side refs)
type: plan
column: backlog
position: 8
description: |-
  Draft, from task-48's research (research/task-48.md on dispatch/task-48). When the desk is Away, the phone reaches it through GitHub. It gets Hand to…, runs on rows, asks, answers, Stop, the review summary, and agents and models, but not the chat, boards kept only on the desk, or Merge and Discard. The LAN link stays the fast path.

  **Shape.**
  - The task carries `assignee` and a `dispatch:` record (`by: phone`, `desk`, `state: waiting | started | not-started`).
  - The command and the passing state go in `refs/brainfile-live/<desk-id>/out` (the desk's) and `refs/brainfile-live/<desk-id>/in/<phone-id>` (each phone's). These are orphan commits, force-updated.
  - Both sides seal every file with XChaCha20-Poly1305 under a key derived from the pairing's X25519 keys (HKDF, label `brainfile-relay/1`). A seq per phone and repository stops replays, and Forget revokes.
  - A board record alone never starts an agent.
  - Each side makes one ETag'd poll of `matching-refs/brainfile-live/<desk-id>/` per repository, and a 304 is free. The desk polls every 15 s (5 s while something waits). The phone polls every 30 s (10 s while its run or ask is open).
  - Expected waits: about 10–35 s from Hand to… to a running row, and about 5–20 s each way for an ask.

  **Steps, in order.**
  1. Phone: edit tasks over GitHub. That means title, description, assignee, tags, due date, and adding, renaming and deleting subtasks, with parity tests against core. No desktop needed.
  2. Core and CLI: `DispatchRecord` in core, with a helper to set and clear it. `show` prints it and lint accepts it. The window's Hand to… writes it too.
  3. Protocol: `brainfile-mobile/docs/relay.md` beside link.md. First, try a force-updated three-level ref from a fine-grained token on a scratch repository.
  4. Desktop: the relay. A Settings switch (off by default), the `out` publisher (pushes gathered for 3 s), and the watcher (handoff, withdraw, answer, stop). seq is kept in link.json, and Forget clears the phone's refs.
  5. Phone: the relay client while the desk is Away. The row shows `Waiting for <desk name>` until the run starts.

  Decisions to record once accepted:
  - mobile.relay.trust;
  - mobile.relay.refs;
  - desktop.dispatch.record.
status: draft
priority: medium
tags:
  - mobile
  - github
  - relay
relatedFiles:
  - research/task-48.md
parentId: spec-17
decisions:
  - decision-2
createdAt: "2026-10-14T05:29:51.148Z"
---

## Description
Draft, from task-48's research (research/task-48.md on dispatch/task-48). When the desk is Away, the phone reaches it through GitHub. It gets Hand to…, runs on rows, asks, answers, Stop, the review summary, and agents and models, but not the chat, boards kept only on the desk, or Merge and Discard. The LAN link stays the fast path.

**Shape.**
- The task carries `assignee` and a `dispatch:` record (`by: phone`, `desk`, `state: waiting | started | not-started`).
- The command and the passing state go in `refs/brainfile-live/<desk-id>/out` (the desk's) and `refs/brainfile-live/<desk-id>/in/<phone-id>` (each phone's). These are orphan commits, force-updated.
- Both sides seal every file with XChaCha20-Poly1305 under a key derived from the pairing's X25519 keys (HKDF, label `brainfile-relay/1`). A seq per phone and repository stops replays, and Forget revokes.
- A board record alone never starts an agent.
- Each side makes one ETag'd poll of `matching-refs/brainfile-live/<desk-id>/` per repository, and a 304 is free. The desk polls every 15 s (5 s while something waits). The phone polls every 30 s (10 s while its run or ask is open).
- Expected waits: about 10–35 s from Hand to… to a running row, and about 5–20 s each way for an ask.

**Steps, in order.**
1. Phone: edit tasks over GitHub. That means title, description, assignee, tags, due date, and adding, renaming and deleting subtasks, with parity tests against core. No desktop needed.
2. Core and CLI: `DispatchRecord` in core, with a helper to set and clear it. `show` prints it and lint accepts it. The window's Hand to… writes it too.
3. Protocol: `brainfile-mobile/docs/relay.md` beside link.md. First, try a force-updated three-level ref from a fine-grained token on a scratch repository.
4. Desktop: the relay. A Settings switch (off by default), the `out` publisher (pushes gathered for 3 s), and the watcher (handoff, withdraw, answer, stop). seq is kept in link.json, and Forget clears the phone's refs.
5. Phone: the relay client while the desk is Away. The row shows `Waiting for <desk name>` until the run starts.

Decisions to record once accepted:
- mobile.relay.trust;
- mobile.relay.refs;
- desktop.dispatch.record.
