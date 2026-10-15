---
id: decision-17
title: "The desktop is optional: everything it runs is a core feature, reachable from the CLI and MCP; the desktop adds the chat and click-to-run"
type: decision
status: current
claimKey: desktop.role
kind: decision
tags:
  - desktop
  - core
  - cli
  - mcp
  - parity
createdAt: "2026-10-15T15:49:31.584Z"
---

## Description
The desktop is optional: everything it runs is a core feature, reachable from the CLI and MCP; the desktop adds the chat and click-to-run

Hand-offs, ACP agents and their registry, worktrees, review, landing and send-back, the epic lead, Discuss, issue import and board fixes are built in core, with a CLI command and an MCP tool for each (spec-13's parity rule), and the state they keep is on the board or in .brainfile/state/, never only in the desktop's memory or its Mac settings folder. The desktop is a client of the same core: what it adds is the window: the board's chat, Hand to… and Merge as one click, the dock, the review pane, live runs, notifications, updates and the phone link. A feature lands in core first and the desktop calls it; nothing new is built only in the desktop's agents process.

Why: a person without the desktop (Linux, a server, another editor, an agent in a terminal) should get the same hand-offs, leads and landings, and two implementations drift: the Hotline run of 2026-10-14 found landing and dependency rules that only the desktop had, and had to fix them there. Carried out by epic-6 (plan-2).
