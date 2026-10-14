---
id: decision-14
title: The chat manages the board; code work is a hand-off
type: decision
status: current
claimKey: desktop.chat.scope
kind: rule
stance: forbids
subject: code changes and commands in the board chat
tags:
  - desktop
  - chat
  - dispatch
createdAt: "2026-10-14T15:14:56.383Z"
---

## Description
The chat manages the board; code work is a hand-off

The board's chat is for the board: adding, changing, splitting and ordering tasks, recording decisions, answering questions about the board and the code, and handing work off. It is not where the work is done. Asked for a change to the code, its agent writes it as a task (or updates the task in context) with what it must do and how to check it, then hands it off with dispatch when the person asked for it done, else says it is ready to hand off. It reads the code freely, to write a good task, and never edits files or runs commands: the chat runs as a discussion does (decision-6), never in a bypass mode, read-only when the agent offers that, with edits, deletes, moves and commands refused before anyone is asked, except the brainfile command line when the MCP tools are missing. The window says this through words and structure, never an explanation (decision-10; tips are two or three words): the composer's placeholder names what it takes, and a task the turn added or changed carries Hand to… beside it under the reply. Why: Brainfile is a dispatcher, not a chat app (desktop/design.md › Dispatch). Work done in the chat skips the worktree, the review and the contract, and a second agent interface competes with the person's own (Hotline, a terminal).
