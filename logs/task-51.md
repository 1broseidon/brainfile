---
id: task-51
title: Make handoffs configurable per task (model + effort)
description: "Related to task-50 (effort level in the model selector). Design is undecided and needs to be determined first: when handing off to Claude, does that always mean a fixed model (e.g. Opus), or can the user select model + effort per task — e.g. Opus xhigh for one task and Sonnet medium for another? Decide the default, where the choice lives at dispatch time, and how it interacts with the model selector's effort submenu (medium default)."
createdAt: "2026-10-13T21:38:32.537Z"
completedAt: "2026-10-17T05:09:12.028Z"
updatedAt: "2026-10-17T05:09:12.028Z"
---

## Description
Related to task-50 (effort level in the model selector). Design is undecided and needs to be determined first: when handing off to Claude, does that always mean a fixed model (e.g. Opus), or can the user select model + effort per task — e.g. Opus xhigh for one task and Sonnet medium for another? Decide the default, where the choice lives at dispatch time, and how it interacts with the model selector's effort submenu (medium default).

## Log
- 2026-10-14T03:00:09.096Z: [claude] When this is decided, the phone follows it too (epic-3, task-54): today brainfile-mobile's ChatStore.modelFor/effortFor and handOff mirror the desktop's per-agent, per-board memory, and a per-task choice would need the link to carry it (a dispatch argument or the task's own record).
- 2026-10-17T05:09:11.564Z: [claude] Folded into task-107 (2026-10-17 audit): task-107 is the design for choosing model and effort per hand-off. Completed as a duplicate, not built.
