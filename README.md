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

See the [`docs/`](./docs/) directory for:
- [`protocol.md`](./docs/protocol.md) - Full protocol specification
- [`agents.md`](./docs/agents.md) - AI agent integration guide

## Examples

Example brainfile.md files are in the [`example/`](./example/) directory.

## Related Repositories

- **[@brainfile/core](https://github.com/brainfile/core)** - TypeScript/JavaScript library
- **[@brainfile/cli](https://github.com/brainfile/cli)** - Command-line tool
- **[brainfile/vscode](https://github.com/brainfile/vscode)** - VSCode extension

## Schema Versions

| Version | URL | Status |
|---------|-----|--------|
| v1 | `https://brainfile.md/v1` | Current |

Future versions will be available at `v2`, `v3`, etc.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## Migration

Migrating from the old monorepo? See [MIGRATION.md](./MIGRATION.md).

## License

MIT License - see [LICENSE](./LICENSE)
## Quick Links

- **Live Schema**: https://brainfile.md/v1 (coming soon)
- **GitHub.io**: https://brainfile.github.io/protocol/
