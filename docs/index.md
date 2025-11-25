---
layout: home
title: Brainfile
titleTemplate: Protocol-first task management for AI

hero:
  name: Brainfile
  text: Protocol-first task management
  tagline: A structured format for project tasks that both humans and AI agents can understand and modify
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/quick-start
    - theme: alt
      text: View Protocol
      link: /protocol/specification

features:
  - title: Protocol First
    details: The schema is the product. Tools and integrations are built around a single, well-defined protocol.
  - title: AI Native
    details: Built for AI agents. MCP server integration, hooks for Claude Code/Cursor/Cline, and structured instructions.
  - title: File Based
    details: Tasks live in markdown files with YAML frontmatter. Version control friendly. No databases. No lock-in.
  - title: MCP Integration
    details: Built-in MCP server lets AI assistants manage tasks directly via the Model Context Protocol.
  - title: Visual Tools
    details: VSCode extension with kanban UI. Interactive terminal TUI. Full CLI for automation.
  - title: Immutable Operations
    details: Core library provides type-safe operations for adding, updating, moving, archiving, and restoring tasks.
---

## Quick Start

```bash
npm install -g @brainfile/cli
brainfile init
brainfile            # Opens interactive TUI
```

## Quick Example

```yaml
---
schema: https://brainfile.md/v1
title: My Project
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Implement user authentication
        priority: high
        tags: [backend, security]
---

# My Project Tasks

This is the task board for my project.
```

## Ecosystem

| Package | Description |
|---------|-------------|
| [Protocol](/protocol/specification) | The canonical specification and JSON schema |
| [Core Library](/core/overview) | TypeScript/JavaScript library with immutable operations |
| [CLI Tool](/cli/installation) | Terminal UI, commands, hooks, and MCP server |
| [VSCode Extension](/vscode/extension) | Visual kanban board in your editor |

## AI Integration

**MCP Server** - Direct integration with AI assistants:

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

**Agent Hooks** - Automatic reminders during AI-assisted development:

```bash
brainfile hooks install claude-code
```

## Open Source

All repositories are available on GitHub:

- [Protocol](https://github.com/brainfile/protocol) - Specification and schema
- [Core](https://github.com/brainfile/core) - TypeScript library
- [CLI](https://github.com/brainfile/cli) - Command-line tool with MCP
- [VSCode](https://github.com/brainfile/vscode) - Editor extension
