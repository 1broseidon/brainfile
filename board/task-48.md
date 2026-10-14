---
id: task-48
title: "Research: linked parity through GitHub refs, without the chat"
column: backlog
position: 6
description: |-
  How close the phone can get to what the desktop link gives through GitHub refs alone, leaving out the chat and anything else that needs an LLM. This is research: the result is a recommendation and, if it holds, work under spec-17. No code.

  **Findings so far.**
  - Everything the link adds can go through refs except boards that live only on the desk; those never reach GitHub. The costs are latency (tens of seconds, not instant) and trust.
  - Editing title, description, assignee and tags (`patchTask`) needs no desktop at all. It is v1 work left undone.
  - Hand to…: the phone commits `assignee` and a hand-off request on the task. The desktop picks it up on its next fetch and claims it with a commit that is not forced, so the ref is the lock and two desktops cannot both start it. Today that fetch runs every 60 s (`FULL_SYNC_INTERVAL_MS`, desktop/src/host/host.ts:104), and only for boards on full autosync. The desktop must be on, but can be anywhere.
  - Runs on rows: the desktop force-pushes a small `live.json` to a side ref on phase changes only, debounced. About 30 s stale on the phone; the ETag makes an unchanged one free.
  - Asks, answers, Stop: asks go in `live.json`; answers and Stop go to an inbox ref the desktop watches. A round trip of about 20–60 s while an agent waits. Without push notifications an ask is only seen with the app open, as over the LAN link.
  - Review summary: the desktop pushes `dispatch/<task-id>` (decision-2) and the phone reads GitHub's compare (ahead, commits, files, +/−). It cannot see uncommitted work. Merge and Discard stay off the phone, as they are when linked.
  - Agents and models: listed in the side ref; they rarely change.

  **The shape proposed.**
  - What the person asked for goes in the board. A hand-off request lives on the task, so its history shows who asked and the CLI sees it too.
  - What is passing goes in side refs under their own namespace, e.g. `refs/brainfile-live/<name>`, outside `refs/brainfile/*`, so discovery, sync and `refs/brainfile/backups/` never take them for boards and run churn never enters the board's history.
  - The LAN link stays the fast path when the phone can reach the desktop. Refs extend the existing GitHub fallback for when the desktop is Away.

  **Trust.** Over the LAN only a paired phone key can start an agent. Through a ref anyone who can push to the repo could, and API commits are unsigned, so the desktop cannot tell the phone's commit from a collaborator's. Proposed: reuse the pairing. Both sides already hold each other's X25519 public keys from the Noise IK pairing, so each derives the same shared secret and HMAC-signs requests with it: scan the QR once, then it works from anywhere. The alternative, a per-board opt-in ("act on hand-offs from GitHub"), is fine for solo private repos and weak anywhere else.

  **Open.**
  - Is about a minute from Hand to… to the agent starting acceptable, or should the desktop fetch every 10–15 s while a phone has been active, and what does that cost against GitHub's rate limits?
  - Where the hand-off request lives on the task (a field or a log line), and whether core and the CLI should understand it.
  - Signed requests: replay protection, and unpairing revoking them.
  - Whether the outcome is a plan under spec-17 or subtasks on it.
priority: medium
tags:
  - mobile
  - github
  - research
parentId: spec-17
decisions:
  - decision-2
subtasks:
  - id: task-48-1
    title: "Check what GitHub allows on a side ref outside refs/heads: force updates on refs/brainfile-live/*, ETags on git/ref, compare against dispatch/<task-id>"
    completed: false
  - id: task-48-2
    title: "Shape the hand-off request on the task: field or log line, how the desktop claims it, what the CLI shows"
    completed: false
  - id: task-48-3
    title: "Shape live.json and the inbox ref: phases, asks, answers, Stop; debounce and size"
    completed: false
  - id: task-48-4
    title: "Trust: HMAC over the pairing's shared secret (replay, unpair revokes) against a per-board opt-in"
    completed: false
  - id: task-48-5
    title: "Latency and rate: the desktop's fetch interval while a phone is active, against GitHub's API limits"
    completed: false
  - id: task-48-6
    title: Recommend what goes through refs, what stays link-only, and how it lands under spec-17
    completed: false
createdAt: "2026-10-13T20:53:13.056Z"
assignee: claude
dispatch:
  agent: claude
  model: opus
  effort: high
  by: chat
  at: "2026-10-14T05:23:44.486Z"
updatedAt: "2026-10-14T05:23:44.593Z"
---

## Description
How close the phone can get to what the desktop link gives through GitHub refs alone, leaving out the chat and anything else that needs an LLM. This is research: the result is a recommendation and, if it holds, work under spec-17. No code.

**Findings so far.**
- Everything the link adds can go through refs except boards that live only on the desk; those never reach GitHub. The costs are latency (tens of seconds, not instant) and trust.
- Editing title, description, assignee and tags (`patchTask`) needs no desktop at all. It is v1 work left undone.
- Hand to…: the phone commits `assignee` and a hand-off request on the task. The desktop picks it up on its next fetch and claims it with a commit that is not forced, so the ref is the lock and two desktops cannot both start it. Today that fetch runs every 60 s (`FULL_SYNC_INTERVAL_MS`, desktop/src/host/host.ts:104), and only for boards on full autosync. The desktop must be on, but can be anywhere.
- Runs on rows: the desktop force-pushes a small `live.json` to a side ref on phase changes only, debounced. About 30 s stale on the phone; the ETag makes an unchanged one free.
- Asks, answers, Stop: asks go in `live.json`; answers and Stop go to an inbox ref the desktop watches. A round trip of about 20–60 s while an agent waits. Without push notifications an ask is only seen with the app open, as over the LAN link.
- Review summary: the desktop pushes `dispatch/<task-id>` (decision-2) and the phone reads GitHub's compare (ahead, commits, files, +/−). It cannot see uncommitted work. Merge and Discard stay off the phone, as they are when linked.
- Agents and models: listed in the side ref; they rarely change.

**The shape proposed.**
- What the person asked for goes in the board. A hand-off request lives on the task, so its history shows who asked and the CLI sees it too.
- What is passing goes in side refs under their own namespace, e.g. `refs/brainfile-live/<name>`, outside `refs/brainfile/*`, so discovery, sync and `refs/brainfile/backups/` never take them for boards and run churn never enters the board's history.
- The LAN link stays the fast path when the phone can reach the desktop. Refs extend the existing GitHub fallback for when the desktop is Away.

**Trust.** Over the LAN only a paired phone key can start an agent. Through a ref anyone who can push to the repo could, and API commits are unsigned, so the desktop cannot tell the phone's commit from a collaborator's. Proposed: reuse the pairing. Both sides already hold each other's X25519 public keys from the Noise IK pairing, so each derives the same shared secret and HMAC-signs requests with it: scan the QR once, then it works from anywhere. The alternative, a per-board opt-in ("act on hand-offs from GitHub"), is fine for solo private repos and weak anywhere else.

**Open.**
- Is about a minute from Hand to… to the agent starting acceptable, or should the desktop fetch every 10–15 s while a phone has been active, and what does that cost against GitHub's rate limits?
- Where the hand-off request lives on the task (a field or a log line), and whether core and the CLI should understand it.
- Signed requests: replay protection, and unpairing revoking them.
- Whether the outcome is a plan under spec-17 or subtasks on it.
