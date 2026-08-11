# Documentation Generation Scripts

## generate-llms-full.ts

Automatically generates `/public/llms-full.txt` from markdown documentation.

### Purpose

Prevents fragmentation between markdown docs and the LLM reference by maintaining a single source of truth.

### How it Works

1. Resolves documentation sections in a fixed order
2. Supports migration-aware section candidates (fallback paths per section)
3. Strips markdown formatting to plain text
4. Combines sections with generated headers/TOC
5. Writes to `public/llms-full.txt`

### When it Runs

- Automatically during `npm run build`
- Manually with `npm run generate-llms`

### Source Files (ordered)

1. `quick-start.md`
2. `guides/getting-started-with-contracts.md`
3. `guides/contracts.md`
4. `guides/agent-workflows.md`
5. `tools/cli.md`
6. `tools/mcp.md`
7. `tools/core.md`
8. `reference/protocol.md`
9. `reference/api.md`
10. `reference/commands.md`
11. `reference/contract-schema.md`
12. `reference/types.md`

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

- `resolveSections()` - resolves ordered section candidates
- `stripMarkdown()` - converts markdown to plain text
- `generateHeader()` - builds header and TOC from resolved sections
- `generate()` - main generation flow
