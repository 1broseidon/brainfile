<p align="center">
  <img src="https://raw.githubusercontent.com/brainfile/protocol/main/logo.png" alt="Brainfile Logo" width="128" height="128">
</p>

# Brainfile Protocol

The canonical specification and JSON Schema for the Brainfile task management protocol.

## What is Brainfile?

Brainfile is a protocol-first task management system designed for AI-assisted development. It uses a simple YAML-based format in `brainfile.md` files that both humans and AI agents can understand.

## Schema

The JSON Schema is available at:
- **Canonical URL**: `https://brainfile.md/v1`
- **GitHub**: `brainfile.schema.json` (this repo)
- **Formats**: JSON (`v1.json`), YAML (`v1.yaml`)

### Usage

In your `brainfile.md` file:

```yaml
---
schema: https://brainfile.md/v1
title: My Project
# ... rest of your config
---
```

## AI Agent Integration

Add these instructions to your agent configuration file (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, etc.):

```markdown
# Task Management Rules

- review and follow rules in @brainfile.md
- update task status in @brainfile.md as you work (todo → in-progress → done)
- reference `schema` in the file for how to create tasks
- your existing tools do not modify this file, you need to edit it directly
```

**Recommended**: Keep only these minimal instructions in your agent config file, and use `brainfile.md` for project-specific rules and context. This keeps agent instructions clean and portable across projects.

## Quick Start

### Step 1: Copy the Example

Download the fully-featured example:

```bash
curl -o brainfile.md https://raw.githubusercontent.com/brainfile/protocol/main/example/brainfile.md
```

This includes multiple columns, tasks with metadata, project rules, and AI agent instructions.

**Alternative**: Use the [CLI tool](https://github.com/brainfile/cli) to initialize a minimal brainfile:

```bash
npm install -g @brainfile/cli
brainfile init
```

### Step 2: Integrate with Your AI Agent

Add the instructions above to your `AGENTS.md`, `CLAUDE.md`, or `.cursorrules` file. That's it.

Optional: Add this comment to your README to auto-load the board:

```markdown
<!-- load:brainfile.md -->
```

## Documentation

Complete documentation is available at **[brainfile.md](https://brainfile.md)**

The site includes:
- Protocol specification
- AI agent integration guide
- Core library API reference
- CLI tool documentation
- VSCode extension guide

## Deployment

This repository is deployed to `brainfile.md` via GitHub Pages. The documentation is built using Astro Starlight from the `docs/` directory.

**Schema Endpoints**:
- `https://brainfile.md/v1.json` - JSON Schema
- `https://brainfile.md/v1/` - Schema directory

## Examples

Example brainfile.md files are in the [`example/`](./example/) directory.

## Ecosystem

The Brainfile ecosystem consists of multiple repositories:

- **[@brainfile/core](https://github.com/brainfile/core)** - TypeScript/JavaScript library for parsing and manipulating brainfiles
- **[@brainfile/cli](https://github.com/brainfile/cli)** - Command-line tool for task management
- **[brainfile/vscode](https://github.com/brainfile/vscode)** - VSCode extension with kanban board UI

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## License

MIT License - see [LICENSE](./LICENSE)
