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
    details: Built for AI agents. Explicit instructions, structured data, and clear semantics ensure consistent behavior.
  - title: File Based
    details: Tasks live in markdown files with YAML frontmatter. Version control friendly. No databases. No lock-in.
  - title: Simple Format
    details: YAML frontmatter + Markdown content. Human readable, machine parseable.
  - title: Visual Tools
    details: VSCode extension with kanban board UI for visual task management.
  - title: Template System
    details: Built-in templates for bugs, features, and refactoring tasks.
---

## Schema URL

Use this in your `brainfile.md` files:

```yaml
schema: https://brainfile.md/v1
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
| [Core Library](/core/overview) | TypeScript/JavaScript library for parsing and validation |
| [CLI Tool](/cli/installation) | Command-line interface for task management |
| [VSCode Extension](/vscode/extension) | Visual kanban board integrated into your editor |

## Open Source

Brainfile is open source and protocol-first. All repositories are available on GitHub:

- [Protocol](https://github.com/brainfile/protocol) - Specification and schema
- [Core](https://github.com/brainfile/core) - TypeScript library
- [CLI](https://github.com/brainfile/cli) - Command-line tool
- [VSCode](https://github.com/brainfile/vscode) - Editor extension
