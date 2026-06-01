---
title: Complex Project
protocolVersion: "1.0"
schema: https://example.com/schema.json
agent:
  instructions:
    - Modify only YAML frontmatter
    - Preserve all IDs
rules:
  always:
    - id: 1
      rule: Write tests for new features
  never:
    - id: 1
      rule: Commit directly to main
  prefer:
    - id: 1
      rule: Small, focused commits
  context:
    - id: 1
      rule: This is a TypeScript project
statsConfig:
  columns:
    - todo
    - done
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Task with Everything
        description: |
          ## Description
          This task has all possible fields.

          - Bullet point
          - Another point
        assignee: john
        tags:
          - feature
          - high-priority
        priority: high
        dueDate: "2024-12-31"
        template: feature
        relatedFiles:
          - src/app.ts
          - src/utils.ts
        subtasks:
          - id: task-1-1
            title: Design
            completed: true
          - id: task-1-2
            title: Implement
            completed: false
  - id: done
    title: Done
    tasks: []
archive:
  - id: task-archived-1
    title: Old Task
    description: This was completed long ago
---
