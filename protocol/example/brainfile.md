---
type: board
title: Example Project Board
schema: https://brainfile.md/v2/board.json
protocolVersion: 2.0.0
agent:
  instructions:
    - This is an example board demonstrating Brainfile v2 features
    - Tasks are stored as individual files in .brainfile/board/
    - Completed tasks are moved to .brainfile/logs/
    - Preserve all IDs and unknown fields
  llmNotes: Demonstrates columns, rules, and agent instructions
statsConfig:
  columns:
    - todo
    - in-progress
    - review
    - done
rules:
  always:
    - id: 1
      rule: write tests for all new features
    - id: 2
      rule: update documentation when changing APIs
    - id: 3
      rule: run linter before committing code
  never:
    - id: 1
      rule: deploy without running tests
    - id: 2
      rule: commit directly to main branch
  prefer:
    - id: 1
      rule: functional components over class components
    - id: 2
      rule: TypeScript over JavaScript for new files
    - id: 3
      rule: descriptive variable names over comments
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
