# Orchestration Guide

This guide explains how to act as an orchestrator (PM) coordinating work across multiple AI agents using brainfile contracts.

::: tip Multi-Agent Orchestration in Pi
For a fully automated PM/Worker workflow with event-sourced coordination, worker presence, stale detection, and lease-based identity assignment, see the **[Pi Extension](/tools/pi)**.
:::

## Role

As orchestrator, you **plan, delegate, and coordinate** - you don't implement directly unless explicitly asked.

## Workflow Overview

<PipelineFlow />

## Step-by-Step

::: tip Core Principle
As orchestrator, your job is to **decompose, delegate, and verify** — not to implement. The more precise your contracts, the less rework you'll need.
:::

### 1. Receive Request

- Understand what the user wants
- Determine scope: quick task vs feature requiring planning
- Quick tasks: do them yourself
- Non-trivial work: create a contract

### 2. Plan

For non-trivial work, create a task with contract:

```bash
brainfile add -c todo \
  --title "Task title" \
  --description "Detailed requirements and context" \
  --assignee @brainfile-implementer \
  --priority high \
  --with-contract \
  --deliverable "file:src/feature.ts:Implementation" \
  --deliverable "test:src/__tests__/feature.test.ts:Tests" \
  --validation "npm test -- feature" \
  --constraint "Follow existing patterns"
```

Add validation subtasks:

```bash
brainfile subtask --add "@qa-agent complexity review" -t {task-id}
brainfile subtask --add "@qa-compliance spec compliance" -t {task-id}
```

For complex features, write PRD to `.brainfile/plans/{task-id}.md` and add to task's `relatedFiles`.

### 3. Research (if needed)

Delegate to `@brainfile-researcher` before planning when you need:
- External API documentation
- Library best practices
- Technical approach options

Researcher returns concise findings. You decide architecture.

::: tip Research First
When you're unsure about technical approach, always delegate to `@brainfile-researcher` before creating implementation contracts. Better specs upfront means fewer rework cycles.
:::

### 4. Delegate Implementation

Invoke `@brainfile-implementer` with task ID:

```
Implement task-{id}
```

Implementer will:
1. Pick up contract (`brainfile contract pickup`)
2. Implement according to deliverables/constraints
3. Deliver (`brainfile contract deliver`)
4. Return brief status

### 5. Validate

After delivery, run validation sequence:

**Step 1: `@brainfile-qa-agent`** - complexity review
- Pass: toggles `sub-qa-agent` subtask
- Fail: reports issues, subtask remains incomplete

**Step 2: `@brainfile-qa-compliance`** - spec compliance + reality check
- Runs `brainfile contract validate` if validation commands exist
- Pass: toggles `sub-qa-compliance` subtask
- Fail: reports issues, subtask remains incomplete

### 6. Handle Failures

When validation fails:

**Minor issues** - Add feedback, send back to implementer:
```yaml
# Edit task YAML
contract:
  feedback: |
    Issue description and what needs fixing
  status: ready  # Reset from failed/delivered
```

**Complex bugs** - Invoke `@brainfile-debugger` (Opus) for root cause analysis. After fix, route back through validation.

### 7. Complete

When all validation subtasks pass:

```bash
brainfile complete -t {task-id}
```

---

## Agent Delegation Reference

::: info Agent Roster
Match agent strengths to task types for optimal results.

| Need | Agent | Model |
|------|-------|-------|
| External docs, APIs, best practices | `@brainfile-researcher` | Sonnet |
| Any implementation work | `@brainfile-implementer` | Opus |
| Complexity/over-engineering check | `@brainfile-qa-agent` | Opus |
| Spec compliance + reality check | `@brainfile-qa-compliance` | Opus |
| Deep debugging | `@brainfile-debugger` | Opus |
| Codebase exploration | `@explore` (built-in) | - |
:::

---

## You vs Agents

**You handle:**
- Planning and task creation
- Architectural decisions
- Contract management (create, reset status, add feedback)
- Agent coordination
- Final approval and moving to done

**Agents handle:**
- Implementation (`@brainfile-implementer`)
- External research (`@brainfile-researcher`)
- Validation (`@brainfile-qa-agent`, `@brainfile-qa-compliance`)
- Debugging (`@brainfile-debugger`)

---

## Contract Lifecycle

| Status | Who Sets | How |
|--------|----------|-----|
| `ready` | You | `brainfile add --with-contract` |
| `in_progress` | Implementer | `brainfile contract pickup` |
| `delivered` | Implementer | `brainfile contract deliver` |
| `done` | You | After validation passes, `brainfile complete -t {id}` |
| `failed` | Validator | `brainfile contract validate` fails |
| `failed` → `ready` | You | Add feedback, reset status for rework |

---

## Context Preservation

Goal: Minimize context pollution, maximize working time before compaction.

- Agents return **concise summaries**, not full implementation details
- Task state lives in **brainfile**, not conversation
- Reference **task IDs**, not full descriptions
- Brainfile is **source of truth**

---

## Quick Reference

```bash
# Create task with contract
brainfile add -c todo --title "..." --with-contract \
  --deliverable "file:path:desc" --validation "cmd" --constraint "rule"

# Add validation subtasks
brainfile subtask --add "@qa-agent complexity review" -t {id}
brainfile subtask --add "@qa-compliance spec compliance" -t {id}

# View task
brainfile show -t {id}

# List by contract status
brainfile list --contract ready
brainfile list --contract delivered

# Complete task (moves to logs/)
brainfile complete -t {id}
```

---

## Standard Task Template

```yaml
- id: task-{N}
  title: Feature description
  description: |
    Detailed requirements and context.
    Include the "why" and acceptance criteria.
  priority: high
  assignee: @brainfile-implementer
  tags: [backend, feature]
  relatedFiles:
    - .brainfile/plans/task-{N}.md  # PRD if complex
    - src/existing/code.ts           # Reference code
  contract:
    status: ready
    deliverables:
      - path: src/feature.ts
        description: Main implementation
      - path: src/__tests__/feature.test.ts
        description: Unit tests
    validation:
      commands:
        - npm test -- feature
        - npm run build
    constraints:
      - Follow existing patterns
      - Include error handling
  subtasks:
    - id: sub-qa-agent
      title: "@qa-agent complexity review"
      completed: false
    - id: sub-qa-compliance
      title: "@qa-compliance spec compliance"
      completed: false
```
