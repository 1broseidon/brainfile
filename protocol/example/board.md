---
type: board
schema: https://brainfile.md/v2/board.json
title: Product Development Board
protocolVersion: 2.0.0
agent:
  instructions:
    - Modify only YAML frontmatter in task files
    - Use task-[number] format for task IDs (e.g., task-1)
    - Preserve all IDs and ordering
    - Update task column as work progresses
    - Store active tasks in .brainfile/board/ and completed tasks in .brainfile/logs/
  llmNotes: This is a product development board tracking features and bugs
rules:
  always:
    - id: 1
      rule: test all features before moving to done
    - id: 2
      rule: link related files for each task
  never:
    - id: 1
      rule: skip code review for any task
  prefer:
    - id: 1
      rule: small, focused tasks over large epics
  context:
    - id: 1
      rule: this is a TypeScript project using React
    - id: 2
      rule: we deploy continuously to production
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
