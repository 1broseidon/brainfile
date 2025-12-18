---
title: Getting Started with Contracts
description: A 2-minute guide to agent-to-agent coordination
---

# Getting Started with Contracts

Brainfile isn't just for human-to-human task management. Its most powerful feature is **Agent Coordination**: the ability for one AI assistant (acting as a PM) to assign structured work to another AI assistant (the worker).

## What are Contracts?

A **Contract** is an optional set of rules attached to a task. It defines exactly what needs to be done, how it will be verified, and what constraints must be followed.

When an AI agent sees a task with a contract, it doesn't just "try its best"—it follows a formal lifecycle to ensure the work meets your specifications.

## Why use them?

- **Reliability**: Agents know exactly what deliverables are expected.
- **Automation**: Validation commands can automatically check work before it's marked "Done".
- **Delegation**: You (or your primary AI assistant) can delegate complex sub-tasks to other specialized agents with high confidence.

## A Simple Example

Imagine you want an agent to create a new React component. Instead of a vague task, you create a contract:

```yaml
id: task-101
title: "Create UserProfile component"
contract:
  status: ready
  deliverables:
    - type: file
      path: src/components/UserProfile.tsx
      description: Main component file
    - type: test
      path: src/components/UserProfile.test.tsx
  validation:
    commands:
      - npm test src/components/UserProfile.test.tsx
  constraints:
    - Use Tailwind CSS for styling
    - Must be a functional component
```

## The Coordination Lifecycle

1. **Draft**: The contract is being defined (usually by you or a PM agent).
2. **Ready**: The task is ready for a worker agent to pick up.
3. **In Progress**: A worker agent has started the work.
4. **Delivered**: The worker has finished and is waiting for validation.
5. **Done**: The work is validated and complete.

## Try it now

You can add a contract to any task using the CLI:

```bash
brainfile add --title "Refactor Auth" \
  --with-contract \
  --deliverable "src/auth.ts" \
  --validation "npm test"
```

Next, learn about [Complex Agent Workflows](./agent-workflows) or see the full [Contract Schema Reference](../reference/contract-schema).
