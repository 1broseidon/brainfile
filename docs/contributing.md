---
title: Contributing
---

# Contributing to Brainfile

Brainfile is an open-source project organized across multiple repositories under the [brainfile](https://github.com/brainfile) GitHub organization. Each repo has a focused scope, independent versioning, and its own CI/CD pipeline.

## Repositories

| Repository | Package | What lives here |
|---|---|---|
| [**brainfile/protocol**](https://github.com/brainfile/protocol) | — | Protocol specification, JSON schema, documentation site |
| [**brainfile/core**](https://github.com/brainfile/core) | `@brainfile/core` | TypeScript library — parser, validator, serializer |
| [**brainfile/cli**](https://github.com/brainfile/cli) | `@brainfile/cli` | Command-line tool and TUI |
| [**brainfile/vscode**](https://github.com/brainfile/vscode) | — | Visual Studio Code extension |

Pick the repo that matches what you want to work on and open issues or PRs there.

---

## Protocol (`brainfile/protocol`)

The specification, JSON schema, and this documentation site.

**Good first contributions:** documentation fixes, examples, schema clarifications.

**For protocol changes** (new fields, behavioral changes):

1. Open an issue first describing the use case
2. Consider backward compatibility with existing boards
3. Update `brainfile.schema.json` and protocol docs together
4. Bump `protocolVersion` if the change is breaking

```bash
git clone https://github.com/brainfile/protocol.git
cd protocol
cd docs && npm install && npm run dev   # local docs site
```

---

## Core Library (`brainfile/core`)

The TypeScript library that parses, validates, and manipulates `.brainfile/` boards. Used by the CLI, MCP server, and extensions.

**Good first contributions:** bug fixes, type improvements, test coverage.

```bash
git clone https://github.com/brainfile/core.git
cd core
npm install
npm test
npm run build
```

- Pure TypeScript, zero runtime dependencies
- Published to npm as `@brainfile/core`
- All board mutations must be immutable (return new objects)

---

## CLI (`brainfile/cli`)

The `brainfile` command-line tool — task management, contract workflows, and the TUI board view.

**Good first contributions:** new commands, improved error messages, shell completions.

```bash
git clone https://github.com/brainfile/cli.git
cd cli
npm install
npm run build
npm test
```

- Published to npm as `@brainfile/cli`
- Test across platforms (Linux, macOS, Windows)

---

## VS Code Extension (`brainfile/vscode`)

The visual board UI, inline task editing, and agent integration inside VS Code.

**Good first contributions:** UI polish, accessibility, new webview features.

```bash
git clone https://github.com/brainfile/vscode.git
cd vscode
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

- Uses a custom CSS kit (`webview-ui/src/styles/`) for consistent theming
- Board operations in `src/board/data/` are pure functions
- See the repo's `CONTRIBUTING.md` for the full architecture guide

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

→ [GitHub Discussions](https://github.com/orgs/brainfile/discussions)

---

## License

All Brainfile repositories are [MIT licensed](https://opensource.org/licenses/MIT). By contributing, you agree that your contributions will be licensed under the same terms.
