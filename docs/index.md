---
layout: home
title: Brainfile
titleTemplate: Task management for the AI era

hero:
  name: Brainfile
  text: Task management in your repo
  tagline: One markdown file. Full kanban board. AI assistants can read and update it directly.
  actions:
    - theme: brand
      text: Get Started
      link: /quick-start
    - theme: alt
      text: Why Brainfile?
      link: /why

features:
  - icon: 🤖
    title: AI Native
    details: Built-in MCP server lets Claude Code, Cursor, and Cline manage your tasks directly. No copy-paste. No context switching.
  - icon: 📁
    title: Lives in Your Repo
    details: A single brainfile.md file. Version control friendly. Branch it, merge it, diff it. No external database.
  - icon: ⌨️
    title: Multiple Interfaces
    details: Interactive terminal TUI, full CLI, VSCode kanban sidebar. Use what fits your workflow.
---

<style>
.problem-section {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}
.problem-section h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--vp-c-text-1);
}
.problem-section p {
  color: var(--vp-c-text-2);
  line-height: 1.7;
  margin-bottom: 1rem;
}
.install-block {
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  padding: 1.5rem;
  margin: 2rem auto;
  max-width: 600px;
  text-align: center;
}
.install-block code {
  font-size: 1.1rem;
  background: var(--vp-c-bg-alt);
  padding: 0.5rem 1rem;
  border-radius: 4px;
  display: inline-block;
}
.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  max-width: 900px;
  margin: 2rem auto;
  padding: 0 1.5rem;
}
.tool-card {
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  padding: 1.25rem;
  text-align: center;
}
.tool-card h4 {
  margin: 0 0 0.5rem 0;
  color: var(--vp-c-text-1);
}
.tool-card p {
  margin: 0;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}
.example-section {
  max-width: 900px;
  margin: 3rem auto;
  padding: 0 1.5rem;
}
.example-section h2 {
  text-align: center;
  margin-bottom: 1.5rem;
}
</style>

<div class="install-block">
  <code>npm install -g @brainfile/cli && brainfile init</code>
</div>

<div class="problem-section">

## The Problem

Your tasks live in Linear, Jira, or Notion. Your code lives in git. Your AI assistant can see your code but has no idea what you're working on. You're constantly context-switching, copy-pasting task descriptions, and manually updating status.

## The Solution

**Brainfile** puts your task board in a `brainfile.md` file right in your repo. It's structured YAML that tools can parse, but it's also just markdown you can read and edit. AI assistants update it directly via MCP — no manual syncing.

</div>

<div class="example-section">

## What It Looks Like

```yaml
---
schema: https://brainfile.md/v1/board.json
title: My Project
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Add user authentication
        priority: high
        tags: [backend, security]
  - id: in-progress
    title: In Progress
    tasks:
      - id: task-2
        title: Fix mobile navigation
        priority: medium
  - id: done
    title: Done
    tasks: []
---
```

</div>

<div class="tools-grid">
  <div class="tool-card">
    <h4>Terminal TUI</h4>
    <p>Interactive kanban in your terminal. Navigate with keyboard.</p>
  </div>
  <div class="tool-card">
    <h4>CLI Commands</h4>
    <p>Add, move, update tasks from the command line.</p>
  </div>
  <div class="tool-card">
    <h4>VSCode Extension</h4>
    <p>Visual kanban board in the sidebar. Drag and drop.</p>
  </div>
  <div class="tool-card">
    <h4>MCP Server</h4>
    <p>AI assistants manage tasks directly. Zero friction.</p>
  </div>
</div>

<div class="problem-section">

## AI Integration in 30 Seconds

Add this to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "brainfile": {
      "command": "npx",
      "args": ["@brainfile/cli", "mcp"]
    }
  }
}
```

Now Claude Code, Cursor, or any MCP-compatible assistant can:
- List and search your tasks
- Create new tasks with full metadata
- Move tasks between columns
- Update priorities, assignees, due dates
- Manage subtasks

No copy-paste. No "update the task board" reminders. It just works.

## Open Source

- [GitHub](https://github.com/brainfile) — All repositories
- [npm](https://www.npmjs.com/package/@brainfile/cli) — CLI package
- [Protocol](/reference/protocol) — Specification

</div>
