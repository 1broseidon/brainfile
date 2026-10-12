---
id: task-15
title: "contract validate: exit non-zero when validation fails"
column: in-progress
position: 1
priority: high
tags:
  - bug
  - contracts
  - cli
  - scripting
relatedFiles:
  - cli/src/cli.ts
  - cli/src/commands/contract.ts
createdAt: "2026-09-23T03:04:31.919Z"
assignee: codex
updatedAt: "2026-10-12T18:34:20.436Z"
---

## Description
contractValidateCommand returns { success: ok } (cli/src/commands/contract.ts:497), but the CLI action discards it: `.action((options) => { contractValidateCommand(options); })` (cli/src/cli.ts:~567). A failed validation sets the contract to failed and writes feedback, yet the process exits 0, so CI, scripts, dispatch wrappers and agents that trust the exit code treat a failed contract as passed.

Set process.exitCode = 1 when success is false (and audit the other contract subcommands and command actions for the same pattern of dropped results). Add a CLI test that a failing validation command yields a non-zero exit.

## Log
- 2026-10-12T01:32:46.527Z: [claude] Verified 2026-10-11: still open. cli/src/cli.ts:569 still discards contractValidateCommand's result, and contract.ts:497 returns { success: ok } that nothing reads.
