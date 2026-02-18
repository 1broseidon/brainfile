# Agent Team Configuration

This directory contains a pre-configured AI agent team for multi-agent development workflows using brainfile contracts.

## Team Overview

| Agent | Role | Model | When to Use |
|-------|------|-------|-------------|
| `@developer` | Implementation | opus | Execute planned work via contracts |
| `@researcher` | Research | sonnet | Gather docs, APIs, best practices before planning |
| `@reviewer` | Code Review | opus | Check for over-engineering after delivery |
| `@qa` | Quality Assurance | opus | Verify spec compliance after review |
| `@debugger` | Debugging | opus | Root cause analysis when validation fails |

## Workflow

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│  1. Plan    │ ─▶ │ 2. Implement │ ─▶ │ 3. Validate │ ─▶ │ 4. Complete  │
│  Create     │    │ @developer   │    │ @reviewer   │    │ Move to done │
│  contract   │    │ picks up     │    │ @qa         │    │              │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘
```

### Step-by-Step

1. **Plan** (Main Chat / Orchestrator)
   - Understand requirements
   - Optionally dispatch `@researcher` for external docs
   - Create task with contract in brainfile.md

2. **Implement** (`@developer`)
   - Picks up contract: `brainfile contract pickup -t {task-id}`
   - Implements according to specs
   - Delivers: `brainfile contract deliver -t {task-id}`

3. **Validate** (`@reviewer` → `@qa`)
   - `@reviewer` checks for over-engineering
   - `@qa` verifies spec compliance and runs tests
   - Each toggles their subtask on pass

4. **Complete** (Main Chat)
   - When both validation subtasks pass
   - Move task to done: `brainfile move -t {task-id} -c done`

### Handling Failures

- **Simple issues**: Add feedback to contract, reset status to `ready`, send back to `@developer`
- **Complex bugs**: Dispatch `@debugger` for root cause analysis, then re-validate

## Installation

Copy the `agents/` directory to your Claude Code agents location:

```bash
# Claude Code agents directory
cp -r agents/* ~/.claude/agents/

# Or for project-specific agents
cp -r agents/* .claude/agents/
```

## Contract Subtasks

When creating tasks, add validation subtasks:

```bash
brainfile subtask --add "@reviewer complexity check" -t {task-id}
brainfile subtask --add "@qa spec compliance" -t {task-id}
```

Or use subtask IDs matching agent expectations:

```yaml
subtasks:
  - id: sub-review
    title: "@reviewer complexity check"
    completed: false
  - id: sub-qa
    title: "@qa spec compliance"
    completed: false
```

## Agent Communication

Agents return concise summaries to preserve context:

```
## Task: task-123
**Status**: Delivered
**Deliverables**: src/feature.ts, src/__tests__/feature.test.ts
**Next**: @reviewer complexity check
```

The brainfile is the source of truth - full details live there, not in conversation.

## Customization

Each agent file uses YAML frontmatter for configuration:

```yaml
---
name: developer
description: Implementation agent for brainfile contracts...
model: opus  # or sonnet, haiku
---
```

Modify the markdown content to adjust agent behavior for your team's needs.
