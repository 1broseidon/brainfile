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

## Ready?

<div class="cta-buttons">

[Get Started →](/quick-start)

[See the CLI →](/tools/cli)

</div>
