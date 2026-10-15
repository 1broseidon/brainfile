---
id: task-104
title: "Bug: Antigravity over ACP asks to sign in every day, sometimes on every launch, though it is signed in on this Mac"
column: todo
position: 11
description: |-
  Reported 2026-10-15. Handing work to Antigravity, or starting a session with it, asks for authentication about once a day, and sometimes on every launch of the app, though Antigravity itself is signed in on this machine. Claude Code, Codex and the other agents don't do this.

  **How it runs today.** We download the ACP registry's Antigravity server ourselves: `ANTIGRAVITY` in core/src/dispatch/agents.ts pins 1.3.0, `agy_acp_server.par`, unpacked under `<data dir>/agents/antigravity/1.3.0/`. We start it with `agentEnv()` (the app's environment, with PATH given the real node). Everything else is a generic ACP session (core/src/dispatch/session.ts).

  **Leads to check, unconfirmed:**
  - **We never call ACP `authenticate`.** initialize returns `authMethods`, but the session code doesn't look at them. Find out whether Antigravity's server expects the client to call `authenticate` with a cached-credentials method, and refreshes the token only then. That would explain a sign-in about every day, when an access token expires and nothing refreshes it.
  - **Where its credentials live.** The Keychain, `~/.gemini`, or Antigravity's app support folder. Check whether our copy of the server can read them:
    - a Keychain item whose access list names Antigravity's own binary would ask again for a different binary, our `.par`;
    - HOME or XDG variables that differ when the app is launched from the Dock and when it is run from a terminal (`npm run dev`).
  - **The pinned version.** 1.3.0 may be older than the registry's current server and older than the Antigravity app's own, with a different credential store or format. Compare with the registry (registry.ts) and with what Antigravity ships.
  - **"Sometimes on every launch."** Check whether something is cleared or replaced when the app starts: the agents folder, a temp HOME, or a fresh process environment.

  **Done when** Antigravity signed in once stays signed in across days and app restarts, as it does in its own app. Add a test where the code can be tested (an `authMethods` / `authenticate` round trip against a fake ACP agent, as the session tests already use), and a note on what the cause turned out to be.
priority: high
tags:
  - bug
  - acp
  - antigravity
  - agents
relatedFiles:
  - core/src/dispatch/agents.ts
  - core/src/dispatch/session.ts
  - desktop/src/agents/agents.ts
subtasks:
  - id: task-104-1
    title: Reproduce, and find where Antigravity keeps its sign-in and how it refreshes it
    completed: false
  - id: task-104-2
    title: "Find the cause: authenticate never called, credential store access, pinned version, or environment"
    completed: false
  - id: task-104-3
    title: Fix, with a test against a fake ACP agent where it is code
    completed: false
  - id: task-104-4
    title: Signed in once, it stays signed in across days and restarts
    completed: false
createdAt: "2026-10-15T20:37:50.145Z"
---

## Description
Reported 2026-10-15. Handing work to Antigravity, or starting a session with it, asks for authentication about once a day, and sometimes on every launch of the app, though Antigravity itself is signed in on this machine. Claude Code, Codex and the other agents don't do this.

**How it runs today.** We download the ACP registry's Antigravity server ourselves: `ANTIGRAVITY` in core/src/dispatch/agents.ts pins 1.3.0, `agy_acp_server.par`, unpacked under `<data dir>/agents/antigravity/1.3.0/`. We start it with `agentEnv()` (the app's environment, with PATH given the real node). Everything else is a generic ACP session (core/src/dispatch/session.ts).

**Leads to check, unconfirmed:**
- **We never call ACP `authenticate`.** initialize returns `authMethods`, but the session code doesn't look at them. Find out whether Antigravity's server expects the client to call `authenticate` with a cached-credentials method, and refreshes the token only then. That would explain a sign-in about every day, when an access token expires and nothing refreshes it.
- **Where its credentials live.** The Keychain, `~/.gemini`, or Antigravity's app support folder. Check whether our copy of the server can read them:
  - a Keychain item whose access list names Antigravity's own binary would ask again for a different binary, our `.par`;
  - HOME or XDG variables that differ when the app is launched from the Dock and when it is run from a terminal (`npm run dev`).
- **The pinned version.** 1.3.0 may be older than the registry's current server and older than the Antigravity app's own, with a different credential store or format. Compare with the registry (registry.ts) and with what Antigravity ships.
- **"Sometimes on every launch."** Check whether something is cleared or replaced when the app starts: the agents folder, a temp HOME, or a fresh process environment.

**Done when** Antigravity signed in once stays signed in across days and app restarts, as it does in its own app. Add a test where the code can be tested (an `authMethods` / `authenticate` round trip against a fake ACP agent, as the session tests already use), and a note on what the cause turned out to be.
