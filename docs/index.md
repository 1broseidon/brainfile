---
layout: home
title: Brainfile
titleTemplate: Open protocol for agentic task coordination

hero:
  name: Brainfile
  text: Open protocol for agentic task coordination
  tagline: File-based task and contract workflow semantics for humans and AI agents. MIT licensed and implementation-transparent.
  actions:
    - theme: brand
      text: Read Specification
      link: /reference/protocol
    - theme: alt
      text: Reference
      link: /reference/commands
    - theme: alt
      text: Guides
      link: /guides/contracts

features:
  - icon: 📄
    title: File-based architecture
    details: Board config in `.brainfile/brainfile.md`, active tasks in `.brainfile/board/`, completed tasks in `.brainfile/logs/`.
  - icon: 🤝
    title: Contract lifecycle
    details: Structured PM ↔ worker workflow with deliverables, validation commands, constraints, and status transitions.
  - icon: 🧭
    title: Rules and ADR promotion
    details: Project rules live in config and ADRs can be promoted into persistent rules with source backlinks.
  - icon: 🔌
    title: Tool interoperability
    details: Use the same protocol through CLI/TUI, MCP server, VS Code extension, or custom tooling via `@brainfile/core`.
---

## Start here

- [Protocol specification](/reference/protocol)
- [Command reference](/reference/commands)
- [API and schema reference](/reference/api)
- [Contract system guide](/guides/contracts)
- [Tools overview](/tools/cli)

## Core semantics

- **Completion model**: tasks are completed by moving files from `board/` to `logs/` (not by moving to a default `done` column).
- **Types and strict mode**: document types (`task`, `epic`, `adr`, etc.) are declared in board config and can be strictly enforced.
- **Agent coordination**: contracts define what to build and how to validate delivery.

## Quick install

```bash
npm install -g @brainfile/cli
brainfile init
```
