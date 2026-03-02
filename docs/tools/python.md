---
title: Python (brainfile)
description: Python library for Brainfile operations
---

# Python (`brainfile`)

`brainfile` is the official Python library for the Brainfile task management protocol. It is designed for AI agents and automation tools that need to coordinate tasks using a structured, file-based workflow.

## Installation

```bash
pip install brainfile
```

::: tip Quick Start
```python
from brainfile import ensure_dirs, add_task_file, read_tasks_dir

# Setup standard directory structure (.brainfile/board/, etc.)
dirs = ensure_dirs(".brainfile/brainfile.md")

# Add a task file (auto-generates ID and filename)
result = add_task_file(dirs.board_dir, {"title": "New feature", "column": "todo"})

# List all active tasks
for doc in read_tasks_dir(dirs.board_dir):
    print(f"{doc.task.id}: {doc.task.title}")
```
:::

## Quick Example

```python
from brainfile import read_task_file, move_task_file, complete_task_file
import os

# Read a specific task file
doc = read_task_file(".brainfile/board/task-1.md")
print(f"Working on: {doc.task.title}")

# Move task to 'in-progress'
move_task_file(".brainfile/board/task-1.md", "in-progress")

# Complete the task
# This moves the file to logs/ and appends a record to ledger.jsonl
complete_task_file(".brainfile/board/task-1.md", ".brainfile/logs/")
```

---

## Core Concepts

### Models & Extension Fields

The library uses plain Python dataclasses for all models (`Task`, `BoardConfig`, `Contract`, etc.). A unique `_ModelMixin` provides Pydantic-like features:

- **CamelCase/SnakeCase**: Construction via `model_validate()` supports both styles.
- **Extension Fields**: Unknown fields (like `x-otto` or `x-cursor`) are preserved in an `_extras` dict and merged back during serialization, ensuring no data loss when round-tripping files.

```python
from brainfile import Task

# Preserves extension fields automatically
task = Task.model_validate({"title": "Fix bug", "x-custom-field": "value"})
data = task.model_dump(by_alias=True)
print(data["x-custom-field"])  # "value"
```

### v2 File-Based Architecture

Unlike legacy systems that store all tasks in a single large file, `brainfile` prioritizes a distributed architecture where:
- `brainfile.md` contains **configuration** (columns, rules, types).
- Individual `.md` files in `board/` contain **active tasks**.
- Individual `.md` files in `logs/` contain **completed history**.
- `ledger.jsonl` provides a **tamper-evident audit log** of all operations.

---

## Task Operations

### Add Task

```python
from brainfile import add_task_file

result = add_task_file(".brainfile/board/", {
    "title": "Implement auth",
    "priority": "high",
    "tags": ["security"],
    "assignee": "agent-1"
})
print(f"Created {result.task_id}")
```

### Move Task

```python
from brainfile import move_task_file

# Updates the 'column' field in the task's frontmatter
move_task_file(".brainfile/board/task-1.md", "done")
```

### Complete Task

```python
from brainfile import complete_task_file

# Moves from board/ to logs/, sets completed_at, and records in ledger
complete_task_file(".brainfile/board/task-1.md", ".brainfile/logs/")
```

---

## Workspace & Discovery

The library includes powerful utilities for finding and initializing Brainfile workspaces:

```python
from brainfile import discover, ensure_dirs

# Find all brainfiles in a project
for result in discover("."):
    print(f"Found {result.path} (Type: {result.type})")

# Ensure standard directories exist
dirs = ensure_dirs(".brainfile/brainfile.md")
# dirs.board_dir -> ".brainfile/board/"
# dirs.logs_dir -> ".brainfile/logs/"
```

---

## Parsing & Serialization

For low-level manipulation of Brainfile content:

```python
from brainfile import BrainfileParser, serialize_task_content

# Parse raw markdown with YAML frontmatter
doc = BrainfileParser.parse(markdown_content)

# Serialize a Task object back to markdown
content = serialize_task_content(task, body="## Task Notes
...")
```

---

## Next Steps

- [Overview](/python/overview) — Detailed guide on v2 operations, ledger, and validation
- [API Reference](/python/api-reference) — Complete module and class documentation
- [Protocol Specification](/reference/protocol) — Full YAML structure and field reference
- [CLI Source](https://github.com/brainfile/brainfile-py) — See how the library is implemented
