---
title: Python API Reference
description: Complete API reference for the brainfile Python library
---

## Models

All models are plain Python dataclasses that include a `_ModelMixin` for Pydantic-style validation and serialization.

### `Task`

The core unit of work in Brainfile.

```python
@dataclass
class Task:
    id: str = ""
    title: str = ""
    column: str | None = None
    type: str | None = None
    description: str | None = None
    related_files: list[str] | None = None
    assignee: str | None = None
    tags: list[str] | None = None
    priority: Priority | str | None = None
    due_date: str | None = None
    subtasks: list[Subtask] | None = None
    contract: Contract | None = None
    parent_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    completed_at: str | None = None
```

### `BoardConfig`

Configuration for a Brainfile workspace (from `brainfile.md`).

```python
@dataclass
class BoardConfig:
    title: str | None = None
    type: str = "board"
    columns: list[ColumnConfig] = field(default_factory=list)
    strict: bool | None = False
    types: TypesConfig | None = None
    agent: AgentInstructions | None = None
    rules: Rules | None = None
```

### `Contract`

Specification for agent task execution.

```python
@dataclass
class Contract:
    status: ContractStatus = "draft"
    deliverables: list[Deliverable] | None = None
    validation: ValidationConfig | None = None
    constraints: list[str] | None = None
    context: ContractContext | None = None
    metrics: ContractMetrics | None = None
```

---

## Task File I/O

Functions for reading and writing individual task files.

#### `read_task_file(file_path: str) -> TaskDocument | None`

Read and parse a task file from disk.

#### `write_task_file(file_path: str, task: Task, body: str = "") -> None`

Write a task and body to a markdown file with YAML frontmatter.

#### `read_tasks_dir(dir_path: str) -> list[TaskDocument]`

Read all valid task files from a directory.

#### `parse_task_content(content: str) -> tuple[Task, str]`

Parse raw markdown content into a `(Task, body)` tuple.

#### `serialize_task_content(task: Task, body: str = "") -> str`

Serialize a `Task` and body into markdown with YAML frontmatter.

---

## Task Operations (v2)

High-level operations for the per-task file architecture.

#### `add_task_file(board_dir: str, input: TaskFileInput, body: str = "", logs_dir: str | None = None) -> TaskOperationResult`

Create a new task file. Auto-generates ID if not provided.

#### `move_task_file(task_path: str, new_column: str, new_position: int | None = None) -> TaskOperationResult`

Move a task to a different column by updating its frontmatter.

#### `complete_task_file(task_path: str, logs_dir: str, legacy_mode: bool = False, summary: str | None = None, files_changed: list[str] | None = None) -> TaskOperationResult`

Complete a task, moving it to `logs/` and recording the event in the ledger.

#### `delete_task_file(task_path: str) -> TaskOperationResult`

Remove a task file from the filesystem.

#### `append_log(task_path: str, entry: str, agent: str | None = None) -> TaskOperationResult`

Append a timestamped entry to the `## Log` section of a task.

---

## Board Config I/O

#### `read_board_config(brainfile_path: str) -> BoardConfig`

Read and parse the workspace configuration file.

#### `write_board_config(file_path: str, config: BoardConfig, body: str = "") -> None`

Write a `BoardConfig` to disk.

#### `parse_board_config(content: str) -> tuple[BoardConfig, str]`

Parse raw `brainfile.md` content.

#### `serialize_board_config(config: BoardConfig, body: str = "") -> str`

Serialize `BoardConfig` to markdown.

---

## Workspace

#### `ensure_dirs(brainfile_path: str) -> WorkspaceDirs`

Ensure `board/` and `logs/` directories exist relative to the brainfile.

#### `get_dirs(brainfile_path: str) -> WorkspaceDirs`

Resolve standard workspace directory paths.

#### `is_workspace(brainfile_path: str) -> bool`

Check if a directory contains a valid Brainfile board structure.

---

## Ledger

#### `build_ledger_record(task: Task, body: str, options: BuildLedgerRecordOptions) -> LedgerRecord`

Create a tamper-evident record for task completion.

#### `append_ledger_record(logs_dir: str, record: LedgerRecord) -> str`

Append a record to `ledger.jsonl`.

#### `read_ledger(logs_dir: str) -> list[LedgerRecord]`

Read all records from the ledger.

#### `query_ledger(logs_dir: str, filters: LedgerQueryFilters) -> list[LedgerRecord]`

Find records matching specific criteria (assignee, tags, date range, etc.).

#### `get_file_history(logs_dir: str, file_path: str) -> list[LedgerRecord]`

Get all completion records that involved a specific source file.

---

## Discovery

#### `discover(root_dir: str, options: DiscoveryOptions = None) -> DiscoveryResult`

Find all Brainfiles in a directory tree.

#### `find_primary_brainfile(root_dir: str) -> DiscoveredFile | None`

Find the main brainfile in a directory (prefers `brainfile.md`).

#### `find_nearest_brainfile(start_dir: str = None) -> DiscoveredFile | None`

Find the nearest Brainfile by walking up the directory tree.

#### `watch_brainfiles(root_dir: str, callback: Callable) -> WatchResult`

Monitor a directory for Brainfile changes using a cross-platform watcher.

---

## Board Validation

#### `validate_type(board: BoardConfig, type_name: str) -> BoardValidationResult`

Check if a document type is valid according to the board's strict mode settings.

#### `validate_column(board: BoardConfig, column_id: str) -> BoardValidationResult`

Check if a column ID exists in the board configuration.

#### `get_board_types(board: BoardConfig) -> TypesConfig`

Get the mapping of allowed document types.

---

## Templates

#### `process_template(template: TaskTemplate, values: dict[str, str]) -> Task`

Create a task from a template with variable substitution.

#### `get_template_by_id(template_id: str) -> TaskTemplate | None`

Retrieve a built-in or user-defined template.

---

## ID Generation

#### `extract_task_id_number(task_id: str) -> int | None`

Extract the numeric portion of an ID (e.g., `123` from `task-123`).

#### `is_valid_task_id(task_id: str) -> bool`

Check if a string matches the Brainfile task ID format.

#### `generate_next_subtask_id(task_id: str, existing_subtasks: list[Subtask]) -> str`

Generate the next sequential subtask ID (e.g., `task-1-3`).

---

## Extension Fields (`x-*`)

Brainfile models use a `_extras` mechanism to preserve unknown fields. This is critical for interoperability between different tools.

- **Storage**: Fields starting with `x-` (e.g., `x-cursor`, `x-otto`) are captured during `model_validate()`.
- **Round-trip**: These fields are automatically merged back during `model_dump()` and serialization.
- **Access**: While not top-level attributes on the dataclasses, they are available in the `_extras` dictionary on the instance.

```python
# Construction
task = Task.model_validate({"title": "Example", "x-custom": 123})

# Round-trip serialization
data = task.model_dump(by_alias=True)
print(data["x-custom"])  # 123
```
