---
id: task-112
title: CI runs the desktop's checks (0.23.0 released 2026-10-16)
column: todo
position: 11
description: |-
  From the final pass (2026-10-16). Core and the CLI are still 0.22.1 with ten new commands, ten new MCP tools and a prompt, the subpaths `@brainfile/core/dispatch` and `/forge`, and a new runtime dependency (the ACP SDK). Until this ships, every Claude Code session on this machine that uses the published `brainfile mcp` (25 tools, no prompts) lacks task_restore, issues, pull_request, dispatch and its status/stop/lead, review, agents, discuss, where's fix and undo, task_patch's landsOn and epicBranch, task_add's source, and roles. Hand-off workers use that server too.

  Steps:
  1. `npm run version:set 0.23.0` (root, core, cli, and cli's dependency on core), then fold `changes/` with `node .github/scripts/changelog.mjs` (all fragments parse; every kind is known).
  2. Tag `v0.23.0` and let publish.yml run. Check core's `npm pack --dry-run` includes dist/dispatch, dist/forge and dist/repo, and that `dist/__tests__` is excluded (fixed in the final pass).
  3. After: `npm i -g brainfile@0.23.0` here, and `.mcp.json` in this repo may point at `cli/dist/cli.js` meanwhile.
  4. **CI:** ci.yml runs only core and the CLI. Add a desktop job (ubuntu is fine for `npm run typecheck && npm test`; `node scripts/build-electron.mjs` too), so a change to core that breaks the desktop fails CI. The e2e test (cli/src/__tests__/headless-epic.e2e.test.ts, 120 s timeout) has not yet run on GitHub's runners: watch its first run.
  5. Note the Node floor: core's dispatch requires an ESM-only SDK at runtime, so engines is now `>=20.19`.
priority: high
tags:
  - release
  - cli
  - core
  - ci
relatedFiles:
  - .github/workflows/ci.yml
  - .github/workflows/publish.yml
  - .github/scripts/sync-version.mjs
  - .github/scripts/changelog.mjs
  - changes/
createdAt: "2026-10-16T04:50:09.393Z"
updatedAt: "2026-10-16T05:57:37.134Z"
---

## Description
From the final pass (2026-10-16). Core and the CLI are still 0.22.1 with ten new commands, ten new MCP tools and a prompt, the subpaths `@brainfile/core/dispatch` and `/forge`, and a new runtime dependency (the ACP SDK). Until this ships, every Claude Code session on this machine that uses the published `brainfile mcp` (25 tools, no prompts) lacks task_restore, issues, pull_request, dispatch and its status/stop/lead, review, agents, discuss, where's fix and undo, task_patch's landsOn and epicBranch, task_add's source, and roles. Hand-off workers use that server too.

Steps:
1. `npm run version:set 0.23.0` (root, core, cli, and cli's dependency on core), then fold `changes/` with `node .github/scripts/changelog.mjs` (all fragments parse; every kind is known).
2. Tag `v0.23.0` and let publish.yml run. Check core's `npm pack --dry-run` includes dist/dispatch, dist/forge and dist/repo, and that `dist/__tests__` is excluded (fixed in the final pass).
3. After: `npm i -g brainfile@0.23.0` here, and `.mcp.json` in this repo may point at `cli/dist/cli.js` meanwhile.
4. **CI:** ci.yml runs only core and the CLI. Add a desktop job (ubuntu is fine for `npm run typecheck && npm test`; `node scripts/build-electron.mjs` too), so a change to core that breaks the desktop fails CI. The e2e test (cli/src/__tests__/headless-epic.e2e.test.ts, 120 s timeout) has not yet run on GitHub's runners: watch its first run.
5. Note the Node floor: core's dispatch requires an ESM-only SDK at runtime, so engines is now `>=20.19`.

## Log
- 2026-10-16T05:57:36.864Z: [claude] Released 2026-10-16 (Claude, at the person's go).
- Commit 4d39000 "Release 0.23.0": `npm run version:set 0.23.0`, CHANGELOG with 27 changes, lockfiles synced.
- main and tag v0.23.0 pushed. Publish, CI and Deploy Docs all passed; epic-6's tests ran on GitHub's Linux runners for the first time, including the e2e test.
- @brainfile/core 0.23.0 and brainfile 0.23.0 are on npm with provenance; GitHub Release: https://github.com/1broseidon/brainfile/releases/tag/v0.23.0
- The global CLI on this Mac is now 0.23.0 (mise node 26), so new Claude Code sessions and hand-off workers get today's tools. Sessions already open keep the old server until restarted.
Still open: step 4, a desktop job in ci.yml.
