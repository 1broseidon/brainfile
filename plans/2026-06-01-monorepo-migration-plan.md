# Brainfile Monorepo Migration — Implementation Plan (history-preserving)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the 5-repo `brainfile/` org into one flat flagship monorepo at `github.com/1broseidon/brainfile` **with full git history preserved**, publishing the CLI as `brainfile` while keeping `@brainfile/core` published, and archiving the old repos.

**Architecture:** Assemble in a **staging dir** with `git-filter-repo` (clone `protocol` as base, rewrite its spec dirs under `protocol/`, then subtree-merge `core/` and `cli/` with `--allow-unrelated-histories` so `git log --follow` crosses the moves). Python + supervisor are excluded. Then wire the monorepo (rename CLI → `brainfile`, version-sync, workflows, allowlist `.gitignore`, README), push, cut over Pages/`brainfile.md`, publish npm (core→brainfile), archive old repos, and finally adopt the new repo as the working dir — restoring local-only content under the allowlist.

**Tech Stack:** Node 20, npm (per-package lockfiles), TypeScript, Jest, VitePress, `git-filter-repo`, GitHub Actions + Pages, `gh` CLI, `npm` CLI.

> **Spec:** `.brainfile/plans/2026-06-01-monorepo-migration-design.md`
> **Plan location note:** lives in `.brainfile/plans/` (allowlisted *out* of the flagship), not `docs/superpowers/plans/`, because the flagship's `docs/` is the public VitePress site.
> **Supersedes:** `scripts/migrate-to-monorepo.sh` (old `packages/`-layout, python-included design). This plan writes a new `scripts/assemble-monorepo.sh` for the flat layout + our decisions. Do **not** run the old one.

---

## Conventions used below

```bash
WORKSPACE=/home/george/Projects/core/brainfile      # current multi-repo workspace
STAGING=$HOME/brainfile-monorepo-migration          # assembly scratch (must NOT pre-exist)
MONOREPO=$STAGING/brainfile                          # the assembled flagship
```

## Prerequisites

- [ ] `gh auth status` → authenticated as owner of `1broseidon` and admin of the `brainfile/` org.
- [ ] `npm whoami` returns your user; you have publish rights to the `@brainfile` scope and the (free) `brainfile` name.
- [ ] `node --version` ≥ 20, `git --version` ≥ 2.24, `python3` + `pipx` available (to bootstrap `git-filter-repo`).
- [ ] You can edit `brainfile.md` DNS at the registrar.

---

## File Structure (target, post-assembly + wiring)

```
$MONOREPO/
├── .gitignore               # allowlist (Task 3.6)
├── README.md                # protocol's README (came in via base clone) → flagship pitch (Task 3.5)
├── CONTRIBUTING.md          # from protocol (base)
├── LICENSE                  # from protocol (base)
├── logo.png                 # from protocol (base)
├── CNAME                    # root copy + docs/public/CNAME (Task 3.1)
├── package.json             # root metadata + scripts (Task 3.4)
├── .github/
│   ├── workflows/ci.yml     # copied from $WORKSPACE (Task 3.2)
│   ├── workflows/publish.yml# copied from $WORKSPACE, cli tag fixed (Task 3.2)
│   ├── workflows/deploy.yml # path-adjusted (Task 3.2)
│   └── scripts/sync-version.mjs  # version-sync helper (Task 3.4)
├── core/                    # @brainfile/core — full history (merged)
├── cli/                     # name → "brainfile" — full history (merged)
├── protocol/                # spec: v1/ v2/ example/ prompts/ skills/ (path-renamed in history)
└── docs/                    # VitePress site (protocol base, stays at root) → brainfile.md
```

---

## Phase 0 — Safety & preflight

### Task 0.1: Full backup

- [ ] **Step 1: Tarball the workspace** (the adopt-locally phase later moves it; this is the restore point).
```bash
cd /home/george/Projects/core
tar --exclude='*/node_modules' -czf brainfile-backup-2026-06-01.tgz brainfile/
ls -lh brainfile-backup-2026-06-01.tgz
```
Expected: a multi-MB `.tgz`. Keep until Phase 8 passes.

### Task 0.2: Verify the kept repos are fully pushed (history comes from REMOTES)

The assembly clones `protocol`, `core`, `cli` **from their remotes** — any unpushed local commit would be lost.

- [ ] **Step 1: Check each for uncommitted + unpushed work.**
```bash
cd /home/george/Projects/core/brainfile
for d in core cli protocol; do
  echo "=== $d ==="
  git -C "$d" status --porcelain
  git -C "$d" fetch origin -q
  echo "unpushed: $(git -C "$d" log --oneline origin/main..HEAD 2>/dev/null | wc -l)"
done
```
Expected: empty `status --porcelain` and `unpushed: 0` for all three. **If not: commit & push to the old remote first.** Do not proceed until clean.

### Task 0.3: Ensure staging is clear

- [ ] **Step 1:**
```bash
[ -e "$HOME/brainfile-monorepo-migration" ] && echo "REMOVE OR RENAME IT FIRST" || echo "staging path clear"
```
Expected: `staging path clear`.

---

## Phase 1 — Write the assembly script

### Task 1.1: Create `scripts/assemble-monorepo.sh`

**Files:** Create `/home/george/Projects/core/brainfile/scripts/assemble-monorepo.sh` (local-only; allowlist-ignored, never enters the flagship).

- [ ] **Step 1: Write it.**
```bash
#!/usr/bin/env bash
# assemble-monorepo.sh — history-preserving consolidation into a flat monorepo.
# Builds in STAGING from fresh remote clones; never mutates live clones, never pushes.
# Layout: protocol = base (docs/ stays at root, spec dirs → protocol/); + core/ + cli/.
# Excludes python + supervisor + vscode (handled elsewhere).
set -euo pipefail

STAGING="${STAGING:-$HOME/brainfile-monorepo-migration}"
MONOREPO="$STAGING/brainfile"
SOURCES="$STAGING/sources"

BASE_URL="https://github.com/brainfile/protocol.git"
# name|url|subdir
REPOS=(
  "core|https://github.com/brainfile/core.git|core"
  "cli|https://github.com/brainfile/cli.git|cli"
)
# Committed junk / internal state to strip from ALL history before merging.
# (core's origin has ~5260 tracked node_modules/dist/coverage files; .brainfile is board state.)
STRIP_ARGS=(--invert-paths --path node_modules/ --path dist/ --path coverage/ --path .brainfile/)

info(){ printf '\033[0;34m▶ %s\033[0m\n' "$*"; }
ok(){   printf '\033[0;32m✓ %s\033[0m\n' "$*"; }
die(){  printf '\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# --- preflight ---
command -v git >/dev/null || die "git not found"
if ! git filter-repo --version >/dev/null 2>&1; then
  info "installing git-filter-repo via pipx"
  command -v pipx >/dev/null || die "pipx not found; pip3 install git-filter-repo"
  pipx install git-filter-repo >/dev/null || die "git-filter-repo install failed"
  export PATH="$HOME/.local/bin:$PATH"
  git filter-repo --version >/dev/null 2>&1 || die "git-filter-repo not on PATH"
fi
ok "git-filter-repo: $(git filter-repo --version 2>&1 | head -1)"
[ -e "$STAGING" ] && die "staging exists: $STAGING (remove it first)"
git ls-remote "$BASE_URL" >/dev/null 2>&1 || die "cannot reach $BASE_URL"
for e in "${REPOS[@]}"; do IFS='|' read -r n u _ <<<"$e"; git ls-remote "$u" >/dev/null 2>&1 || die "cannot reach $u ($n)"; done
ok "all remotes reachable"

# --- base: protocol → monorepo root, spec dirs renamed under protocol/ ---
info "cloning base (protocol)"
mkdir -p "$SOURCES"
git clone --no-local "$BASE_URL" "$MONOREPO"
git -C "$MONOREPO" branch -M main
( cd "$MONOREPO" && git filter-repo --force "${STRIP_ARGS[@]}" )
( cd "$MONOREPO" && git filter-repo --force \
    --path-rename v1/:protocol/v1/ \
    --path-rename v2/:protocol/v2/ \
    --path-rename example/:protocol/example/ \
    --path-rename prompts/:protocol/prompts/ \
    --path-rename skills/:protocol/skills/ )
ok "base assembled ($(git -C "$MONOREPO" rev-list --count HEAD) commits); spec → protocol/, docs/ at root"

# --- merge core/ and cli/ with history ---
for e in "${REPOS[@]}"; do
  IFS='|' read -r name url subdir <<<"$e"
  info "merging $name → $subdir/"
  git clone --no-local "$url" "$SOURCES/$name"
  ( cd "$SOURCES/$name" && git filter-repo --force "${STRIP_ARGS[@]}" )
  ( cd "$SOURCES/$name" && git filter-repo --force --to-subdirectory-filter "$subdir" )
  git -C "$MONOREPO" remote add "$name" "$SOURCES/$name"
  git -C "$MONOREPO" fetch "$name" --no-tags -q
  git -C "$MONOREPO" merge --allow-unrelated-histories --no-edit \
    -m "migrate: merge $name into $subdir/ (history preserved)" "$name/main"
  git -C "$MONOREPO" remote remove "$name"
  ok "$name merged"
done

# drop nested .github that came along inside core/ and cli/ (only root .github runs)
git -C "$MONOREPO" rm -r -q --ignore-unmatch core/.github cli/.github >/dev/null 2>&1 || true
git -C "$MONOREPO" commit -q -m "chore: drop nested .github from merged packages" || true

# --- report ---
info "layout:"; ( cd "$MONOREPO" && git ls-tree --name-only HEAD | sed 's/^/  /' )
info "history probes (--follow should cross the move):"
for p in core/package.json cli/package.json docs/.vitepress/config.ts protocol/v1; do
  if git -C "$MONOREPO" cat-file -e "HEAD:$p" 2>/dev/null; then
    printf "  %-32s %s commits\n" "$p" "$(git -C "$MONOREPO" log --oneline --follow -- "$p" 2>/dev/null | wc -l)"
  else printf "  %-32s MISSING\n" "$p"; fi
done
ok "assembled at $MONOREPO — inspect, then run wiring (Phase 3)."
```
- [ ] **Step 2: Make it executable.**
```bash
chmod +x /home/george/Projects/core/brainfile/scripts/assemble-monorepo.sh && echo OK
```
Expected: `OK`.

---

## Phase 2 — Run the assembly

### Task 2.1: Assemble + verify history crossed the moves

- [ ] **Step 1: Run it.**
```bash
cd /home/george/Projects/core/brainfile && scripts/assemble-monorepo.sh
```
Expected: ends with `assembled at .../brainfile`. The layout lists `core cli protocol docs README.md LICENSE CNAME logo.png CONTRIBUTING.md .github`. (No `v1`/`v2`/`example` at root — they're under `protocol/`.)
- [ ] **Step 2: Confirm history is genuinely preserved.**
```bash
M=$HOME/brainfile-monorepo-migration/brainfile
git -C "$M" log --oneline --follow -- core/package.json | tail -3
git -C "$M" log --oneline --follow -- protocol/v1 | tail -3
echo "total commits: $(git -C "$M" rev-list --count HEAD)"
```
Expected: each `--follow` shows multiple old commits with pre-2026 dates; total commit count is the sum across the merged repos (~tens-to-hundreds), not 1.
- [ ] **Step 3: Confirm committed junk was stripped (issue #2 fix).**
```bash
M=$HOME/brainfile-monorepo-migration/brainfile
echo "tracked artifacts remaining: $(git -C "$M" ls-files | grep -cE 'node_modules/|/dist/|/coverage/|\.brainfile/')"
```
Expected: `tracked artifacts remaining: 0`. (core's ~5260 committed node_modules/dist/coverage files and all `.brainfile/` board state are gone from the merged history.)

---

## Phase 3 — Wire the monorepo (in $MONOREPO)

All edits happen in `$HOME/brainfile-monorepo-migration/brainfile`. Set `M=$HOME/brainfile-monorepo-migration/brainfile` for these tasks.

### Task 3.1: CNAME for Pages

- [ ] **Step 1: Add `docs/public/CNAME` (auto-served by VitePress); keep the root CNAME.**
```bash
M=$HOME/brainfile-monorepo-migration/brainfile
mkdir -p "$M/docs/public"
cp "$M/CNAME" "$M/docs/public/CNAME"
cat "$M/docs/public/CNAME"   # → brainfile.md
```
Expected: prints `brainfile.md`.

### Task 3.2: Workflows

**Files:** copy `ci.yml`, `publish.yml` from the workspace; rewrite `deploy.yml`.

- [ ] **Step 1: Copy CI + publish from the existing workspace scaffold.**
```bash
M=$HOME/brainfile-monorepo-migration/brainfile
mkdir -p "$M/.github/workflows"
cp /home/george/Projects/core/brainfile/.github/workflows/ci.yml "$M/.github/workflows/ci.yml"
cp /home/george/Projects/core/brainfile/.github/workflows/publish.yml "$M/.github/workflows/publish.yml"
```
- [ ] **Step 2: Fix the CLI publish tag** in `$M/.github/workflows/publish.yml` — replace `@brainfile/cli@` with `brainfile@` in the two `git tag -a` / `git push origin` lines of the `publish-cli` job (leave `publish-core`'s `@brainfile/core@` tag alone).
- [ ] **Step 3: Write `$M/.github/workflows/deploy.yml`** (schemas now under `protocol/`):
```yaml
name: Deploy docs to GitHub Pages
on:
  push:
    branches: [main]
    paths: ['docs/**', 'protocol/**', '.github/workflows/deploy.yml']
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: "pages"
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: docs/package-lock.json
      - name: Install
        run: cd docs && npm ci
      - name: Build VitePress
        run: cd docs && npm run build
      - name: Copy schema files into dist
        run: |
          cp -r protocol/v1 docs/.vitepress/dist/v1
          cp -r protocol/example docs/.vitepress/dist/example
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: 'docs/.vitepress/dist'
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
- [ ] **Step 4: Confirm `docs/package-lock.json` is present** (needed by `npm ci` + cache).
```bash
ls $HOME/brainfile-monorepo-migration/brainfile/docs/package-lock.json && echo OK
```
Expected: `OK`. If missing: `cd "$M/docs" && npm install` to generate it.

> Note: `v2/` not copied (prior production served only `v1` + `example`). Add `cp -r protocol/v2 docs/.vitepress/dist/v2` only if Phase 8 shows the live site links to `/v2`.

### Task 3.3: Repoint VitePress schema paths (build-break risk)

The docs referenced schema dirs that used to be at the protocol repo root; they're now under `protocol/`.

- [ ] **Step 1: Find references in the config and build scripts.**
```bash
M=$HOME/brainfile-monorepo-migration/brainfile
grep -rnE "\.\./(v1|v2|example)|['\"](v1|v2|example)/" "$M/docs/.vitepress/config.ts" "$M/docs/scripts/" 2>/dev/null || echo "no relative schema refs"
```
- [ ] **Step 2: For each hit, repoint to `../protocol/<dir>`** (e.g. `../v1` → `../protocol/v1`) in whichever file it appears. If `no relative schema refs`, skip.
- [ ] **Step 3: Verify the docs build.**
```bash
cd $HOME/brainfile-monorepo-migration/brainfile/docs && npm ci && npm run build && echo BUILD_OK
```
Expected: build completes, `BUILD_OK`, `docs/.vitepress/dist/index.html` exists.

### Task 3.4: Root package.json + version-sync helper

- [ ] **Step 1: Write `$M/package.json`.**
```json
{
  "name": "brainfile-monorepo",
  "private": true,
  "version": "0.18.0",
  "description": "Brainfile — a markdown/YAML task-management protocol, its core library, and CLI.",
  "license": "MIT",
  "repository": { "type": "git", "url": "https://github.com/1broseidon/brainfile" },
  "scripts": {
    "test": "npm --prefix core test && npm --prefix cli test",
    "build": "npm --prefix core run build && npm --prefix cli run build",
    "version:set": "node .github/scripts/sync-version.mjs"
  }
}
```
- [ ] **Step 2: Write `$M/.github/scripts/sync-version.mjs`** (sets core+cli+root to one version AND syncs cli's core dep range — anti-drift).
```js
#!/usr/bin/env node
// Usage: node .github/scripts/sync-version.mjs 0.18.0
import { readFileSync, writeFileSync } from 'node:fs';
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version || '')) {
  console.error('Usage: version:set <semver>  (e.g. 0.18.1)'); process.exit(1);
}
const edit = (path, fn) => {
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  fn(pkg); writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`set ${path} → ${version}`);
};
edit('package.json', (p) => { p.version = version; });
edit('core/package.json', (p) => { p.version = version; });
edit('cli/package.json', (p) => {
  p.version = version;
  if (p.dependencies?.['@brainfile/core']) p.dependencies['@brainfile/core'] = `^${version}`;
});
console.log('\nNext: commit, tag, and create a GitHub Release to trigger publish.yml.');
```
- [ ] **Step 3: Apply the unified launch version.**
```bash
cd $HOME/brainfile-monorepo-migration/brainfile && node .github/scripts/sync-version.mjs 0.18.0
```
Expected: three `set ... → 0.18.0` lines.

### Task 3.5: Rename CLI → `brainfile`, fix repo URLs, flagship README

- [ ] **Step 1: Edit `$M/cli/package.json`** — `"name": "@brainfile/cli"` → `"name": "brainfile"`; repository url → `https://github.com/1broseidon/brainfile`.
- [ ] **Step 2: Edit `$M/core/package.json`** — repository url → `git+https://github.com/1broseidon/brainfile.git`.
- [ ] **Step 3: Turn the root README (protocol's, from the base clone) into the flagship pitch.** Apply in `$M/README.md`:
  - install line → `npm i -g brainfile`
  - any `github.com/brainfile/<repo>` → `github.com/1broseidon/brainfile` (deep-link subdirs where a package was referenced)
  - add a "Packages" section: `core/` → `@brainfile/core` (library), `cli/` → `brainfile` (CLI), `protocol/` → spec, `docs/` → https://brainfile.md
- [ ] **Step 4: Verify rename + no stale refs.**
```bash
M=$HOME/brainfile-monorepo-migration/brainfile
node -p "require('$M/cli/package.json').name+' wants core '+require('$M/cli/package.json').dependencies['@brainfile/core']"
node -p "require('$M/core/package.json').name+'@'+require('$M/core/package.json').version"
grep -nE "@brainfile/cli|github\.com/brainfile/" "$M/README.md" || echo "README clean"
```
Expected: `brainfile wants core ^0.18.0`, `@brainfile/core@0.18.0`, `README clean`.

### Task 3.6: Allowlist `.gitignore`

- [ ] **Step 1: Write `$M/.gitignore`.**
```gitignore
# Allowlist .gitignore — ignore EVERYTHING, then re-bless only the flagship.
# Forward safety net: when local-only dirs are restored alongside (Phase 8),
# they stay physically present but impossible to commit.
/*

!/.gitignore
!/README.md
!/CONTRIBUTING.md
!/LICENSE
!/logo.png
!/CNAME
!/package.json
!/package-lock.json
!/.github/
!/core/
!/cli/
!/protocol/
!/docs/
```

### Task 3.7: Commit the wiring + verify build/test/allowlist

- [ ] **Step 1: Stage and inspect what the wiring adds.**
```bash
cd $HOME/brainfile-monorepo-migration/brainfile
git add -A
git status --porcelain | awk '{print $2}' | cut -d/ -f1 | sort -u
```
Expected top-level entries are only: `.github .gitignore CNAME CONTRIBUTING.md LICENSE README.md cli core docs logo.png package.json protocol`. No `node_modules`, no `dist/`. (Staging is clean so nothing forbidden should appear — the allowlist is the *forward* guard, exercised in Phase 8.)
- [ ] **Step 2: Commit.**
```bash
git commit -q -m "chore: monorepo wiring (brainfile CLI rename, workflows, version sync, allowlist)" && git log --oneline -1
```
- [ ] **Step 3: Core builds & tests.**
```bash
cd $HOME/brainfile-monorepo-migration/brainfile/core && npm ci && npm test && npm run build && echo CORE_OK
```
Expected: `CORE_OK`.
- [ ] **Step 4: CLI tests + packs as `brainfile`.** `@brainfile/core@0.18.0` isn't on npm yet, so `npm install` can't resolve `^0.18.0`. Temporarily point the dep at the local build via a `file:` swap, test, then **restore** the real range before any publish. (Deterministic — avoids `npm link` clobbering.)
```bash
M=$HOME/brainfile-monorepo-migration/brainfile
cd "$M/cli"
cp package.json package.json.bak
node -e "const p=require('./package.json'); p.dependencies['@brainfile/core']='file:../core'; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2)+'\n')"
npm install
npm test && npm run build && echo CLI_OK
node -p "require('./package.json').name+'@'+require('./package.json').version"
mv package.json.bak package.json          # RESTORE @brainfile/core@^0.18.0
rm -rf node_modules                        # clean; Phase 6 reinstalls from npm
git -C "$M" diff --quiet -- cli/package.json && echo "dep restored cleanly"
```
Expected: `CLI_OK`; identity `brainfile@0.18.0`; `dep restored cleanly` (the `file:` swap left no trace in the committed file).

---

## Phase 4 — Create & push the GitHub repo

### Task 4.1: Create the flagship and push (with full history)

- [ ] **Step 1: Push.**
```bash
cd $HOME/brainfile-monorepo-migration/brainfile
gh repo create 1broseidon/brainfile --public \
  --description "Markdown/YAML task-management protocol + CLI" \
  --source=. --remote=origin --push
```
Expected: repo created; `main` pushed with full history; `origin` set.
- [ ] **Step 2: Confirm history landed on GitHub.**
```bash
gh api repos/1broseidon/brainfile -q '.size, .default_branch'
git -C $HOME/brainfile-monorepo-migration/brainfile log --oneline -1
```
Expected: non-trivial repo size; `main`.
- [ ] **Step 3: Watch CI.**
```bash
gh run watch --repo 1broseidon/brainfile $(gh run list --repo 1broseidon/brainfile -L1 --json databaseId -q '.[0].databaseId') || true
```
Expected: `test-core` passes. `test-cli` may fail solely on resolving `@brainfile/core@^0.18.0` (not yet published) — expected; re-run after Phase 6.

---

## Phase 5 — Pages + domain cutover

### Task 5.1: Deploy docs and point `brainfile.md` at the new repo

- [ ] **Step 1: Run the docs deploy; set Pages source to GitHub Actions** (Settings → Pages → Source: GitHub Actions if not already).
```bash
gh workflow run deploy.yml --repo 1broseidon/brainfile
gh run watch --repo 1broseidon/brainfile $(gh run list --repo 1broseidon/brainfile -w deploy.yml -L1 --json databaseId -q '.[0].databaseId')
```
Expected: deploy succeeds.
- [ ] **Step 2: Set custom domain** to `brainfile.md` (Settings → Pages → Custom domain). `docs/public/CNAME` already pins it.
- [ ] **Step 3: Verify DNS** (Pages custom domains use GitHub anycast IPs regardless of account — usually no change needed).
```bash
dig +short brainfile.md
```
Expected: `185.199.108.153/.109/.110/.111` or a CNAME to `<user>.github.io`. If elsewhere, repoint at the registrar.
- [ ] **Step 4: Verify live (allow minutes for TLS).**
```bash
curl -sSI https://brainfile.md | head -3
curl -sS -o /dev/null -w "v1 schema: %{http_code}\n" https://brainfile.md/v1/
```
Expected: `HTTP/2 200`; `v1 schema: 200`.

---

## Phase 6 — Publish npm (core → brainfile), deprecate old CLI

First partially-irreversible phase (npm versions are immutable, but additive + reversible deprecation). Old packages stay live until here.

### Task 6.1: Publish `@brainfile/core@0.18.0`

- [ ] **Step 1:**
```bash
cd $HOME/brainfile-monorepo-migration/brainfile/core
npm run build && npm publish --access public
npm view @brainfile/core version
```
Expected: `0.18.0`.

### Task 6.2: Publish `brainfile@0.18.0`

- [ ] **Step 1: Drop the dev link, install real published core, publish.**
```bash
cd $HOME/brainfile-monorepo-migration/brainfile/cli
rm -rf node_modules
npm install            # resolves @brainfile/core@^0.18.0 from npm
npm test && npm run build
npm publish --access public
npm view brainfile version
```
Expected: `brainfile@0.18.0`.
- [ ] **Step 2: Smoke-test a real global install.**
```bash
npm i -g brainfile && brainfile --help | head -5 && which brainfile
```
Expected: usage prints; binary on PATH.

### Task 6.3: Deprecate `@brainfile/cli` → `brainfile`

- [ ] **Step 1:**
```bash
npm view @brainfile/cli downloads 2>/dev/null || true
npm deprecate @brainfile/cli "Renamed. Install the CLI as 'brainfile': npm i -g brainfile"
npm view @brainfile/cli deprecated
```
Expected: deprecation message echoed. (If downloads ≈ 0, bare deprecate is enough; otherwise also publish a final shim release depending on `brainfile`.)

### Task 6.4: Tag the release

- [ ] **Step 1:**
```bash
cd $HOME/brainfile-monorepo-migration/brainfile
git tag -a brainfile@0.18.0 -m "Release brainfile@0.18.0 + @brainfile/core@0.18.0"
git tag -a @brainfile/core@0.18.0 -m "Release @brainfile/core@0.18.0"
git push origin --tags
```
Expected: both tags pushed. (Future: `npm run version:set X.Y.Z` → commit → `gh release create` → `publish.yml` publishes core→cli; set npm trusted-publishing on both packages to enable `--provenance`.)
- [ ] **Step 2: Re-run CI now that core is published.**
```bash
gh run rerun --repo 1broseidon/brainfile $(gh run list --repo 1broseidon/brainfile -w CI -L1 --json databaseId -q '.[0].databaseId') 2>/dev/null || gh workflow run ci.yml --repo 1broseidon/brainfile
```
Expected: `test-cli` now passes (resolves `@brainfile/core@^0.18.0`).

---

## Phase 7 — Archive the old org repos

Only after Phases 4–6 verified live.

### Task 7.1: Banner + archive each (cli, core, protocol, py, vscode)

- [ ] **Step 1:**
```bash
BANNER='> ⚠️ **Moved.** Brainfile now lives in one repo: https://github.com/1broseidon/brainfile  \n> This repository is archived and read-only.\n\n'
for r in cli core protocol py vscode; do
  tmp=$(mktemp)
  gh api repos/brainfile/$r/contents/README.md -q '.content' 2>/dev/null | base64 -d > "$tmp" || echo "# brainfile/$r" > "$tmp"
  printf "$BANNER" | cat - "$tmp" > "$tmp.new"
  sha=$(gh api repos/brainfile/$r/contents/README.md -q '.sha' 2>/dev/null || echo "")
  gh api -X PUT repos/brainfile/$r/contents/README.md \
    -f message="docs: archived — moved to 1broseidon/brainfile" \
    -f content="$(base64 -w0 "$tmp.new")" ${sha:+-f sha="$sha"}
  gh repo archive brainfile/$r --yes
  echo "archived brainfile/$r"
done
```
Expected: banner commit + `archived brainfile/<r>` for all five. Org kept (reversible via `gh repo unarchive`).

---

## Phase 8 — Adopt the new repo as the working dir, then verify

The allowlist's payoff: bring back your local-only environment alongside the tracked flagship.

### Task 8.1: Relocate

- [ ] **Step 1: Set the old workspace aside; clone the flagship into its place.**
```bash
cd /home/george/Projects/core
mv brainfile brainfile-OLD
git clone git@github.com:1broseidon/brainfile.git brainfile
```
- [ ] **Step 2: Restore local-only content (allowlist will ignore it).**
```bash
cd /home/george/Projects/core
for d in supervisor marketing scripts .brainfile .agent .agents .crush .factory .junie .pi .windsurf .familiar; do
  [ -e "brainfile-OLD/$d" ] && cp -r "brainfile-OLD/$d" "brainfile/$d"
done
for f in CLAUDE.md AGENTS.md llms-full.txt tmux-dev.sh skills-lock.json .coverage; do
  [ -e "brainfile-OLD/$f" ] && cp "brainfile-OLD/$f" "brainfile/$f"
done
```
- [ ] **Step 3: PROVE the allowlist ignores all of it.**
```bash
cd /home/george/Projects/core/brainfile
git status --porcelain
```
Expected: **empty output** — every restored local dir/file is ignored; the working tree is clean. (If anything shows up, add it to `.gitignore`'s ignored set — but with the allowlist it should be clean.)

### Task 8.2: Final verification (definition of done)

- [ ] **Step 1: History preserved on the canonical clone.**
```bash
cd /home/george/Projects/core/brainfile
git log --oneline --follow -- core/package.json | wc -l
git log --oneline --follow -- protocol/v1 | wc -l
git log --oneline --follow -- docs/.vitepress/config.ts | wc -l
```
Expected: each > 1 with pre-migration commits (history crossed the moves).
- [ ] **Step 2: Build + test green from the canonical clone.**
```bash
npm --prefix core ci && npm --prefix core test && echo CORE_VERIFY_OK
npm --prefix cli ci && npm --prefix cli test && echo CLI_VERIFY_OK
```
Expected: `CORE_VERIFY_OK`, `CLI_VERIFY_OK` (cli resolves core from npm).
- [ ] **Step 3: Public surface live.**
```bash
npm view brainfile version          # → 0.18.0
npm view @brainfile/core version    # → 0.18.0
npm view @brainfile/cli deprecated  # → "Renamed..."
curl -sS -o /dev/null -w "docs: %{http_code}\n" https://brainfile.md
```
Expected: `0.18.0`, `0.18.0`, deprecation message, `docs: 200`.
- [ ] **Step 4: Old repos archived, org intact.**
```bash
for r in cli core protocol py vscode; do echo "$r archived=$(gh api repos/brainfile/$r -q '.archived')"; done
```
Expected: `archived=true` for all five.
- [ ] **Step 5: Clean up** once satisfied.
```bash
# rm -rf /home/george/Projects/core/brainfile-OLD
# rm -rf $HOME/brainfile-monorepo-migration
# rm /home/george/Projects/core/brainfile-backup-2026-06-01.tgz
echo "Keep brainfile-OLD, staging, and the backup until fully confident, then remove."
```

---

## Rollback notes (per phase)

- **Phases 0–3 (staging only):** `rm -rf $HOME/brainfile-monorepo-migration` and re-run; the live workspace is untouched.
- **Phase 4 (repo pushed):** `gh repo delete 1broseidon/brainfile`.
- **Phase 5 (Pages):** revert custom domain; old org repos still hold content.
- **Phase 6 (npm):** immutable but additive; `npm deprecate @brainfile/cli ""` un-deprecates; `@brainfile/core` unaffected.
- **Phase 7 (archive):** `gh repo unarchive brainfile/<r>`; org never deleted.
- **Phase 8 (relocate):** `brainfile-OLD` is the pre-move workspace; restore by `mv`. Backup tarball is the deepest fallback.

## Self-review confirmation

- **Spec coverage:** triage — py/vscode excluded from assembly + archived (Phase 7), supervisor/marketing excluded from assembly + restored locally untracked (8.1); structure §3 (assembly script + 3.x); naming/npm §4 (3.5, 6.x); drift fix (3.4 sync-version + ordered publish 6.1→6.2); docs/domain §5 (3.2/3.3, Phase 5); **history-preserving** §6 (Phases 1–2, verified 2.1/8.2-Step1); archive §6 (Phase 7); allowlist §7 (3.6, proven 8.1-Step3); reversibility §8 (rollback notes); verification §9 (Phase 8).
- **No-bundler** honored: cli depends on published `@brainfile/core`; `npm link` only for pre-publish verification (3.7).
- **Type/name consistency:** package name `brainfile` and dep range `^0.18.0` consistent across 3.4/3.5/6.x; `sync-version.mjs` signature matches the `version:set` script in both package.json and the helper.
- **Open items resolved:** DNS check (5.1-Step3), `@brainfile/cli` = deprecate +optional shim (6.3), cutover = staging history-preserving + adopt-locally (Phases 1–2, 8).
