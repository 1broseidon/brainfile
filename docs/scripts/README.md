# Documentation Generation Scripts

## generate-llms-full.ts

Automatically generates `/public/llms-full.txt` from markdown documentation.

### Purpose

Prevents fragmentation between markdown docs and the LLM reference by maintaining a single source of truth.

### How it Works

1. Resolves documentation sections in a fixed order
2. Supports migration-aware section candidates (for example `tools/pi.md` preferred, `tools/vscode.md` fallback)
3. Strips markdown formatting to plain text
4. Combines sections with generated headers/TOC
5. Adds a complete v2 workspace example from `protocol/example/.brainfile/`
6. Writes to `public/llms-full.txt`

### When it Runs

- Automatically during `npm run build`
- Manually with `npm run generate-llms`

### Source Files (ordered)

1. `quick-start.md`
2. `why.md`
3. `guides/getting-started-with-contracts.md`
4. `guides/contracts.md`
5. `guides/agent-workflows.md`
6. `tools/cli.md`
7. `tools/mcp.md`
8. `tools/pi.md` (preferred) or `tools/vscode.md` (deprecated fallback)
9. `tools/core.md`
10. `reference/protocol.md`
11. `reference/api.md`
12. `reference/commands.md`
13. `reference/contract-schema.md`
14. `reference/types.md`
15. `../../example/.brainfile/**` (complete v2 workspace example)

### Outputs

- `public/llms-full.txt` (~2900+ lines)
  - Comprehensive AI agent reference
  - Auto-generated, do NOT manually edit
  - Committed to git for visibility and review

### Manual Files

- `public/llms.txt` (~350 lines)
  - Curated quick reference
  - Manually maintained
  - Should be kept concise

### Adding New Documentation

When adding new markdown files to the docs set:

1. Add/update entries in `sectionSpecs` in `scripts/generate-llms-full.ts`
2. Run `npm run generate-llms` to regenerate
3. Review changes in `public/llms-full.txt`
4. Commit both source docs and generated output

### Modifying the Generator

The generator is a TypeScript script using only Node built-ins.

Key functions:

- `resolveSections()` - resolves ordered section candidates (Pi-first)
- `stripMarkdown()` - converts markdown to plain text
- `generateHeader()` - builds header and TOC from resolved sections
- `generate()` - main generation flow
