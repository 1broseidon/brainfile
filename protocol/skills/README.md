# Brainfile Skills Directory

This directory contains custom skills for Claude Code and other AI agents that adopt the Agent Skills specification.

## Available Skills

### brainfile-cli

**Purpose:** Comprehensive training skill that teaches agents how to use the brainfile CLI for task management and multi-agent coordination.

**Use cases:**
- Creating and managing tasks
- Setting up contracts for other agents
- Validating deliverables
- Coordinating multi-agent workflows
- Sprint planning and organization

**Files:**
- `Skill.md` - Main skill with complete CLI reference (13KB)
- `EXAMPLES.md` - Real-world examples and workflows (15KB)
- `README.md` - Installation and usage instructions (4.5KB)
- `verify.sh` - Structure validation script
- `package.sh` - Packaging script for distribution

**Status:** ✅ Ready for use

**Package:** `brainfile-cli.zip` (13KB)

## Using Skills in Claude Code

Skills in this directory are automatically discovered by Claude Code when working in this project. No installation needed for local development.

## Distributing Skills

To package a skill for distribution to other users or for Claude Desktop:

```bash
cd protocol/skills/<skill-name>
./package.sh
```

This creates a `.zip` file that can be uploaded to Claude Desktop via Settings > Capabilities > Skills.

## Creating New Skills

To create a new skill:

1. **Create a directory** in `protocol/skills/<skill-name>/`

2. **Create Skill.md** with YAML frontmatter:
   ```yaml
   ---
   name: Your Skill Name
   description: When to use this skill (max 200 chars)
   dependencies: optional-package>=1.0.0
   ---

   # Your Skill Name

   ## Overview
   Explain what this skill does...
   ```

3. **Add supporting files** (optional):
   - `EXAMPLES.md` - Detailed examples
   - `REFERENCE.md` - Additional reference material
   - Scripts or code if needed

4. **Create README.md** explaining the skill

5. **Copy verification and packaging scripts:**
   ```bash
   cp brainfile-cli/verify.sh <skill-name>/
   cp brainfile-cli/package.sh <skill-name>/
   # Edit scripts to update SKILL_NAME variable
   ```

6. **Test the skill:**
   ```bash
   cd <skill-name>
   ./verify.sh
   ./package.sh
   ```

## Skill Standards

All skills should follow the [Agent Skills specification](https://agentskills.io) to ensure compatibility across platforms.

### Required Components

- **Skill.md** with YAML frontmatter containing:
  - `name` (max 64 chars)
  - `description` (max 200 chars)
- Clear instructions in the markdown body
- Examples when helpful

### Best Practices

1. **Focus:** One skill = one workflow (not everything)
2. **Clarity:** Description determines when Claude uses the skill
3. **Examples:** Show expected inputs and outputs
4. **Simplicity:** Start with markdown before adding scripts
5. **Testing:** Test after each change
6. **Composability:** Skills can work together automatically

### Metadata Guidelines

```yaml
---
name: Short Name              # 64 chars max, human-friendly
description: When to use      # 200 chars max, triggers invocation
dependencies: package>=1.0    # Optional, comma-separated
---
```

## Directory Structure

```
protocol/skills/
├── README.md                 # This file
├── brainfile-cli/            # Brainfile CLI skill
│   ├── Skill.md             # Core skill file
│   ├── EXAMPLES.md          # Reference examples
│   ├── README.md            # Installation guide
│   ├── verify.sh            # Validation script
│   └── package.sh           # Packaging script
└── brainfile-cli.zip        # Packaged skill
```

## Testing Skills Locally

When developing in this repository, Claude Code will automatically use skills from this directory. Test by:

1. **Making changes** to Skill.md or reference files
2. **Starting a new conversation** or mentioning the skill explicitly
3. **Verifying behavior** matches your expectations

No need to package/install for local testing.

## Version Control

- **Include:** Source skill directories (`brainfile-cli/`)
- **Exclude:** Generated packages (`*.zip`) - add to `.gitignore`

Skills are version-controlled as source code. Generate packages on-demand for distribution.

## Security Considerations

When creating skills with scripts:

- ❌ Never hardcode sensitive information (API keys, passwords)
- ✅ Review skills before enabling them
- ✅ Use MCP connections for external service access
- ✅ Document required permissions clearly

## Contributing

When adding new skills:

1. Follow the naming convention: `lowercase-with-dashes`
2. Include comprehensive examples
3. Add verification and packaging scripts
4. Update this README with the new skill
5. Test thoroughly before committing

## Resources

- **Agent Skills Spec:** https://agentskills.io
- **Claude Skills Docs:** https://docs.anthropic.com/claude/docs/skills
- **GitHub Examples:** https://github.com/anthropics/skills
- **Brainfile Docs:** `../docs/`

## Support

For questions about:

- **Specific skills:** See the skill's README.md
- **Creating skills:** See Claude documentation or agentskills.io
- **Brainfile integration:** Open an issue in this repository
