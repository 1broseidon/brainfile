# Documentation Generation Scripts

## generate-llms-full.ts

Automatically generates `/public/llms-full.txt` from markdown documentation.

### Purpose

Prevents fragmentation between markdown docs and LLM reference by maintaining a single source of truth.

### How it Works

1. Reads markdown files from `src/content/docs/` in defined order
2. Strips markdown formatting to plain text
3. Combines sections with proper headers
4. Adds complete example from `protocol/example/brainfile.md`
5. Writes to `public/llms-full.txt`

### When it Runs

- Automatically during `npm run build` (via `prebuild` script)
- Manually with `npm run generate-llms`

### Source Files (in order)

1. getting-started/quick-start.md
2. protocol/specification.md
3. agents/integration.md
4. cli/installation.md
5. cli/commands.md
6. cli/examples.md
7. core/overview.md
8. core/api-reference.md
9. core/templates.md
10. vscode/extension.md
11. ../../example/brainfile.md (complete example)

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
