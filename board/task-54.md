---
id: task-54
title: "Mobile linked: models + effort in chat and Hand to…, per task"
column: review
position: 1
description: Bring desktop's model + effort behaviour (task-50, task-51) to the phone when linked. Chat sheet and task sheet Hand to… offer the same agents/models as desktop, with effort as a touch equivalent of desktop's model > effort submenu (no separate effort dropdown), medium as the default where available. The per-task choice follows whatever task-51 decides (default, where the choice lives at dispatch, interaction with the selector) — do not invent a phone-only rule. The chosen agent/model/effort is what the desktop runs and what the run row shows on both devices. GitHub-only mode is unaffected. Plain labels for every level and action (decision-10).
priority: high
tags:
  - mobile
  - link
  - agents
  - models
parentId: epic-3
dependsOn:
  - task-51
createdAt: "2026-10-14T01:26:19.808Z"
updatedAt: "2026-10-14T02:01:23.727Z"
---

## Description
Bring desktop's model + effort behaviour (task-50, task-51) to the phone when linked. Chat sheet and task sheet Hand to… offer the same agents/models as desktop, with effort as a touch equivalent of desktop's model > effort submenu (no separate effort dropdown), medium as the default where available. The per-task choice follows whatever task-51 decides (default, where the choice lives at dispatch, interaction with the selector) — do not invent a phone-only rule. The chosen agent/model/effort is what the desktop runs and what the run row shows on both devices. GitHub-only mode is unaffected. Plain labels for every level and action (decision-10).

## Log
- 2026-10-14T02:01:23.334Z: [claude] Done (uncommitted: brainfile-mobile branch epic-3, desktop on feat/desktop-app). Link stays protocol 1: the desk's hello names features ['effort']; dispatch takes effort as its 5th argument, ask effort and efforts as its 9th and 10th; AgentRun.effort says the level asked for. The phone sends them only to a desk that names the feature, so an older desk never sees an extra argument. Phone: src/link/effort.ts keeps the desktop's rule (remembered level while the model offers it, else medium; none for the agent's default model); chat.ts remembers effort per board then anywhere, with effortFor, effortsFor and modelNote ('Opus · High'). The chat's agent and model picks are native menus (@expo/ui MenuView): a model with levels opens them under Effort as its submenu, the touch form of the desktop's model › effort menu; current model and level checked. Hand to… shows each agent's model note or its own note, as the desktop's. The run line shows its model and effort on both devices (desktop HandTo runNote, phone TaskAgents runNote). Assumption, since task-51 is undecided: the phone follows the desktop's current rule (per agent, remembered per board), and the two devices remember separately; task-51 can move the choice onto the task. Tests: phone 123/123 (hello features, effort memory, older desk gets 4 and 8 arguments), desktop 161/161 (hello, call shapes). docs/link.md updated. Not checked by hand: opening the native menu, since the simulator could not be tapped from here; the choice it makes was driven by a dev step (model:<project>:<agent>:<model>:<effort>) and checked on screen.
- 2026-10-14T02:51:57.965Z: [claude] Validation (task-58): PASS on implementation, DO NOT CLOSE yet. Evidence re-checked in code and by re-running suites (phone 125/125, desktop 161/161, both typechecks clean): protocol stays 1 (desktop LINK_PROTOCOL=1, LINK_FEATURES=['effort']); phone gates effort on takesEffort() so dispatch sends effort only as 5th arg and ask as 9th/10th to a desk naming the feature, and an older desk gets 4/8 args exactly (tests/desk.test.ts 'an older desk never does', tests/link.test.ts hello parsing); effortToSet/ChatStore.effortFor mirror desktop state.svelte.ts effortFor (remembered level while offered, else medium, none for the agent's default model); chat model pick is a native menu with Effort as the model's submenu, Hand to… shows modelNote, and runNote reads model+effort on both devices. BLOCKER: task-51 is still open in todo and undecided, so the 'per task' element of this task's title/spec is not delivered — the phone follows the desktop's current per-agent, per-board remembered rule and the two devices remember separately. That is the correct parity today, but task-54 should stay in Review until task-51 decides where the per-task choice lives; closing it now would claim per-task done when it is per-agent.
