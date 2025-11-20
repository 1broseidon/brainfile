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
