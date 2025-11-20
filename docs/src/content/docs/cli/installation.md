---
title: CLI Installation
description: How to install and set up the Brainfile CLI tool
---

## @brainfile/cli

Command-line interface for Brainfile task management. Manage your tasks from the terminal with ease.

## Installation Methods

### Install Globally (Recommended)

Install the CLI globally to use the `brainfile` command anywhere:

```bash
npm install -g @brainfile/cli
```

After installation, verify it works:

```bash
brainfile --version
brainfile --help
```

### Install as Project Dependency

For project-specific usage:

```bash
npm install --save-dev @brainfile/cli
```

Then use via npm scripts or npx:

```bash
npx brainfile list
```

### Using npx (No Installation)

Run commands without installing:

```bash
npx @brainfile/cli list
npx @brainfile/cli add --title "New task"
```

## Quick Start

1. **Install the CLI:**
   ```bash
   npm install -g @brainfile/cli
   ```

2. **Create a brainfile.md** in your project (or use an existing one)

3. **List your tasks:**
   ```bash
   brainfile list
   ```

4. **Add a new task:**
   ```bash
   brainfile add --title "My first task" --priority high
   ```

5. **Move a task:**
   ```bash
   brainfile move --task task-123 --column done
   ```

## Features

### Colored Output

The CLI provides colorful, easy-to-read output:
- **Task IDs** - Gray
- **Titles** - White
- **High Priority** - Red
- **Medium Priority** - Yellow
- **Low Priority** - Blue
- **Tags** - Cyan
- **Templates** - Magenta
- **Subtask Progress** - Green (complete) or Yellow (incomplete)

### Smart Task IDs

Task IDs are automatically generated with a timestamp and random string to ensure uniqueness.

## Verification

After installation, verify the CLI is working correctly:

```bash
# Check version
brainfile --version

# View help
brainfile --help

# List available commands
brainfile
```

## Troubleshooting

### Command not found

If you get "command not found" after global installation:

1. Check your npm global path:
   ```bash
   npm config get prefix
   ```

2. Ensure that path is in your `$PATH` environment variable

3. Try reinstalling:
   ```bash
   npm uninstall -g @brainfile/cli
   npm install -g @brainfile/cli
   ```

### Permission errors

If you get permission errors during global installation:

```bash
# Use sudo (not recommended)
sudo npm install -g @brainfile/cli

# Or configure npm to use a different directory (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

## Next Steps

- Learn about available [CLI commands](/cli/commands)
- See [usage examples](/cli/examples)
- Read about [task templates](/core/templates)

## Links

- **npm**: https://www.npmjs.com/package/@brainfile/cli
- **GitHub**: https://github.com/brainfile/cli
- **Core Library**: [@brainfile/core](https://www.npmjs.com/package/@brainfile/core)

