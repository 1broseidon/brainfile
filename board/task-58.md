---
id: task-58
title: Validate mobile parity work in review (epic-3)
column: review
position: 5
description: "Validate the four review tasks under epic-3 (task-54 models + effort, task-55 calm list, task-56 look and feel/copy, task-57 iOS polish) against their specs, epic-3 scope (linked mode only, GitHub-only unchanged except shared list/look), and decisions decision-7 (calm list), decision-9 (list-only) and decision-10 (plain copy). Check the uncommitted work on brainfile-mobile branch epic-3 and desktop feat/desktop-app: tests pass as logged (phone 125/125, desktop 161/161), link protocol-1 effort feature degrades to an older desk, glance holds for working tasks, tokens/type/signals match desktop/design.md, and native iOS chrome follows task-57's rule (native for chrome, desktop for content). Note task-51 is still open in todo, so task-54 follows the desktop's current per-agent remembered rule — flag whether that blocks closing task-54 or the epic. Leave a pass/fail note with evidence per task on this task and on each checked task, and say plainly what remains before epic-3 can close; do not close any task yourself."
priority: high
tags:
  - mobile
  - parity
  - validation
parentId: epic-3
createdAt: "2026-10-14T02:49:21.989Z"
assignee: custom:Muse Code
dispatch:
  agent: custom:Muse Code
  model: muse-wonder-1.0
  effort: xhigh
  by: chat
  at: "2026-10-14T02:49:24.452Z"
updatedAt: "2026-10-14T02:52:16.846Z"
---

## Description
Validate the four review tasks under epic-3 (task-54 models + effort, task-55 calm list, task-56 look and feel/copy, task-57 iOS polish) against their specs, epic-3 scope (linked mode only, GitHub-only unchanged except shared list/look), and decisions decision-7 (calm list), decision-9 (list-only) and decision-10 (plain copy). Check the uncommitted work on brainfile-mobile branch epic-3 and desktop feat/desktop-app: tests pass as logged (phone 125/125, desktop 161/161), link protocol-1 effort feature degrades to an older desk, glance holds for working tasks, tokens/type/signals match desktop/design.md, and native iOS chrome follows task-57's rule (native for chrome, desktop for content). Note task-51 is still open in todo, so task-54 follows the desktop's current per-agent remembered rule — flag whether that blocks closing task-54 or the epic. Leave a pass/fail note with evidence per task on this task and on each checked task, and say plainly what remains before epic-3 can close; do not close any task yourself.

## Log
- 2026-10-14T02:52:12.965Z: [claude] Validation complete (this branch dispatch/task-58; no code changed — board notes only). Verdicts with evidence are logged on each task: task-54 PASS but DO NOT CLOSE, task-55 PASS, task-56 PASS, task-57 PASS (code-verified; simulator/device evidence is from its log). Independently re-ran here: phone 125/125 and desktop 161/161 pass, phone and desktop typechecks clean, prettier clean — matching the logged counts. Protocol-1 effort degradation, working-task glance hold, tokens/type/signals vs desktop/design.md, plain copy (decision-10), calm/list-only (decision-7/decision-9) and the native-chrome rule were each checked in the uncommitted trees (brainfile-mobile branch epic-3, desktop feat/desktop-app). What remains before epic-3 can close, plainly: (1) task-51 (still in todo, undecided) must decide where the per-task model+effort choice lives — task-54 follows the desktop's current per-agent remembered rule, so task-54 cannot close and therefore epic-3 cannot close until task-51 lands or the epic is explicitly rescoped; (2) all epic work is still uncommitted, and the desktop branch mixes the link-effort hunks with the in-flight Discuss/Dock work (ChatPop removed, ChatPane/ChatKey added), so the branches need committing/splitting and human review before any close; (3) hands-on gaps remain exactly as logged — task-54's native menu was not tapped by hand originally (task-57's driver later exercised every menu) and the iPhone/simulator checks are logged, not re-run in this validation; (4) minor non-blocking residual: phone Decisions families still glance where the desktop shows them whole. No task was closed by this validation.
