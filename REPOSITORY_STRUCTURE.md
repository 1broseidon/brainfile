# Brainfile Multi-Repository Architecture

## Overview

The Brainfile project is split into multiple focused repositories under the `github.com/brainfile` organization. Each repository has its own CI/CD pipeline, versioning, and release cycle.

## Repository Structure

### 1. **brainfile/protocol** 
**Purpose**: The canonical protocol specification, JSON schema, and documentation  
**URL**: `https://github.com/brainfile/protocol`  
**Deployed to**: `https://brainfile.md` (GitHub Pages)

**Contents**:
- `brainfile.schema.json` - JSON Schema v1
- `v1.json` - Schema served at `brainfile.md/v1.json`
- `v1.yaml` - YAML format served at `brainfile.md/v1.yaml`
- `docs/` - Protocol specification and guides
- `examples/` - Example brainfile.md files
- GitHub Pages configuration for domain

**CI/CD**:
- Validate schema on PR
- Deploy to GitHub Pages on merge to main
- Serve schema at `brainfile.md/v1`, `brainfile.md/v1.json`, `brainfile.md/v1.yaml`

---

### 2. **brainfile/core**
**Purpose**: TypeScript/JavaScript core library for parsing and manipulating brainfiles  
**URL**: `https://github.com/brainfile/core`  
**NPM Package**: `@brainfile/core`

**Contents**:
- `src/` - Core TypeScript library
- `dist/` - Compiled JavaScript
- Parser, Serializer, Validator classes
- Type definitions

**CI/CD**:
- Run tests on PR
- Build and type-check
- Publish to npm on version tag (`v0.x.x`)
- Generate API docs

---

### 3. **brainfile/cli**
**Purpose**: Command-line interface for brainfile task management  
**URL**: `https://github.com/brainfile/cli`  
**NPM Package**: `brainfile-cli` (or `@brainfile/cli`)

**Contents**:
- `src/` - CLI source code
- Commands: `list`, `add`, `move`, `template`
- Binary builds for Linux, macOS, Windows

**Dependencies**:
- `@brainfile/core` (from npm)

**CI/CD**:
- Run tests on PR
- Build binaries for all platforms
- Publish to npm on version tag
- Create GitHub releases with binaries

---

### 4. **brainfile/vscode**
**Purpose**: Visual Studio Code extension  
**URL**: `https://github.com/brainfile/vscode`  
**Marketplace**: `brainfile.brainfile`

**Contents**:
- `src/` - Extension source
- Webview-based kanban board
- Task management UI
- `.vsix` package

**Dependencies**:
- `@brainfile/core` (from npm)

**CI/CD**:
- Run linting and type-checking on PR
- Build extension
- Publish to VS Code Marketplace on version tag
- Create GitHub releases with `.vsix`

---

### 5. **brainfile/brainfile.md** (Optional)
**Purpose**: Landing page, documentation site, and blog  
**URL**: `https://github.com/brainfile/brainfile.md`  
**Deployed to**: `https://www.brainfile.md` or `https://brainfile.dev`

**Contents**:
- Marketing site
- Comprehensive documentation
- Getting started guides
- Blog posts and updates
- Built with Next.js, Astro, or similar

**CI/CD**:
- Deploy to Vercel/Netlify on merge to main

---

## Domain Configuration

### brainfile.md
- **Root** (`https://brainfile.md`): Protocol documentation (from `brainfile/protocol` via GitHub Pages)
- **Schema Endpoints**:
  - `https://brainfile.md/v1` - Human-readable schema doc
  - `https://brainfile.md/v1.json` - JSON Schema
  - `https://brainfile.md/v1.yaml` - YAML Schema
  - `https://brainfile.md/schema/v1` - Alternative path
- **Future versions**: `v2.json`, `v2.yaml`, etc.

---

## Migration Strategy

### Phase 1: Preparation (Current Phase)
- ✅ Create GitHub organization
- ✅ Update all package repository URLs
- ✅ Update schema `$id` to use `brainfile.md/v1`
- ✅ Update documentation with new URLs
- 🔄 Create migration guide

### Phase 2: Repository Creation
- Create empty repos in brainfile org
- Set up branch protection rules
- Configure GitHub Actions workflows

### Phase 3: Code Migration
- Use `git subtree split` or `git filter-branch` to preserve history
- Push each package to its respective repo
- Tag initial versions

### Phase 4: CI/CD Setup
- Configure npm publishing
- Set up VSCode Marketplace publishing
- Configure GitHub Pages for protocol repo

### Phase 5: Cleanup
- Archive the monorepo with a redirect notice
- Update all external references
- Announce the migration

---

## NPM Publishing Strategy

### Scoped Packages (@brainfile/*)
**Recommendation**: Use scoped packages for official libraries

- `@brainfile/core` - Core library
- `@brainfile/cli` - CLI tool (or use unscoped `brainfile-cli` for discoverability)

**Benefits**:
- Clear ownership and branding
- Avoid name conflicts
- Professional appearance
- Free on npm for public packages

### Unscoped Alternative
- `brainfile-core`
- `brainfile-cli`

**Benefits**:
- Slightly more discoverable
- Shorter install command

**Recommended**: Stick with `@brainfile/*` scope for consistency and branding.

---

## Inter-Repository Dependencies

```
brainfile/protocol (schema)
       ↓
@brainfile/core (parser/validator)
       ↓
    ┌──┴──┐
    ↓     ↓
brainfile/cli  brainfile/vscode
```

- **protocol** → No dependencies, just defines the spec
- **core** → Depends on protocol (references schema URL)
- **cli** → Depends on `@brainfile/core` from npm
- **vscode** → Depends on `@brainfile/core` from npm

---

## Version Synchronization

Each repo has independent versioning:
- **protocol**: Semantic versioning (1.0.0, 2.0.0) for major protocol changes
- **core**: Independent versioning, can update without protocol changes
- **cli**: Independent versioning, follows core compatibility
- **vscode**: Independent versioning, follows core compatibility

Schema URL always points to major version: `brainfile.md/v1`, `brainfile.md/v2`, etc.

