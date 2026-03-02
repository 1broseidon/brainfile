---
title: Python Library Overview
description: Python library for parsing and manipulating Brainfiles
---

## brainfile

Official Python library for the Brainfile task management protocol. Provides parsing, serialization, validation, v2 file-based operations, ledger management, and discovery.

## Installation

```bash
pip install brainfile
```

## Features

- **v2 File Operations** - Add, move, and complete individual task files in `board/` and `logs/`
- **Ledger Operations** - Append-only history with tamper-evident records in `ledger.jsonl`
- **Board Config** - Read and write `brainfile.md` configuration (columns, types, rules)
- **Type Validation** - Strict mode type and column validation
- **Models & Mixins** - Python dataclasses with round-trip support for extension fields (`x-*`)
- **Discovery** - Auto-detect `.brainfile/brainfile.md` by walking up the directory tree
- **Templates** - Process built-in task templates (Bug Report, Feature Request, Refactor)
- **Watcher** - Cross-platform file watching for Brainfile changes

## Quick Start

```python
from brainfile import BrainfileParser, ensure_dirs, read_tasks_dir

# Parse a board config from markdown
markdown = """---
title: My Project
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
---
"""

data = BrainfileParser.parse(markdown)
print(data["title"])  # "My Project"

# v2: Initialize workspace and read task files
dirs = ensure_dirs(".brainfile/brainfile.md")
tasks = read_tasks_dir(dirs.board_dir)
```

## v2 File Operations

The Python library is optimized for the v2 per-task file architecture. These operations have filesystem side effects.

```python
from brainfile import add_task_file, move_task_file, complete_task_file

# Add a new task file (auto-generates ID like task-1.md)
result = add_task_file(".brainfile/board/", {
    "title": "Implement auth",
    "column": "todo",
    "priority": "high",
    "assignee": "agent-1"
})

if result["success"]:
    task_path = result["file_path"]

# Move task between columns (updates frontmatter)
move_task_file(task_path, "in-progress")

# Complete task
# Moves file to logs/, sets completed_at, and appends to ledger.jsonl
complete_task_file(task_path, ".brainfile/logs/")
```

## Ledger Operations

The `ledger` module provides tools for working with the append-only completion history.

```python
from brainfile import read_ledger, query_ledger, get_file_history

# Read all completion records
records = read_ledger(".brainfile/logs/")

# Query records for a specific assignee and tag
filtered = query_ledger(".brainfile/logs/", {
    "assignee": "agent-1",
    "tags": ["feature"]
})

# Get completion history for a specific source file
history = get_file_history(".brainfile/logs/", "src/auth.py")
```

## Board Configuration

```python
from brainfile import read_board_config, write_board_config

# Read typed BoardConfig
config = read_board_config(".brainfile/brainfile.md")
print(config.title)

# Update and save
config.title = "Updated Project Name"
write_board_config(".brainfile/brainfile.md", config)
```

## Board Validation

Strict mode validation for custom document types and columns.

```python
from brainfile import validate_type, validate_column

# Validate a custom type (e.g., 'epic', 'adr')
result = validate_type(config, "epic")
if not result["valid"]:
    print(f"Error: {result['error']}")

# Validate a column ID
col_result = validate_column(config, "non-existent-column")
```

## Discovery

Find Brainfile workspaces automatically.

```python
from brainfile import discover, find_nearest_brainfile

# Search recursively from root
results = discover("./projects")

# Find nearest workspace by walking up from current directory
nearest = find_nearest_brainfile()
if nearest:
    print(f"Found workspace at {nearest.absolute_path}")
```

## Templates

```python
from brainfile import get_template_by_id, process_template

# Get a built-in template
template = get_template_by_id("bug-report")

# Process it with variable substitution
task = process_template(template, {
    "title": "Login fails on iOS",
    "description": "User sees 404"
})
```

## Extension Fields (x-*)

All models support round-tripping of unknown extension fields, preserving data from tools like Cursor or Otto.

```python
from brainfile import Task

# Construct with extension fields
task = Task.model_validate({
    "title": "Fix bug",
    "x-cursor-metadata": {"source": "agent"}
})

# Serialization preserves the field
data = task.model_dump(by_alias=True)
assert "x-cursor-metadata" in data
```

## Links

- **PyPI**: https://pypi.org/project/brainfile/
- **GitHub**: https://github.com/brainfile/brainfile-py
- **API Reference**: [/python/api-reference](/python/api-reference)
