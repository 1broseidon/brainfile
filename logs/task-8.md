---
id: task-8
type: task
title: "CLIError renders as raw stack trace instead of clean usage message"
tags:
  - bug
  - cli
  - ux
relatedFiles:
  - cli/src/cli.ts
  - cli/src/utils/errorHandler.ts
createdAt: "2026-08-11T22:08:02.098Z"
completedAt: "2026-08-12T05:16:13.087Z"
---

## Description
Repro: run 'brainfile complete task-5' (missing --task flag). Expected: one-line error + usage. Actual: full CLIError stack trace thrown through yoga-layout nbind.js. CLIError carries exitCode and details but nothing catches it at the top level in dist/cli.js — add a top-level catch that prints message + details and exits with exitCode. Found while dogfooding 0.18.1.

## Log
- 2026-08-12T05:16:13.087Z: [reconstructed] Archived body lost to migrate --logs-to-ledger (destructive pre-fix); frontmatter and description restored from ledger record.
