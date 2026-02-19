---
type: board
title: Brainfile v2 Example Board
schema: https://brainfile.md/v2/board.json
protocolVersion: 2.0.0
strict: true
agent:
  instructions:
    - Use the CLI or MCP tools for task operations when available
    - Preserve all IDs and unknown fields
    - Update task column as you work (todo → in-progress → review → done)
    - Use contracts when handing work off to another agent
  llmNotes: |
    This is an example Brainfile v2 workspace.
    - Board config lives in .brainfile/brainfile.md
    - Active docs live in .brainfile/board/
    - Completed docs live in .brainfile/logs/
rules:
  always:
    - id: 1
      rule: Write tests for bug fixes and new features
    - id: 2
      rule: Keep tasks small and independently completable
  never:
    - id: 1
      rule: Change or regenerate existing task IDs
  prefer:
    - id: 1
      rule: Store context in task.description and files in task.relatedFiles
  context:
    - id: 1
      rule: This repo uses TypeScript and Node

types:
  epic:
    idPrefix: epic
    completable: false
    schema: https://brainfile.md/v2/epic.json
  adr:
    idPrefix: adr
    completable: false
    schema: https://brainfile.md/v2/adr.json

columns:
  - id: todo
    title: To Do
    order: 1
  - id: in-progress
    title: In Progress
    order: 2
  - id: review
    title: Review
    order: 3
  - id: done
    title: Done
    order: 4
    completionColumn: true
---

# Example Workspace

This folder demonstrates the v2 layout:

- `.brainfile/brainfile.md` (this file)
- `.brainfile/board/` (active task/epic/adr files)
- `.brainfile/logs/` (completed task files)
