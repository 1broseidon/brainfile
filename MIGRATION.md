# Migration Guide: Monorepo to Multi-Repo

This guide explains the migration from the `1broseidon/bangbang` monorepo to the new multi-repository structure under the `brainfile` GitHub organization.

## 🎯 Why We're Splitting

The Brainfile project is splitting into focused repositories to:
- **Separate concerns**: Protocol, libraries, and tools have independent lifecycles
- **Independent CI/CD**: Each repo can have optimized build and release pipelines
- **Better discoverability**: Users can find and star individual components
- **Cleaner dependencies**: No circular dependencies between packages
- **Protocol-first**: The protocol lives in its own repo and is served via `brainfile.md`

---

## 📦 New Repository Structure

| Repository | Purpose | URL |
|------------|---------|-----|
| **protocol** | JSON Schema, protocol spec, docs | `https://github.com/brainfile/protocol` |
| **core** | TypeScript/JavaScript library | `https://github.com/brainfile/core` |
| **cli** | Command-line interface | `https://github.com/brainfile/cli` |
| **vscode** | Visual Studio Code extension | `https://github.com/brainfile/vscode` |

---

## 🚀 What's Changing

### For Users

#### Schema URL
**Old**:
```yaml
schema: https://raw.githubusercontent.com/1broseidon/bangbang/refs/heads/main/bangbang.schema.json
```

**New**:
```yaml
schema: https://brainfile.md/v1
```

**Also available**:
- `https://brainfile.md/v1.json` - JSON format
- `https://brainfile.md/v1.yaml` - YAML format
- `https://brainfile.md/schema/v1` - Alternative path

#### NPM Packages

**Core Library**:
```bash
# Old (not yet published)
npm install @bangbang/core

# New
npm install @brainfile/core
```

**CLI Tool**:
```bash
# Old
npm install -g @bangbang/cli
bangbang list

# New
npm install -g @brainfile/cli
brainfile list
```

#### VSCode Extension
- Extension ID changed from `bangbang.bangbang` to `brainfile.brainfile`
- Uninstall old extension and install new one from marketplace
- Your `brainfile.md` files will work seamlessly

---

### For Contributors

#### Repository URLs

**Old monorepo**:
```bash
git clone https://github.com/1broseidon/bangbang.git
cd bangbang/packages/bangbang-core
```

**New structure**:
```bash
# Clone only what you need
git clone https://github.com/brainfile/core.git
git clone https://github.com/brainfile/cli.git
git clone https://github.com/brainfile/vscode.git
git clone https://github.com/brainfile/protocol.git
```

#### Contributing Workflow

**Before** (Monorepo):
1. Fork `1broseidon/bangbang`
2. Make changes to `packages/bangbang-core/`
3. Submit PR to monorepo

**After** (Multi-repo):
1. Fork the specific repo (e.g., `brainfile/core`)
2. Make changes
3. Submit PR to that repo

Each repository has its own `CONTRIBUTING.md` with specific guidelines.

---

## 📅 Migration Timeline

### Phase 1: Preparation ✅ (Completed)
- [x] Rename project from BangBang to Brainfile
- [x] Create `github.com/brainfile` organization
- [x] Update all package names and identifiers
- [x] Update schema URL to `brainfile.md/v1`

### Phase 2: Repository Setup 🚧 (In Progress)
- [ ] Create empty repositories in brainfile org
- [ ] Configure branch protection rules
- [ ] Set up GitHub Actions workflows
- [ ] Configure secrets for npm and marketplace publishing

### Phase 3: Code Migration 📋 (Planned)
- [ ] Extract protocol files to `brainfile/protocol`
- [ ] Extract core package to `brainfile/core`
- [ ] Extract CLI package to `brainfile/cli`
- [ ] Extract VSCode extension to `brainfile/vscode`
- [ ] Preserve git history using `git subtree split`

### Phase 4: Publishing 📤 (Planned)
- [ ] Publish `@brainfile/core` to npm
- [ ] Publish `@brainfile/cli` to npm
- [ ] Publish extension to VS Code Marketplace
- [ ] Configure `brainfile.md` domain with GitHub Pages

### Phase 5: Cleanup 🧹 (Planned)
- [ ] Archive old monorepo with redirect notice
- [ ] Update all external references
- [ ] Announce migration on social media

**Expected Completion**: ~2-3 weeks

---

## 🔄 Updating Your Brainfile

If you have an existing `bangbang.md` file:

1. **Rename the file**:
   ```bash
   mv bangbang.md brainfile.md
   ```

2. **Update the schema URL** in the YAML frontmatter:
   ```yaml
   ---
   schema: https://brainfile.md/v1
   title: Your Project Title
   # ... rest of your config
   ---
   ```

3. **Update any references** in your documentation or scripts from `bangbang` to `brainfile`.

---

## 🛠️ Developer Setup

### Working with Multiple Repos

If you're developing across multiple Brainfile repositories, we recommend this structure:

```
~/brainfile/
├── protocol/      # Clone of brainfile/protocol
├── core/          # Clone of brainfile/core
├── cli/           # Clone of brainfile/cli
└── vscode/        # Clone of brainfile/vscode
```

**Setup script**:
```bash
mkdir -p ~/brainfile
cd ~/brainfile

# Clone all repos
git clone https://github.com/brainfile/protocol.git
git clone https://github.com/brainfile/core.git
git clone https://github.com/brainfile/cli.git
git clone https://github.com/brainfile/vscode.git

# Build core library
cd core && npm install && npm run build

# Link core for local development
cd ../cli && npm install && npm link ../core
cd ../vscode && npm install && npm link ../core
```

### Testing Changes Locally

**Core library changes**:
```bash
cd ~/brainfile/core
npm run build

# Test in CLI
cd ~/brainfile/cli
npm test

# Test in VSCode extension
cd ~/brainfile/vscode
npm run compile && code --extensionDevelopmentPath=$PWD
```

---

## 📚 Documentation Updates

All documentation has been updated to reflect the new structure:

- **README.md**: Updated installation instructions and repository links
- **docs/protocol.md**: Updated schema references and GitHub URLs
- **CONTRIBUTING.md**: Updated contribution workflow for multi-repo
- **REPOSITORY_STRUCTURE.md**: New file documenting the architecture

---

## ❓ FAQ

### Q: Will my existing bangbang.md files still work?
**A**: Yes! Simply rename them to `brainfile.md` and update the schema URL. The file format is backward-compatible.

### Q: What happens to the old monorepo?
**A**: It will be archived with a prominent README pointing to the new repositories. All issues and PRs will be migrated or closed with links to new repos.

### Q: Can I still use the old npm packages?
**A**: The old packages were never published to npm. You must use the new `@brainfile/*` packages.

### Q: How do I report issues now?
**A**: Report issues in the specific repository:
- Protocol/schema issues → `brainfile/protocol`
- Library bugs → `brainfile/core`
- CLI bugs → `brainfile/cli`
- VSCode bugs → `brainfile/vscode`

### Q: Will git history be preserved?
**A**: Yes! We're using `git subtree split` to preserve the full commit history for each package.

---

## 🆘 Need Help?

- **Discord**: [Join our community](#) (coming soon)
- **GitHub Discussions**: Ask questions in any repo
- **Email**: support@brainfile.md (coming soon)

---

## 📖 Additional Resources

- [Repository Structure Documentation](./REPOSITORY_STRUCTURE.md)
- [Protocol Specification](https://github.com/brainfile/protocol)
- [Contributing Guide](./CONTRIBUTING.md)
- [Release Process](./docs/release-process.md) (coming soon)

