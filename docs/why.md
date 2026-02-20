---
title: Why Brainfile?
description: The manifesto for agentic task coordination
---

# The Agentic Coordination Manifesto

## The Context Gap

AI agents are remarkably capable at implementation, but they operate in a void of coordination. While they can read your code, they cannot see your intent, your priorities, or your acceptance criteria unless you manually translate them from external tools (Jira, Linear, Notion) into every prompt.

This creates an **integration tax** on the human: copying requirements, updating statuses, and manually verifying that the agent stayed within scope.

**Brainfile is the solution to the context gap.**

---

## Principles of Coordination

::: info 1. Protocol over Platform
Coordination should be an open standard, not a closed SaaS feature. By defining coordination as a file-system protocol, we enable any agent and any tool to participate without a central API or vendor lock-in.
:::

::: info 2. Context Locality
The source of truth for work should live where the work happens: in the repository. When tasks and contracts are files in the codebase, they are naturally indexed by the agent alongside the source code, providing immediate, high-fidelity context.
:::

::: info 3. File-System Semantics
Complex state management is replaced by simple file operations. Moving a file from `board/` to `logs/` is an immutable, searchable, and version-controlled record of completion. This simplicity is the key to scalability and resilience.
:::

::: info 4. Explicit Contracts
Informal "please do X" requests are replaced by structured agreements. A contract defines exactly what constitutes success (deliverables) and how it will be measured (validation). This formalization reduces agent hallucination and ensures human-aligned outcomes.
:::

::: info 5. Architectural Memory
Decisions made today should automatically guide the work of tomorrow. By promoting ADRs to project rules, the protocol ensures that every agent interaction is grounded in the project's established architectural standards.
:::

---

## The Infrastructure Advantage

::: tip What You Gain
By adopting a file-based coordination protocol, you gain:

- **Bespoke Diffs**: See exactly how requirements changed over time in your git history.
- **Offline Reliability**: Your task board works on a plane, in a basement, or during a platform outage.
- **Zero Latency**: No API round-trips to fetch task context.
- **Agent Interoperability**: Use the same board with Claude, GitHub Copilot, Cursor, or your own custom agents.
:::

---

## Join the Ecosystem

Brainfile is more than a tool; it's a way of thinking about how humans and machines build software together.

- [Read the Specification](/reference/protocol) — The complete file format and YAML structure reference
- [Explore the CLI](/tools/cli) — Install in 30 seconds and start managing tasks from your terminal
- [Integrate the Core Library](/tools/core) — Build custom tooling with `@brainfile/core`
- [Set Up MCP](/tools/mcp) — Give your AI assistant direct access to your task board
- [Contract Guide](/guides/contracts) — Learn how agents coordinate through structured agreements
