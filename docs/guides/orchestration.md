# Orchestration Guide

This guide explains how to act as an orchestrator (PM) coordinating work across multiple AI agents using brainfile contracts.

## Role

As orchestrator, you **plan, delegate, and coordinate** — you don't implement directly unless explicitly asked.

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
  --assignee worker-agent \
  --priority high \
  --with-contract \
  --deliverable "file:src/feature.ts:Implementation" \
  --deliverable "test:src/__tests__/feature.test.ts:Tests" \
  --validation "npm test -- feature" \
  --constraint "Follow existing patterns"
```

Add validation subtasks:

```bash
brainfile subtask --add "QA complexity review" -t {task-id}
brainfile subtask --add "Spec compliance check" -t {task-id}
```

For complex features, write PRD to `.brainfile/plans/{task-id}.md` and add to task's `relatedFiles`.

### 3. Research (if needed)

Delegate to a research agent before planning when you need:
- External API documentation
- Library best practices
- Technical approach options

The research agent returns concise findings. You decide architecture.

::: tip Research First
When you're unsure about technical approach, always research before creating implementation contracts. Better specs upfront means fewer rework cycles.
:::

### 4. Delegate Implementation

Assign the task to a worker agent. The worker will:
1. Pick up the contract (`brainfile contract pickup`)
2. Implement according to deliverables and constraints
3. Deliver (`brainfile contract deliver`)
4. Return a brief status summary

### 5. Validate

After delivery, run your validation sequence:

**Step 1: Complexity review** — does the implementation match the scope?
- Pass: toggle the QA subtask
- Fail: report issues, subtask remains incomplete

**Step 2: Spec compliance** — does it meet the contract?
- Run `brainfile contract validate` if validation commands exist
- Pass: toggle the compliance subtask
- Fail: report issues, subtask remains incomplete

### 6. Handle Failures

When validation fails:

**Minor issues** — add feedback and send back to the worker:
```yaml
# Edit task YAML
contract:
  feedback: |
    Issue description and what needs fixing
  status: ready  # Reset from failed/delivered
```

**Complex bugs** — delegate to a debugging agent for root cause analysis. After the fix, route back through validation.

### 7. Complete

When all validation subtasks pass:

```bash
brainfile complete -t {task-id}
```

## Agent Delegation Reference

::: info Agent Roles
Match agent strengths to task types for optimal results. These are example roles — name and configure them to fit your workflow.

| Need | Example Role |
|------|-------------|
| External docs, APIs, best practices | Research agent |
| Any implementation work | Worker / implementer agent |
| Complexity and scope review | QA agent |
| Spec compliance verification | Compliance agent |
| Deep debugging | Debugging agent |
| Codebase exploration | Explorer agent |
:::

## You vs Agents

**You handle:**
- Planning and task creation
- Architectural decisions
- Contract management (create, reset status, add feedback)
- Agent coordination
- Final approval and completion

**Agents handle:**
- Implementation
- External research
- Validation and QA
- Debugging

## Contract Lifecycle

| Status | Who Sets | How |
|--------|----------|-----|
| `ready` | PM | `brainfile add --with-contract` |
| `in_progress` | Worker | `brainfile contract pickup` |
| `delivered` | Worker | `brainfile contract deliver` |
| `done` | PM | After validation passes, `brainfile complete -t {id}` |
| `failed` | Validator | `brainfile contract validate` fails |
| `failed` → `ready` | PM | Add feedback, reset status for rework |

## Context Preservation

Goal: minimize context pollution, maximize working time before compaction.

- Agents return **concise summaries**, not full implementation details
- Task state lives in **brainfile**, not conversation
- Reference **task IDs**, not full descriptions
- Brainfile is **source of truth**

## Quick Reference

```bash
# Create task with contract
brainfile add -c todo --title "..." --with-contract \
  --deliverable "file:path:desc" --validation "cmd" --constraint "rule"

# Add validation subtasks
brainfile subtask --add "QA review" -t {id}
brainfile subtask --add "Spec compliance" -t {id}

# View task
brainfile show -t {id}

# List by contract status
brainfile list --contract ready
brainfile list --contract delivered

# Complete task (moves to logs/)
brainfile complete -t {id}
```

## Standard Task Template

```yaml
- id: task-{N}
  title: Feature description
  description: |
    Detailed requirements and context.
    Include the "why" and acceptance criteria.
  priority: high
  assignee: worker-agent
  tags: [backend, feature]
  relatedFiles:
    - .brainfile/plans/task-{N}.md
    - src/existing/code.ts
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
    - id: sub-qa
      title: "QA complexity review"
      completed: false
    - id: sub-compliance
      title: "Spec compliance check"
      completed: false
```
