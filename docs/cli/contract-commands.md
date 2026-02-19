---
title: CLI Contract Commands
description: Reference for agent-to-agent coordination commands
---

# CLI Contract Commands

Contract commands facilitate the lifecycle of agent-to-agent coordination. Most of these commands are designed to be used by AI agents, but they can also be used by humans managing a team of agents.

## Command Overview

| Command | Role | Description |
|---------|------|-------------|
| [`pickup`](#pickup) | Worker | Claim a task and set status to `in_progress` |
| [`deliver`](#deliver) | Worker | Submit completed work and set status to `delivered` |
| [`validate`](#validate) | PM | Check deliverables and run validation commands |
| [`attach`](#attach) | PM | Add a contract to an existing task |

::: tip Rework and blocking
To reject work: edit the task file to set `contract.status` back to `ready` and add feedback to `contract.feedback`.
To mark as blocked: edit the task file to set `contract.status` to `blocked`.
:::

---

## pickup

Claim a task for implementation. This sets the contract status to `in_progress` and records the start time.

```bash
brainfile contract pickup --task task-42
```

**Options:**
- `-t, --task <id>` - Task ID (required)

**Side Effects:**
- Sets `contract.status` to `in_progress`.
- Sets `contract.metrics.pickedUpAt` timestamp.

---

## deliver

Submit completed work for review. This validates that all deliverables are present and all subtasks are complete before setting status to `delivered`.

```bash
brainfile contract deliver --task task-42
```

**Options:**
- `-t, --task <id>` - Task ID (required)

**Side Effects:**
- Sets `contract.status` to `delivered`.
- Sets `contract.metrics.deliveredAt` timestamp.
- Calculates `contract.metrics.duration`.

---

## validate

Run the automated validation commands defined in the contract.

```bash
brainfile contract validate --task task-42
```

**Options:**
- `-t, --task <id>` - Task ID (required)

**Outcomes:**
- **Success**: Sets status to `done`. Use `brainfile complete -t task-42` to move to logs/.
- **Failure**: Sets status to `failed`, adds command output to `contract.feedback`.

---

## attach

Attach a contract definition to an existing task.

```bash
brainfile contract attach --task task-42 \
  --deliverable "src/main.ts" \
  --validation "npm test" \
  --constraint "Follow style guide"
```

**Options:**
- `-t, --task <id>` - Task ID (required)
- `--deliverable <path:description>` - Add a deliverable (repeatable)
- `--validation <command>` - Add a validation command (repeatable)
- `--constraint <text>` - Add an implementation constraint (repeatable)
- `--out-of-scope <text>` - Add an out-of-scope item (repeatable)



```