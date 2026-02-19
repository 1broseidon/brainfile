# Brainfile Documentation Site

Built with [VitePress](https://vitepress.dev/).

## Development

```bash
cd protocol/docs
npm install
npm run dev           # Start dev server at localhost:5173
npm run build         # Build production site to ./dist/
npm run preview       # Preview build locally
```

## Structure

```
docs/
├── .vitepress/
│   ├── config.ts       # Site configuration and navigation
│   └── theme/          # Custom theme and CSS
├── public/
│   ├── llms.txt        # Curated quick reference for AI agents
│   └── llms-full.txt   # Auto-generated comprehensive reference
├── scripts/
│   └── generate-llms-full.ts  # Generates llms-full.txt from docs
├── index.md            # Homepage
├── quick-start.md      # Quick start guide
├── why.md              # Why Brainfile?
├── guides/             # In-depth guides
├── tools/              # CLI, MCP, Pi, Core docs
├── reference/          # Protocol spec, API ref, CLI commands
├── types/              # Schema documentation (base, board, contract)
├── cli/                # CLI-specific docs
├── core/               # Core library docs
├── agents/             # AI agent integration
└── vscode/             # Legacy VSCode docs (deprecated)
```

## Generating LLM References

```bash
npm run generate-llms   # Regenerate public/llms-full.txt
```

The `llms-full.txt` is auto-generated from docs. The `llms.txt` is manually curated.
