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
| [`validate`](#validate) | PM | Automatically run validation commands |
| [`approve`](#approve) | PM | Manually accept work and set status to `done` |
| [`reject`](#reject) | PM | Reject work and set status to `failed` |
| [`attach`](#attach) | PM | Add a contract to an existing task |
| [`blocked`](#blocked) | Worker | Mark a contract as blocked with a reason |
| [`reset`](#reset) | PM | Reset contract status (e.g., after unblocking) |

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
- **Success**: Sets status to `done`, moves task to completion column (if configured).
- **Failure**: Sets status to `failed`, adds command output to `contract.feedback`.

---

## approve

Manually approve a delivered contract, skipping automated validation.

```bash
brainfile contract approve --task task-42
```

**Options:**
- `-t, --task <id>` - Task ID (required)

**Side Effects:**
- Sets `contract.status` to `done`.
- Moves task to completion column.

---

## reject

Reject a delivered contract and provide feedback for rework.

```bash
brainfile contract reject --task task-42 --feedback "Missing unit tests for edge cases."
```

**Options:**
- `-t, --task <id>` - Task ID (required)
- `-f, --feedback <text>` - Explanation of why the work was rejected (required)

**Side Effects:**
- Sets `contract.status` to `failed`.
- Increments `contract.metrics.reworkCount`.

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

---

## blocked

Mark a contract as blocked due to external dependencies.

```bash
brainfile contract blocked --task task-42 --reason "Upstream API is down"
```

**Options:**
- `-t, --task <id>` - Task ID (required)
- `-r, --reason <text>` - Why the task is blocked (required)

**Side Effects:**
- Sets `contract.status` to `blocked`.

---

## reset

Reset a contract to a specific status. Useful for clearing blocked or failed states.

```bash
brainfile contract reset --task task-42 --status ready
```

**Options:**
- `-t, --task <id>` - Task ID (required)
- `-s, --status <name>` - Target status (default: `ready`)

```