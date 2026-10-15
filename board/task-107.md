---
id: task-107
title: "Desktop: Hand to… — a click hands off with the agent's last model and effort; Shift shows a › on each agent that opens its models (and efforts) to choose for this hand-off"
column: todo
position: 10
description: |-
  From the person, 2026-10-15, starting epic-6's lead. Hand to… (and "Lead with" on an epic) lists each agent with its model and effort at the right, e.g. "Opus 5.5 · high". A click hands off with exactly that, which is the quick path and stays as it is. There is no way to pick another model for this one hand-off without changing the default somewhere else first.

  **What to build**
  - **Shift shows the submenus.** While Shift is held, with the menu open or as it opens, each agent row shows a ›, the same affordance as "Lands on main ›". Shift-click on an agent, or → on a focused row, opens its submenu:
    - the models that agent offers (core's models cache, `listModels` / models.json), the current one marked;
    - each model with its efforts where it has them, through the same effort submenu the chat's model selector uses (medium unless the person picked another level this model still offers);
    - choosing one hands off with that model and effort.
  - **Remembered as the agent's last choice**, so the next plain click uses it, as the right-hand label already shows. Whether a one-off choice should also become the default is a design call: decide it here and say it in design.md.
  - **Agents with no models to choose** (custom ones, or a server that offers none) show no ›.
  - **The same submenu in "Lead with" on an epic**, and in Send back… where it picks an agent.
  - **Keyboard:** ↑/↓ move, →/← open and close the submenu, Enter hands off, Esc closes, all with no mouse.
  - **Related:** task-51 asked whether model and effort should be choosable per task; this answers it at hand-off time. Close task-51 with this one, or fold it in.
tags:
  - desktop
  - dispatch
  - hand-off
  - ui
relatedFiles:
  - desktop/src/renderer/lib/state.svelte.ts
  - core/src/dispatch/models.ts
  - core/src/dispatch/effort.ts
subtasks:
  - id: task-107-1
    title: Shift (held or at open) shows a › on agents with models; Shift-click or → opens the submenu
    completed: false
  - id: task-107-2
    title: Models with their efforts; a choice hands off with them
    completed: false
  - id: task-107-3
    title: Last choice remembered for the plain click; decide whether it becomes the default
    completed: false
  - id: task-107-4
    title: Same submenu in Lead with and Send back…
    completed: false
  - id: task-107-5
    title: "Keyboard: arrows, Enter, Esc"
    completed: false
  - id: task-107-6
    title: Tests for the window state, and design.md
    completed: false
createdAt: "2026-10-15T21:46:01.113Z"
---

## Description
From the person, 2026-10-15, starting epic-6's lead. Hand to… (and "Lead with" on an epic) lists each agent with its model and effort at the right, e.g. "Opus 5.5 · high". A click hands off with exactly that, which is the quick path and stays as it is. There is no way to pick another model for this one hand-off without changing the default somewhere else first.

**What to build**
- **Shift shows the submenus.** While Shift is held, with the menu open or as it opens, each agent row shows a ›, the same affordance as "Lands on main ›". Shift-click on an agent, or → on a focused row, opens its submenu:
  - the models that agent offers (core's models cache, `listModels` / models.json), the current one marked;
  - each model with its efforts where it has them, through the same effort submenu the chat's model selector uses (medium unless the person picked another level this model still offers);
  - choosing one hands off with that model and effort.
- **Remembered as the agent's last choice**, so the next plain click uses it, as the right-hand label already shows. Whether a one-off choice should also become the default is a design call: decide it here and say it in design.md.
- **Agents with no models to choose** (custom ones, or a server that offers none) show no ›.
- **The same submenu in "Lead with" on an epic**, and in Send back… where it picks an agent.
- **Keyboard:** ↑/↓ move, →/← open and close the submenu, Enter hands off, Esc closes, all with no mouse.
- **Related:** task-51 asked whether model and effort should be choosable per task; this answers it at hand-off time. Close task-51 with this one, or fold it in.
