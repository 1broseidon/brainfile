# Contributing to Brainfile

Thank you for your interest in contributing to Brainfile! As a protocol-first project, we welcome contributions that enhance the protocol, improve tooling, or expand documentation.

## Quick Start

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test` in vscode-extension/)
5. Commit with clear messages (`git commit -m 'feat: add new field to schema'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Multi-Repository Architecture

Brainfile is transitioning to a multi-repository architecture under the `github.com/brainfile` organization. Each component has its own repository with independent versioning and CI/CD:

| Repository | Purpose | Contributing |
|------------|---------|--------------|
| **brainfile/protocol** | Protocol specification, JSON schema, documentation | Schema changes, protocol docs |
| **brainfile/core** | TypeScript/JavaScript library (`@brainfile/core`) | Parser, validator, type definitions |
| **brainfile/cli** | Command-line tool (`@brainfile/cli`) | CLI commands, binary builds |
| **brainfile/vscode** | Visual Studio Code extension | UI features, webview, commands |

**Current State**: This is the monorepo that will be split into the above repositories. See [MIGRATION.md](./MIGRATION.md) for the migration plan.

### Contributing to Specific Repositories

**Protocol Changes** → `brainfile/protocol`
- Propose in GitHub Issues first
- Update `brainfile.schema.json`
- Update protocol documentation
- Consider backward compatibility

**Core Library** → `brainfile/core`
- TypeScript implementation
- Parser, serializer, validator
- Must pass all tests
- Published to npm as `@brainfile/core`

**CLI Tool** → `brainfile/cli`
- Add commands or improve existing ones
- Maintain binary compatibility
- Test across platforms (Linux, macOS, Windows)
- Published to npm as `@brainfile/cli`

**VSCode Extension** → `brainfile/vscode`
- UI/UX improvements
- Webview features
- Extension commands
- Published to VS Code Marketplace

### Current Monorepo Structure

```
brainfile/ (monorepo - will be split)
├── brainfile.schema.json       # → brainfile/protocol
├── docs/                       # → brainfile/protocol
│   └── protocol.md
├── packages/
│   ├── brainfile-core/         # → brainfile/core
│   └── brainfile-cli/          # → brainfile/cli
├── vscode-extension/           # → brainfile/vscode
├── example/                    # → brainfile/protocol
└── brainfile.md                # Project task board
```

## Types of Contributions

### Protocol Changes

Changes to the Brainfile protocol require careful consideration:

1. **Propose First**: Open an issue describing the change
2. **Update Schema**: Modify `brainfile.schema.json`
3. **Version Bump**: Update `protocolVersion` in schema
4. **Update Docs**: Modify `docs/protocol.md`
5. **Add Tests**: Ensure parsers handle the change
6. **Backward Compatibility**: Consider impact on existing tools

Example PR title: `feat(protocol): add effort field for AI planning`

### VSCode Extension

Improvements to the VSCode extension:

1. **Features**: New UI capabilities, commands, or views
2. **Bug Fixes**: Issues with parsing, syncing, or display
3. **Performance**: Optimizations for large boards
4. **UX**: Improvements to user experience

Development:
```bash
cd vscode-extension
npm install
npm run compile
# Press F5 in VSCode to test
```

### CLI Tool

Enhancements to the command-line interface:

1. **Commands**: New CLI commands
2. **Validation**: Schema validation improvements
3. **Integration**: Support for CI/CD pipelines

Development:
```bash
cd brainfile-cli
go build
./brainfile validate ../example/brainfile.md
```

### Documentation

We value clear, concise documentation:

1. **Protocol Docs**: Clarifications or examples
2. **Tool Guides**: How to use specific tools
3. **Integration Guides**: Using Brainfile with AI agents
4. **Examples**: Real-world usage patterns

## Coding Standards

### TypeScript (VSCode Extension)

- Use TypeScript strict mode
- Follow existing code style
- Add JSDoc comments for public APIs
- Keep functions focused and small
- Use meaningful variable names

### Go (CLI)

- Follow [Effective Go](https://golang.org/doc/effective_go)
- Use `go fmt` before committing
- Add tests for new functionality
- Keep error handling explicit

### Schema Changes

- Maintain backward compatibility when possible
- Use semantic versioning for protocol versions
- Document all fields clearly
- Provide sensible defaults

## Commit Message Convention

We follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Maintenance tasks

Include scope when relevant:
- `feat(protocol):` Protocol changes
- `fix(vscode):` VSCode extension fixes
- `docs(cli):` CLI documentation

## Testing

### VSCode Extension
```bash
cd vscode-extension
npm test
```

### CLI
```bash
cd brainfile-cli
go test ./...
```

### Schema Validation
```bash
# Validate example files against schema
npx ajv validate -s brainfile.schema.json -d example/brainfile.md --spec=draft7
```

## Pull Request Process

1. **Small PRs**: Keep changes focused and reviewable
2. **Clear Description**: Explain what and why
3. **Link Issues**: Reference related issues
4. **Update Docs**: Include documentation updates
5. **Pass Tests**: Ensure all tests pass
6. **Request Review**: Tag maintainers when ready

## Issue Templates

When creating issues, please use appropriate labels:

- `protocol`: Schema or specification changes
- `vscode`: VSCode extension issues
- `cli`: CLI tool issues
- `bug`: Something isn't working
- `enhancement`: New feature request
- `documentation`: Documentation improvements

## Community Guidelines

- Be respectful and constructive
- Help others in discussions
- Share your use cases and experiences
- Suggest improvements based on real needs
- Credit others' contributions

## Development Tips

### Working with the Protocol

1. Always validate changes against existing files
2. Consider AI agent compatibility
3. Keep human readability paramount
4. Test with both hidden and non-hidden files

### Debugging VSCode Extension

1. Use VSCode's Extension Host debugging
2. Check Developer Tools console (Help > Toggle Developer Tools)
3. Enable verbose logging in extension settings
4. Test with various board configurations

### Protocol Evolution

When proposing protocol changes, consider:

1. **Use Cases**: Real problems being solved
2. **Alternatives**: Other ways to achieve the goal
3. **Migration**: How existing files will upgrade
4. **Tooling Impact**: Changes needed in tools
5. **AI Compatibility**: How agents will use the feature

## Repository Split Strategy

We are migrating from a monorepo to multiple focused repositories. Here's the strategy:

### Phase 1: Preparation (Current)
- ✅ Rename all packages and identifiers
- ✅ Update schema URL to `brainfile.md/v1`
- ✅ Create GitHub organization
- ✅ Update all documentation

### Phase 2: Repository Setup
- Create empty repos in brainfile org
- Configure branch protection
- Set up GitHub Actions for each repo
- Configure secrets for publishing

### Phase 3: Code Migration
- Use `git subtree split` to preserve history
- Extract each package to its own repo
- Set up inter-repo dependencies via npm

### Phase 4: Publishing
- Publish `@brainfile/core` to npm
- Publish `@brainfile/cli` to npm
- Publish extension to VS Code Marketplace
- Configure `brainfile.md` domain (GitHub Pages)

### Phase 5: Cleanup
- Archive monorepo with redirect
- Update all external links
- Announce migration

**Full details**: See [MIGRATION.md](./MIGRATION.md) and [REPOSITORY_STRUCTURE.md](./REPOSITORY_STRUCTURE.md)

### Contributing During Migration

Until the split is complete:
- Continue contributing to the monorepo
- PRs will be migrated to new repos
- Issues will be transferred to appropriate repos

After the split:
- Clone only the repo you need
- Follow repo-specific CONTRIBUTING.md
- Open issues in the specific repository

## Release Process

### Current (Monorepo)
Releases are managed per package:

**VSCode Extension**:
1. Update version in `vscode-extension/package.json`
2. Create tag: `git tag vscode-v0.4.3`
3. GitHub Actions builds and publishes VSIX

**Core & CLI**:
1. Update version in respective `package.json`
2. Build: `npm run build`
3. Publish: `npm publish` (when ready)

### Future (Multi-Repo)
Each repository will have independent releases:
- Semantic versioning per repo
- Automated publishing via GitHub Actions
- Release notes in each repo

> **Note**: Build artifacts (VSIX, binaries) are never committed to the repository.

## Getting Help

- **Discord**: [Join our community](https://discord.gg/brainfile) (if available)
- **Issues**: Check existing issues or create new ones
- **Discussions**: Use GitHub Discussions for questions
- **Twitter**: Follow [@brainfileproto](https://twitter.com/brainfileproto) for updates

## Recognition

Contributors are recognized in:
- Release notes
- Contributors section in README
- Git history (with Co-authored-by tags when appropriate)

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

---

Thank you for helping make Brainfile better! Your contributions, whether code, documentation, or ideas, are valuable to the community.