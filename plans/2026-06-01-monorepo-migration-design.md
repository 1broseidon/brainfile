# Brainfile Monorepo Migration — Design

**Date:** 2026-06-01
**Status:** Approved design (pre-implementation)
**Author:** George (with Claude)

> Spec lives in `.brainfile/plans/` rather than the skill-default `docs/superpowers/specs/`
> on purpose: the new flagship's `docs/` directory becomes the public Vitepress site, and
> `.brainfile/` is allowlisted *out* of the flagship (stays local). No git commit step —
> the target repo does not exist yet; this doc is planning state.

---

## 1. Goal

Consolidate the Brainfile project from **5 separate repos under the `brainfile/` GitHub org**
into **one flagship monorepo under the personal `1broseidon` account**:
`github.com/1broseidon/brainfile`.

Two drivers, equally weighted:

- **(A) Marketing / discoverability** — one starrable flagship under the proven `1broseidon`
  brand (cymbal 250★, ketch 80★ — "the formula works"). Concentrate attention; a clean
  `npm i -g brainfile` install story; product keeps its `brainfile.md` identity.
- **(D) Reduce maintenance surface** — 5 repos is too much overhead for a ~2-3★/repo project.
  Kill what isn't pulling weight; end the cross-repo publish/version dance.

Explicit **non-goal:** developer ergonomics (atomic cross-package commits, fancy monorepo
tooling). No turborepo / nx / changesets. Plain npm workspaces only.

## 2. Component triage

| Component | Current | Decision |
|---|---|---|
| `cli/` | `@brainfile/cli` v0.17.2 (npm) | **Flagship.** Rename package → `brainfile`. |
| `core/` | `@brainfile/core` v0.16.0 (npm) | **Keep, stays published** as the library. |
| `protocol/` | docs site **+** spec, one repo | **Split:** spec → `protocol/`, site → `docs/`. |
| `protocol/docs/` | Vitepress → `brainfile.md` | **Hoist to top-level `docs/`.** |
| `vscode/` | extension, ~6mo cold | **Kill** (archive, recoverable). |
| `brainfile-py/` | Python impl, ~3mo cold | **Kill** (archive, recoverable). |
| `supervisor/` | `@brainfile/supervisor` 0.1.0, local-only, unpublished | **Stays local.** Experiment; fold in later if it becomes a selling point. |
| `marketing/` | content/strategy, not a git repo | **Stays local/private.** Never public. |

## 3. Target structure

```
1broseidon/brainfile/
├── package.json          # workspace root: { "private": true, "workspaces": ["core","cli"] }
├── package-lock.json
├── .gitignore            # ALLOWLIST (see §7)
├── README.md             # flagship front door
├── LICENSE               # MIT
├── .github/workflows/    # ci.yml, release.yml, docs.yml (authored fresh)
├── core/                 # @brainfile/core — published library
├── cli/                  # name: "brainfile" — published CLI (dir stays "cli/")
├── protocol/             # spec only: v1/ v2/ example/ prompts/ skills/  (NO website)
└── docs/                 # Vitepress site (was protocol/docs/) → brainfile.md
```

## 4. npm packages — final state

Three packages, clean roles. **No bundler** (the key simplification: keeping `core`
published means `brainfile` depends on it as a normal published dependency).

| Package | Source dir | Role | Install |
|---|---|---|---|
| `@brainfile/core` | `core/` | library — importable by anyone | `npm i @brainfile/core` |
| `brainfile` | `cli/` | the CLI (rename of `@brainfile/cli`) | `npm i -g brainfile` |
| `@brainfile/cli` | — | **deprecated pointer** → `brainfile` | still works, warns |

- `cli/package.json` `name` → `brainfile`. The `bin` is already `brainfile`, so the command
  is unchanged. Directory stays `cli/` (package name ≠ dir name — normal).
- `brainfile` declares `"@brainfile/core": "^<version>"` — a real published range. End-user
  installs pull core from npm cleanly.
- `core/package.json` keeps `name: @brainfile/core`, stays publishable.
- `@brainfile/cli`: one final release that depends on `brainfile`, plus
  `npm deprecate @brainfile/cli "Renamed to 'brainfile'. Install: npm i -g brainfile"`.

### Drift fix — single-version release (replaces bundler)

The current drift bug (`@brainfile/cli@0.17.2` wants `@brainfile/core ^0.16.0`, but npm only
has `core@0.15.1`) dies via a **monorepo release script**, not bundling:

1. Set `core` + `cli` to the **same** new version.
2. Update `brainfile`'s `@brainfile/core` dep range to match.
3. Publish `core` → then `brainfile`, atomically, from one command.

They ship together from one repo and can never drift again.

## 5. Docs & domain

- Move `protocol/docs/` → top-level `docs/`. Keep `CNAME` (`brainfile.md`).
- GitHub Pages custom domains resolve via DNS to GitHub's IPs independent of the account,
  so the cutover is: enable Pages on the new repo, set custom domain `brainfile.md`, keep the
  `CNAME` file. **Verify DNS records during execution** (registrar → GitHub Pages IPs / Pages
  CNAME target). Confirm TLS re-provisions.
- `docs/` is a standalone Vitepress sub-project (its own `package.json`), **not** a workspace
  member — built/deployed by `docs.yml`, not part of the publishable npm graph.

## 6. Git history & old-org disposition

- **History-preserving.** Assemble in a **staging dir** via `git-filter-repo`: clone each kept
  repo (`protocol` as base, `core`, `cli`) from its remote, rewrite each into its target subdir
  so per-file history follows the move (`git log --follow`), and merge as unrelated histories.
  `protocol` is the base (its `docs/` stays at root); its spec dirs (`v1/ v2/ example/ prompts/
  skills/`) are `--path-rename`d under `protocol/`. **python + supervisor are excluded.**
  Result is a clean repo containing only the flagship content **with full history**. The
  existing working dir is never mutated; nothing is pushed until inspected.
- Archive all 5 `brainfile/*` repos **read-only** with a "Moved to `1broseidon/brainfile`"
  banner in each README. **Keep the org** (so existing URLs/stars/issues don't 404; matches
  the reversible "for now" intent).
- Deprecate `@brainfile/cli` + leave `@brainfile/core` live (now released from the monorepo).

## 7. Allowlist `.gitignore` (safety net)

The working directory is a junk drawer (`supervisor/`, `marketing/`, `scripts/`, `.crush/`,
`.factory/`, `.junie/`, `.pi/`, `.windsurf/`, `.familiar/`, `.coverage`, `llms-full.txt`,
agent configs…). A deny-list would inevitably leak something private into the public flagship.
Use an **allowlist**: ignore everything, then re-bless only intended paths.

```gitignore
# Ignore everything by default
/*

# Re-bless only the flagship
!/.gitignore
!/README.md
!/LICENSE
!/package.json
!/package-lock.json
!/.github/
!/core/
!/cli/
!/protocol/
!/docs/
```

Result: `supervisor/`, `marketing/`, every agent-tool dir, `.coverage`, etc. are **physically
present but uncommittable.** Each blessed subdir keeps its own `.gitignore` for `node_modules/`
and `dist/`. (Note: a leading-slash `/*` matches only top-level entries, so `!/core/`
re-includes the directory and git then descends into it normally.)

## 8. Reversibility / rollback

Every step is reversible — this is a "for now" move, not a burned bridge.

- Old repos **archived, not deleted** → un-archive to restore.
- Org **kept** → can move the flagship back under it later.
- npm: `@brainfile/core` unchanged; `@brainfile/cli` deprecated (deprecation is reversible,
  installs keep working); `brainfile` is purely additive.
- `brainfile.md` domain follows the repo's Pages config; re-pointable.
- Killed `vscode`/`py`: archived, un-archivable on demand.

## 9. Verification (definition of done)

- [ ] `git clone 1broseidon/brainfile && npm install && npm test` is green for core + cli.
- [ ] **History preserved:** `git log --follow core/package.json`, `cli/package.json`, and
      `docs/.vitepress/config.ts` each cross the subdir move (commit count > 1, pre-migration dates).
- [ ] A fresh clone's tree shows **only** the blessed paths; once local-only dirs are restored
      alongside, `git status` still shows them ignored (allowlist works).
- [ ] `npm pack` of `cli/` produces a `brainfile` tarball that installs and runs (`brainfile --help`)
      with `@brainfile/core` resolving from npm.
- [ ] `brainfile.md` serves the docs over HTTPS from the new repo's Pages.
- [ ] `npm i -g @brainfile/cli` prints the deprecation pointer.
- [ ] All 5 old repos show the "Moved to" banner and are archived; org still exists.

## 10. Out of scope

- Bundling the CLI (deliberately rejected — keeping core published makes it unnecessary).
- Folding in `supervisor/` (stays local until it earns inclusion).
- Any monorepo task-runner beyond npm workspaces + scripts.
- Migrating issues from old repos (low volume; archived repos retain them in place).

## 11. Open items to confirm during execution

- Exact DNS records for `brainfile.md` (registrar side) and whether any change is needed.
- The `@brainfile/cli` pointer is decided (§4: final shim release that depends on `brainfile`
  + `npm deprecate`). Only sanity-check current download counts to confirm the shim is worth
  publishing vs. a bare deprecate — does not change the design.
- Cutover mechanic is decided: **history-preserving staging assembly** (§6) via `git-filter-repo`,
  then adopt the result as the working dir and restore local-only content under the allowlist.
