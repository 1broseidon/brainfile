---
title: Contributing
---

# Contributing to Brainfile

Brainfile is an open-source project developed in a single repository: [1broseidon/brainfile](https://github.com/1broseidon/brainfile). Each package lives in its own directory with a focused scope.

## Repository Layout

| Directory | Package | What lives here |
|---|---|---|
| [**cli/**](https://github.com/1broseidon/brainfile) | `brainfile` | Command-line tool, TUI, and MCP server |
| [**core/**](https://github.com/1broseidon/brainfile) | `@brainfile/core` | TypeScript library — parser, validator, serializer |
| [**docs/**](https://github.com/1broseidon/brainfile) | — | This documentation site and the board schemas |

Pick the directory that matches what you want to work on and open issues or PRs against the repo.

---

## Getting Started

```bash
git clone https://github.com/1broseidon/brainfile.git
cd brainfile
```

---

## Docs (`docs/`)

The documentation site and the JSON schemas for the board format.

**Good first contributions:** documentation fixes, examples, schema clarifications.

**For board format changes** (new fields, behavioral changes):

1. Open an issue first describing the use case
2. Consider backward compatibility with existing boards
3. Update the schema and docs together

```bash
cd docs && npm install && npm run dev   # local docs site
```

---

## Core Library (`core/`)

The TypeScript library that parses, validates, and manipulates `.brainfile/` boards. Used by the CLI and MCP server.

**Good first contributions:** bug fixes, type improvements, test coverage.

```bash
cd core
npm install
npm test
npm run build
```

- Pure TypeScript, zero runtime dependencies
- Published to npm as `@brainfile/core`
- All board mutations must be immutable (return new objects)

---

## CLI (`cli/`)

The `brainfile` command-line tool — task management, contract workflows, the TUI board view, and the MCP server.

**Good first contributions:** new commands, improved error messages, shell completions.

```bash
cd cli
npm install
npm run build
npm test
```

- Published to npm as [`brainfile`](https://www.npmjs.com/package/brainfile)
- Test across platforms (Linux, macOS, Windows)

---

## General Guidelines

### Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-change`)
3. Make changes and add tests
4. Commit with [conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`)
5. Open a Pull Request with a clear description

### Code Style

- TypeScript strict mode everywhere
- Prefer `const` over `let`
- No `any` without justification
- Add JSDoc for public APIs

### Commit Prefixes

| Prefix | Use for |
|---|---|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code change that doesn't fix a bug or add a feature |
| `test:` | Adding or updating tests |
| `chore:` | Tooling, CI, dependencies |

Include a scope when helpful: `feat(cli): add export command`, `fix(core): handle empty columns`.

---

## Discussions

Have a question, idea, or want to share how you're using Brainfile?

→ [GitHub Discussions](https://github.com/1broseidon/brainfile/discussions)

---

## License

Brainfile is [MIT licensed](https://opensource.org/licenses/MIT). By contributing, you agree that your contributions will be licensed under the same terms.
