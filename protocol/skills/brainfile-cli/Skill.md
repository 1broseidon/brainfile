---
name: Brainfile CLI
description: Use the brainfile CLI for task management, contracts, and multi-agent coordination. Invoke when managing tasks, creating contracts, or coordinating work with other agents.
dependencies: brainfile (installed via npm)
---

# Brainfile CLI Skill

## Overview

The brainfile CLI is a powerful task management and multi-agent coordination tool. Use it to manage tasks, create contracts for other agents, track deliverables, and validate work. This skill provides comprehensive knowledge of all brainfile commands and workflows.

**When to use this skill:**
- Creating, updating, or managing tasks
- Setting up contracts for other agents (codex, cursor, gemini, etc.)
- Coordinating multi-agent workflows as a PM
- Validating deliverables and running contract workflows
- Querying task status or filtering by tags/columns

## Installation & Setup

```bash
# Initialize new brainfile structure
brainfile init

# Migrate from root brainfile.md to .brainfile/
brainfile migrate
```

Brainfile uses `.brainfile/brainfile.md` by default (auto-detects, falls back to root `brainfile.md`).

## Core Commands Reference

### Listing & Viewing Tasks

```bash
# List all tasks
brainfile list

# Filter by column
brainfile list -c todo
brainfile list -c in-progress
brainfile list -c done

# Filter by tag
brainfile list -t bug
brainfile list -t urgent

# Filter by contract status
brainfile list --contract ready
brainfile list --contract in_progress
brainfile list --contract delivered

# View single task details
brainfile show -t task-123
```

### Creating & Modifying Tasks

```bash
# Basic task creation
brainfile add -c todo -t "Implement feature X"

# Task with metadata
brainfile add -c todo \
  -t "Fix authentication bug" \
  -p high \
  --tags bug,security \
  --assignee alice

# Move task between columns
brainfile move -t task-123 -c in-progress

# Update task properties
brainfile patch -t task-123 -p critical --assignee bob
brainfile patch -t task-123 --description "Updated requirements"
```

### Subtask Management

```bash
# Add subtask
brainfile subtask --add "Write unit tests" -t task-123

# Toggle subtask completion
brainfile subtask --toggle sub-1 -t task-123

# Update subtask title
brainfile subtask --update sub-1 "Write integration tests" -t task-123
```

### Archiving & Deletion

```bash
# Archive task (moves to archive)
brainfile archive -t task-123

# Permanently delete task
brainfile delete -t task-123
```

## Contract System (v2.0)

Contracts are formal agreements between a PM (you) and worker agents (codex, cursor, gemini, human). They specify deliverables, validation criteria, and constraints.

### Contract Lifecycle States

| State | Meaning | Who Sets | Next Action |
|-------|---------|----------|-------------|
| `ready` | Contract created, waiting for pickup | PM | Agent: `contract pickup` |
| `in_progress` | Agent actively working | Agent | Agent: `contract deliver` or `blocked` |
| `blocked` | Agent stuck on dependency | Agent | PM: Resolve blocker, edit YAML to reset to `ready` |
| `delivered` | Work complete, awaiting review | Agent | PM: `contract validate` |
| `done` | PM validated and approved | PM | Move to completion column |
| `failed` | PM rejected, needs rework | PM | PM: Add feedback, reset to `ready` |

### Creating Contracts

**One-shot creation** (task + contract together):

```bash
brainfile add -c todo \
  --title "Implement rate limiter" \
  --description "Implement token bucket rate limiting to prevent API quota exhaustion" \
  --assignee codex \
  --priority high \
  --with-contract \
  --deliverable "file:src/rateLimiter.ts:Token bucket implementation" \
  --deliverable "test:src/__tests__/rateLimiter.test.ts:Unit tests" \
  --validation "npm test -- rateLimiter" \
  --validation "npm run build" \
  --constraint "Use token bucket algorithm" \
  --constraint "Must be non-blocking (async)"
```

**Attach contract to existing task:**

```bash
brainfile contract attach -t task-123 \
  --deliverable "file:docs/api.md:API documentation" \
  --validation "npm run build-docs"
```

**Deliverable format:** `type:path:description`
- Type: `file | test | docs | design | research` (optional)
- Path: Relative to project root (required)
- Description: Human-readable explanation (optional)

### Contract Operations

```bash
# Claim a contract (agent action)
brainfile contract pickup -t task-123

# Mark as delivered (agent action)
brainfile contract deliver -t task-123

# Validate deliverables (PM action)
brainfile contract validate -t task-123
```

### Contract Validation

**Automated validation** (when validation commands are defined):

```bash
brainfile contract validate -t task-123
```

This will:
1. Check all deliverable files exist
2. Run validation commands sequentially
3. Set status to `done` on success, `failed` on failure
4. Add error output to `contract.feedback` on failure

**Manual validation** (no validation commands or override):

```bash
# Review deliverables manually
brainfile show -t task-123

# Check files, test implementation, then manually edit YAML:
# - Change status to 'done' for approval
# - Change status to 'ready' and add feedback for rework
```

### Rework Flow

When validation fails:

1. Status automatically becomes `failed`
2. PM manually edits YAML to add `contract.feedback` field
3. PM changes status back to `ready`
4. Agent sees failed contract: `brainfile list --contract ready`
5. Agent re-picks up, reads feedback, fixes issues
6. Agent re-delivers
7. PM validates again

## Contract Structure (v2.0)

Key principle: **Task fields are the source of truth**. Contracts only specify deliverables and validation.

```yaml
- id: task-123
  title: Implement rate limiter
  description: |
    Implement token bucket rate limiting to prevent API quota exhaustion.
    Each provider has different limits. See CONTRACT_DESIGN.md for context.
  assignee: codex
  relatedFiles:
    - src/api/middleware.ts
    - src/config/types.ts
  contract:
    status: ready
    version: 1

    deliverables:
      - path: src/rateLimiter.ts
        description: Token bucket implementation
      - path: src/__tests__/rateLimiter.test.ts
        description: Unit tests

    validation:
      commands:
        - "npm test -- rateLimiter"
        - "npm run build"

    constraints:
      - "Use token bucket algorithm"
      - "Must be non-blocking (async)"

    outOfScope:
      - "UI for rate limit settings"

    metrics:
      pickedUpAt: "2025-12-17T10:00:00Z"
      deliveredAt: "2025-12-17T12:30:00Z"
      duration: 9000
      reworkCount: 0

    feedback: |
      (Only added after failed validation)
      Tests failing in rateLimiter.test.ts:42
      Expected 429, got 200. Check threshold logic.
```

**Changes from v1.0:**
- Removed `contract.context.background` → Use `task.description`
- Removed `contract.context.relevantFiles` → Use `task.relatedFiles`
- Added `metrics` tracking (auto-managed)
- Added `version` for contract amendments

## Assignee Conventions

- **External Agents:** `codex`, `cursor`, `gemini`, `claude`, `human` (Worker agents that pick up contracts)
- **Internal Subagents:** `@research`, `@review`, `@summarize` (Handled by PM immediately, no contract needed)

## PM Role: Default Workflow

**When a user asks you to implement something, assume it's a handoff to an external agent.**

Create a task with a contract UNLESS the user explicitly says:
- "You do this" / "Do this now" / "Implement this yourself"
- It's a quick research task (use `@research` subagent)
- It's immediate work in an active conversation

## Best Practices

### Contract Creation
1. **Be specific in deliverables** - Exact file paths, not vague descriptions
2. **Include validation commands** - Automated checks catch issues early
3. **Use task.description for context** - Detailed background and "why" go here
4. **Use task.relatedFiles** - Reference existing code the agent should review
5. **Keep constraints focused** - 3-5 key requirements, not exhaustive lists

### Agent Assignment
Match agent strengths to task types:
- `codex` - Backend/API work, complex algorithms
- `cursor` - Full-stack features, UI components
- `gemini` - Documentation, research, content generation
- `claude` - General implementation, refactoring
- `human` - Tasks requiring human judgment or external coordination

### Validation
1. **Validate promptly** - Don't leave deliveries in limbo
2. **Provide clear feedback** - When rejecting, explain exactly what needs fixing
3. **Update subtasks** - Mark deliverables as subtasks agents must complete

### Task Organization
1. **Update task status as you work:** `todo → in-progress → done`
2. **Use tags for categorization:** `bug`, `feature`, `docs`, `urgent`
3. **Set priorities appropriately:** `low`, `medium`, `high`, `critical`
4. **Keep related files updated:** Add files the agent should review

## State Tracking

Contracts track metrics in `.brainfile/state.json` (git-ignored):
- `pickedUpAt` - When agent claimed contract
- `deliveredAt` - When agent marked as delivered
- `duration` - Time between pickup and delivery (seconds)
- `reworkCount` - Number of re-pickups after failure

This file is auto-managed by the CLI - never edit manually.

## Common Workflows

### Creating a Task for Another Agent

```bash
# Full contract setup in one command
brainfile add -c todo \
  --title "Add OAuth authentication" \
  --description "Implement OAuth 2.0 flow for Google and GitHub providers" \
  --assignee codex \
  --priority high \
  --tags feature,auth \
  --with-contract \
  --deliverable "file:src/auth/oauth.ts:OAuth provider implementations" \
  --deliverable "test:src/__tests__/auth/oauth.test.ts:OAuth flow tests" \
  --deliverable "docs:docs/auth.md:Authentication documentation" \
  --validation "npm test -- auth" \
  --validation "npm run build" \
  --constraint "Support Google and GitHub providers" \
  --constraint "Use PKCE flow for security" \
  --constraint "Store tokens in httpOnly cookies"
```

### Checking on Agent Progress

```bash
# See all in-progress contracts
brainfile list --contract in_progress

# Check specific task
brainfile show -t task-123

# See all tasks assigned to an agent
brainfile list | grep "assignee: codex"
```

### Validating Delivered Work

```bash
# Automated validation
brainfile contract validate -t task-123

# If validation fails, manually edit YAML:
# 1. Add feedback under contract.feedback
# 2. Change status from 'failed' to 'ready'
# 3. Agent will see it and rework
```

### Organizing Tasks by Sprint

```bash
# Tag tasks with sprint number
brainfile patch -t task-123 --tags sprint-3,backend
brainfile patch -t task-124 --tags sprint-3,frontend

# View sprint tasks
brainfile list -t sprint-3
```

## Troubleshooting

### Contract Not Showing Up
- Check status: `brainfile show -t task-123`
- Verify assignee is set
- Ensure contract status is `ready`

### Validation Failing
- Check deliverable paths are correct (relative to project root)
- Run validation commands manually to debug
- Review `contract.feedback` for error details

### Agent Can't Pick Up Contract
- Verify status is `ready`, not `in_progress` or `blocked`
- Check that contract has deliverables defined
- Ensure agent has access to related files

## Documentation References

For detailed documentation:
- **Contract System Guide:** `protocol/docs/guides/contracts.md`
- **Agent Workflows:** `protocol/docs/guides/agent-workflows.md`
- **CLI Reference:** `protocol/docs/cli/contract-commands.md`
- **Architecture:** `CONTRACT_DESIGN.md`
- **Schema:** `protocol/v1/board.json`

## Quick Reference Card

```bash
# Task Management
brainfile list [-c COLUMN] [-t TAG] [--contract STATUS]
brainfile show -t TASK_ID
brainfile add -c COLUMN -t "Title" [-p PRIORITY] [--tags TAG1,TAG2]
brainfile move -t TASK_ID -c COLUMN
brainfile patch -t TASK_ID [-p PRIORITY] [--assignee NAME]
brainfile archive -t TASK_ID
brainfile delete -t TASK_ID

# Subtasks
brainfile subtask --add "Title" -t TASK_ID
brainfile subtask --toggle SUB_ID -t TASK_ID

# Contracts (PM)
brainfile add --with-contract \
  --deliverable "TYPE:PATH:DESC" \
  --validation "COMMAND" \
  --constraint "RULE"
brainfile contract attach -t TASK_ID --deliverable "..." --validation "..."
brainfile contract validate -t TASK_ID

# Contracts (Agent)
brainfile contract pickup -t TASK_ID
brainfile contract deliver -t TASK_ID

# Setup
brainfile init
brainfile migrate
```

## Examples

See `EXAMPLES.md` for real-world contract examples and workflows.
