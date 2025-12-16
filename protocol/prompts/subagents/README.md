# Subagent Prompts

Subagents are **internal agents** spawned by a PM for quick, focused tasks. They return results directly to the PM (in-memory), without going through the brainfile contract flow.

## When to Use Subagents vs Contracts

| Subagent (@internal) | Contract (external) |
|---------------------|---------------------|
| Fast, in-process | Async, via brainfile |
| Returns to PM directly | Delivers via status change |
| Read-only research | Creates/modifies files |
| PM handles result | PM validates delivery |
| Seconds to minutes | Minutes to hours |

## Available Subagents

| Subagent | Purpose |
|----------|---------|
| `@research` | Codebase exploration, tech research, pattern discovery |
| `@review` | Code review, PR feedback (coming soon) |
| `@summarize` | Summarize docs, conversations, findings (coming soon) |

## Usage in PM Context

```yaml
# In brainfile.md - PM handles internally
- id: task-100
  title: Research caching options
  assignee: "@research"    # @ prefix = subagent
  # No contract needed - PM spawns subagent, gets result, continues

# vs external handoff
- id: task-101
  title: Implement caching
  assignee: codex          # No @ = external agent
  contract:
    status: ready          # Needs full contract for handoff
    deliverables: [...]
```

## Subagent Output Format

All subagents return structured markdown that the PM can:
1. Use directly for decision-making
2. Include in contract context for external agents
3. Store in docs for future reference

See individual subagent prompts for specific output formats.
