# Documentation Generation Scripts

## generate-llms-full.ts

Automatically generates `/public/llms-full.txt` from markdown documentation.

### Purpose

Prevents fragmentation between markdown docs and LLM reference by maintaining a single source of truth.

### How it Works

1. Reads markdown files from `src/content/docs/` in defined order
2. Strips markdown formatting to plain text
3. Combines sections with proper headers
4. Adds a complete v2 workspace example from `protocol/example/.brainfile/`
5. Writes to `public/llms-full.txt`

### When it Runs

- Automatically during `npm run build` (via `prebuild` script)
- Manually with `npm run generate-llms`

### Source Files (in order)

1. quick-start.md
2. why.md
3. guides/getting-started-with-contracts.md
4. guides/contracts.md
5. guides/agent-workflows.md
6. tools/cli.md
7. tools/mcp.md
8. tools/vscode.md
9. tools/core.md
10. reference/protocol.md
11. reference/api.md
12. reference/commands.md
13. reference/contract-schema.md
14. reference/types.md
15. ../../example/.brainfile/** (complete v2 workspace example)

### Outputs

- `public/llms-full.txt` (~2900 lines)
  - Comprehensive AI agent reference
  - Auto-generated, do NOT manually edit
  - Committed to git for visibility and review

### Manual Files

- `public/llms.txt` (~350 lines)
  - Curated quick reference
  - Manually maintained
  - Should be kept concise

### Adding New Documentation

When adding new markdown files to `src/content/docs/`:

1. Add the file path to the `sections` array in `generate-llms-full.ts`
2. Run `npm run generate-llms` to regenerate
3. Review the changes in `public/llms-full.txt`
4. Commit both the markdown and generated txt file

### Modifying the Generator

The generator is a simple TypeScript script with no external dependencies (beyond Node built-ins).

Key functions:
- `stripMarkdown()` - Converts markdown to plain text
- `generate()` - Main generation logic
- `generateHeader()` - Creates header with TOC

To modify output format, edit these functions in `generate-llms-full.ts`.
