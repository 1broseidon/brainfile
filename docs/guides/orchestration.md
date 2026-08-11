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

Match agent strengths to task types. These are example roles — name and configure them to fit your workflow.

| Need | Example Role |
|------|-------------|
| External docs, APIs, best practices | Research agent |
| Any implementation work | Worker / implementer agent |
| Complexity and scope review | QA agent |
| Spec compliance verification | Compliance agent |
| Deep debugging | Debugging agent |
| Codebase exploration | Explorer agent |

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


## Task Dependencies

Coordinate multi-step workflows by declaring dependencies in task frontmatter. A task with a `contract.status` of `ready` is only schedulable once its dependencies are satisfied.

Use the `blockedBy` field to list task IDs that must complete first:

```yaml
---
id: task-3
title: Deploy to production
column: todo
blockedBy:
  - task-1  # Tests must pass
  - task-2  # Security review must complete
contract:
  status: ready
---
```

**Dependency semantics:**
1. `task-3` is not schedulable while `task-1` or `task-2` is incomplete.
2. When a blocking task completes, the dependency is considered satisfied.
3. When all blocking tasks are done, `task-3` becomes schedulable.

::: tip dependsOn vs blockedBy
Task frontmatter also supports a richer `orchestration.dependsOn` DAG with success-state policies (`done` vs `delivered`) and fan-in barriers. `blockedBy` is the simpler top-level field and is treated as a compatibility fallback for `dependsOn` by schedulers.
:::

### Common dependency shapes

**Linear chain** — each task blocked by the previous one:

```yaml
# task-2 blockedBy [task-1]; task-3 blockedBy [task-2]; task-4 blockedBy [task-3]
```

**Fan-out / fan-in** — parallel tasks converging on a join task:

```yaml
---
id: task-merge
title: Integrate all modules
column: todo
blockedBy: [task-1, task-5, task-9]   # join task waits for all three
contract:
  status: ready
---
```

The parallel tasks (`task-1`, `task-5`, `task-9`) carry no dependencies and can run concurrently; `task-merge` unblocks once all three complete.

## Epic Auto-Completion

When all child tasks of a parent complete, the parent auto-completes. Children link to a parent via `parentId`:

```yaml
---
id: epic-1
type: epic
title: Authentication overhaul
column: in-progress
---

# Separate task files:
# task-1 parentId: epic-1
# task-2 parentId: epic-1
```

**Cascade behavior** (handled by `brainfile complete`):
1. Complete `task-1` → `epic-1` still has an incomplete child (`task-2`).
2. Complete `task-2` → all children done → `epic-1` auto-completes.
3. If `epic-1` has its own parent, that parent's children are checked next.
4. The cascade continues up the tree.

::: warning Force Completion
Use `brainfile complete --task epic-1 --force` to complete an epic that still has active children. This overrides the incomplete-children guard.
:::

## Automated Dispatch (Supervisor)

The `brainfile` CLI itself does not spawn agent processes — task creation and completion are manual or agent-driven. To run a board **autonomously**, use the separate **`@brainfile/supervisor`** daemon (`bfs`), which watches `.brainfile/board/`, dispatches ready contracts to external agents, enforces quality gates, and advances the lifecycle.

```bash
# Watch the current workspace and start the daemon
bfs watch
bfs start

# Inspect and control running work
bfs status                 # daemon status
bfs dispatch <task-id>     # force-dispatch a ready task, bypassing cooldown
bfs cancel <task-id>       # abort a running job and reset it to draft
bfs logs --events          # stream live dispatch events
bfs stop                   # stop the daemon
```

**What the supervisor does each tick:**
1. Finds tasks whose contracts are `ready` and whose `blockedBy`/`dependsOn` dependencies are satisfied.
2. Dispatches them to their assigned agents (respecting `--concurrency`).
3. On completion, re-evaluates downstream tasks that become unblocked and dispatches the next wave.
4. Cascades epic auto-completion as children finish.

::: info Run it dry first
`bfs start --dry-run` shows the planned dispatch actions without spawning agents — useful for validating a dependency graph before going live. See the supervisor package for full configuration.
:::

## Orchestration Patterns

### Sequential delivery

Create a chain where each phase is blocked by the previous one, attach contracts, and let the supervisor advance it:

```bash
# Create the tasks with contracts (set blockedBy in each task's frontmatter)
brainfile add -c todo --title "Design API" --assignee backend-agent --with-contract --ready
brainfile add -c todo --title "Implement backend" --assignee backend-agent --with-contract
brainfile add -c todo --title "Write tests" --assignee qa-agent --with-contract

# Edit task frontmatter to chain dependencies:
#   "Implement backend" blockedBy: [task-1]
#   "Write tests"        blockedBy: [task-2]

# Run autonomously
bfs watch && bfs start
```

### Parallel research → synthesis

Create independent research tasks plus a join task blocked by all of them:

```bash
brainfile add -c todo --title "Research Redis" --assignee research-agent --with-contract --ready
brainfile add -c todo --title "Research Memcached" --assignee research-agent --with-contract --ready
brainfile add -c todo --title "Research DynamoDB" --assignee research-agent --with-contract --ready
brainfile add -c todo --title "Recommend caching solution" --assignee research-agent --with-contract
# Set the recommendation task's blockedBy: [task-1, task-2, task-3]
```

When all research tasks complete, the join task unblocks and the supervisor dispatches it.

### Epic with parallel streams

Group converging streams of work under one epic using `parentId`:

```bash
brainfile add --title "Payment system overhaul" --type epic -c in-progress

# Stream 1 (link each task to the epic)
brainfile add -c todo --title "Design Stripe schema" --parent epic-1 --assignee backend-agent --with-contract --ready
brainfile add -c todo --title "Implement webhooks" --parent epic-1 --assignee backend-agent --with-contract

# Stream 2
brainfile add -c todo --title "Design payment form" --parent epic-1 --assignee frontend-agent --with-contract --ready
brainfile add -c todo --title "Implement checkout UI" --parent epic-1 --assignee frontend-agent --with-contract

# When all child tasks complete, epic-1 auto-completes
```



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

# Complete task (appends to ledger.jsonl and archives)
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
