---
title: Why Brainfile?
description: The case for task management that lives in your repo
---

# Why Brainfile?

## The Problem with Current Tools

**Task management is disconnected from code.**

Your tasks live in Linear, Jira, Notion, or GitHub Issues. Your code lives in git. These systems don't talk to each other in any meaningful way. You're the integration layer — copying task IDs into commit messages, manually updating status, context-switching between browser tabs.

**AI assistants can't see your tasks.**

Claude Code can read your entire codebase. It can see your git history, your test failures, your linter errors. But it has no idea what you're actually working on. You have to explain the task every time, paste in requirements, remind it of the acceptance criteria.

**SaaS tools create dependencies.**

Offline? Can't access tasks. Team changes? Export headaches. Service goes down? Work stops. Your project metadata lives on someone else's servers, in someone else's format.

---

## The Brainfile Approach

### Anatomy of a Brainfile

<div class="anatomy-diagram">
  <div class="anatomy-row">
    <div class="anatomy-card">
      <div class="anatomy-title">Metadata</div>
      <div class="anatomy-content">title, schema, version</div>
    </div>
    <div class="anatomy-card">
      <div class="anatomy-title">Agent</div>
      <div class="anatomy-content">instructions, tools</div>
    </div>
    <div class="anatomy-card">
      <div class="anatomy-title">Rules</div>
      <div class="anatomy-content">always, never, prefer</div>
    </div>
  </div>
  <div class="anatomy-connector">
    <div class="connector-line"></div>
    <div class="connector-arrow">▼</div>
  </div>
  <div class="anatomy-row">
    <div class="anatomy-card anatomy-wide">
      <div class="anatomy-title">Columns & Tasks</div>
      <div class="anatomy-content">Your kanban board — todo, in-progress, done</div>
    </div>
  </div>
  <div class="anatomy-connector">
    <div class="connector-line"></div>
    <div class="connector-arrow">▼</div>
  </div>
  <div class="anatomy-row">
    <div class="anatomy-card anatomy-result">
      <div class="anatomy-title">brainfile.md</div>
      <div class="anatomy-content">One file. Human + machine readable.</div>
    </div>
  </div>
</div>

<style>
.anatomy-diagram {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  margin: 2rem 0;
}
.anatomy-row {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}
.anatomy-card {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  min-width: 140px;
  text-align: center;
}
.anatomy-card.anatomy-wide {
  min-width: 300px;
}
.anatomy-card.anatomy-result {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-2);
  min-width: 280px;
}
.anatomy-title {
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin-bottom: 0.25rem;
}
.anatomy-content {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}
.anatomy-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 2rem;
}
.connector-line {
  width: 2px;
  height: 1rem;
  background: var(--vp-c-border);
}
.connector-arrow {
  color: var(--vp-c-text-3);
  font-size: 0.75rem;
  line-height: 1;
}
@media (max-width: 640px) {
  .anatomy-row {
    flex-direction: column;
    gap: 0.75rem;
  }
  .anatomy-card {
    min-width: 200px;
    width: 100%;
    max-width: 280px;
  }
  .anatomy-card.anatomy-wide,
  .anatomy-card.anatomy-result {
    min-width: 200px;
    max-width: 280px;
  }
}
</style>

**Tasks as code.**

A `brainfile.md` file in your repo. Structured YAML frontmatter that tools can parse. Human-readable markdown you can edit directly. It's data and documentation in one file.

```yaml
---
title: My Project
columns:
  - id: todo
    tasks:
      - id: task-1
        title: Implement authentication
        priority: high
---
```

**Git-native workflow.**

Branch your tasks with your code. Merge them together. See task changes in your diff. Roll back if needed. Your task history is your git history.

**AI-first integration.**

The MCP server exposes your tasks as tools. AI assistants don't read a file — they call structured operations: `list_tasks`, `add_task`, `move_task`. Type-safe. Error-handled. No YAML corruption.

---

## Comparison

| Feature | Brainfile | Linear/Jira | GitHub Issues | Notion |
|---------|-----------|-------------|---------------|--------|
| Lives in repo | ✅ | ❌ | ❌ | ❌ |
| Works offline | ✅ | ❌ | ❌ | ❌ |
| AI can update directly | ✅ MCP | ❌ | ❌ | ❌ |
| Version controlled | ✅ git | ❌ | Partial | ❌ |
| No account required | ✅ | ❌ | ❌ | ❌ |
| Free forever | ✅ | Freemium | Freemium | Freemium |
| Kanban UI | ✅ VSCode/TUI | ✅ | ❌ Projects | ✅ |
| Team collaboration | ✅ git | ✅ | ✅ | ✅ |

---

## Who It's For

### Developers Using AI Tools

You're already using Claude Code, Cursor, or Cline. You want your AI assistant to actually know what you're working on — not just your code, but your tasks. MCP integration means your assistant can list, create, and update tasks without you copy-pasting anything.

### Solo Devs Who Want Simplicity

You don't need Jira. You don't want to pay for Linear. You just want a task list that lives in your project, works offline, and doesn't require another account. Open your terminal, run `brainfile`, and you have a kanban board.

### Developers Tired of Freemium Tools

Every project management tool starts free, then slowly gates features behind pricing tiers. Brainfile is a file format — it's yours. No subscription. No "upgrade to unlock." No "your trial has ended."

### Builders Who Want a Foundation

The `@brainfile/core` library gives you parsing, serialization, validation, and operations. Build a custom CLI. Create a web dashboard. Integrate with your existing tools. The protocol is stable; build whatever you want on top.

### Anyone Who Wants Local-First Tasks

Maybe you're not a developer. Maybe you just want a personal task list that:
- Lives on your machine, not in the cloud
- Works without internet
- Can be backed up by copying a file
- Doesn't require creating yet another account

The TUI works great for personal task management too.

---

## Maybe Not For

- Large orgs with complex approval workflows
- Teams needing enterprise reporting and analytics
- Projects where non-technical stakeholders manage tasks
- Situations requiring audit trails beyond git history

---

## The Philosophy

> **The protocol is the product.**

Brainfile is a file format first, tools second. You can write `brainfile.md` by hand with any text editor. The CLI, VSCode extension, and MCP server are conveniences built on top of a stable specification.

This means:
- **No vendor lock-in** — It's just a markdown file
- **Ecosystem potential** — Anyone can build tools
- **Future-proof** — The format outlasts any single tool

---

## Next Steps

- [Quick Start](/quick-start) — Get running in 60 seconds
- [CLI Commands](/tools/cli) — Terminal interface
- [MCP Integration](/tools/mcp) — AI assistant setup
