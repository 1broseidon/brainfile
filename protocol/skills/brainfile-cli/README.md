# Brainfile CLI Skill

A comprehensive skill that teaches Claude Code and other AI agents how to use the brainfile CLI tool for task management and multi-agent coordination.

## What This Skill Does

This skill provides complete knowledge of the brainfile CLI, including:

- **Task Management:** Creating, updating, and organizing tasks with tags, priorities, and assignees
- **Contract System:** Setting up formal contracts for multi-agent workflows
- **Validation:** Automated and manual validation of deliverables
- **Coordination:** Managing work across multiple AI agents (codex, cursor, gemini, etc.)
- **Best Practices:** Proven patterns for effective task delegation and tracking

## When Claude Uses This Skill

Claude will automatically invoke this skill when you:

- Ask to create, update, or manage tasks in brainfile
- Want to set up a contract for another agent
- Need to validate deliverables or check contract status
- Want to coordinate work between multiple agents
- Ask questions about brainfile capabilities or commands

## Installation

### For Claude Desktop / Claude Code

1. **Package the skill:**
   ```bash
   cd protocol/skills
   zip -r brainfile-cli.zip brainfile-cli/
   ```

2. **Add to Claude:**
   - Open Claude Desktop settings
   - Go to Capabilities > Skills
   - Click "Add Skill"
   - Upload `brainfile-cli.zip`
   - Enable the skill

### For Claude Code CLI

The skill is already available in this repository at `protocol/skills/brainfile-cli/`.

Claude Code will automatically discover and use it when working in this project.

### Dependencies

This skill requires the brainfile CLI to be installed:

```bash
npm install -g @brainfile/cli
# or
npm install --save-dev @brainfile/cli
```

## Skill Structure

```
brainfile-cli/
├── Skill.md         # Main skill file with comprehensive CLI reference
├── EXAMPLES.md      # Real-world examples and workflows
└── README.md        # This file
```

## What's Included

### Skill.md

The core skill file includes:

- **Command Reference:** All brainfile CLI commands with syntax and options
- **Contract System (v2.0):** Complete contract lifecycle and operations
- **Best Practices:** Guidelines for effective task and contract management
- **Quick Reference:** Command cheat sheet for common operations
- **Troubleshooting:** Solutions to common issues

### EXAMPLES.md

Real-world examples including:

- Backend API feature delegation
- Frontend component with design review cycles
- Documentation research tasks
- Bug fixes with root cause analysis
- Multi-agent parallel work
- Complex deliverables with subtask tracking
- Sprint planning with filters
- Manual validation workflows
- Blocked contracts and resolution
- Contract amendments and rework metrics

## Usage Examples

### Example 1: Creating a Task for Another Agent

**You say:**
> "Create a task for codex to implement user authentication with OAuth"

**Claude uses this skill to:**
```bash
brainfile add -c todo \
  --title "Implement OAuth authentication" \
  --assignee codex \
  --with-contract \
  --deliverable "file:src/auth/oauth.ts:OAuth implementation" \
  --validation "npm test -- auth"
```

### Example 2: Checking Task Status

**You say:**
> "What's the status of task-123?"

**Claude uses this skill to:**
```bash
brainfile show -t task-123
```

### Example 3: Validating Delivered Work

**You say:**
> "Validate the contract for task-456"

**Claude uses this skill to:**
```bash
brainfile contract validate -t task-456
```

## Customization

You can extend this skill by:

1. **Adding project-specific conventions** to Skill.md under "Best Practices"
2. **Creating additional examples** in EXAMPLES.md for your team's workflows
3. **Adding reference documentation** for integration with your specific tools

## Version

- **Skill Version:** 1.0.0
- **Contract System:** v2.0
- **Compatible with:** brainfile CLI v1.0.0+

## Documentation References

For more information, see:

- **Contract System Guide:** `protocol/docs/guides/contracts.md`
- **Agent Workflows:** `protocol/docs/guides/agent-workflows.md`
- **CLI Reference:** `protocol/docs/cli/contract-commands.md`
- **Architecture:** `CONTRACT_DESIGN.md`
- **Schema:** `protocol/v1/board.json`

## Support

For issues or questions about:

- **This skill:** Open an issue in the brainfile repository
- **brainfile CLI:** See the main brainfile documentation
- **Claude Code:** Visit https://github.com/anthropics/claude-code/issues

## License

This skill is part of the brainfile project and follows the same license.
