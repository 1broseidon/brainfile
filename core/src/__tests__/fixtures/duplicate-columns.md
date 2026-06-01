---
title: Board with Duplicate Columns
schema: https://brainfile.md/v1.json
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: First Task
        description: This is in the first todo column
  - id: in-progress
    title: In Progress
    tasks:
      - id: task-2
        title: Second Task
        description: This is in progress
  - id: todo
    title: To Do (Duplicate)
    tasks:
      - id: task-3
        title: Third Task
        description: This is in the duplicate todo column
      - id: task-4
        title: Fourth Task
        description: Another task in duplicate column
  - id: done
    title: Done
    tasks:
      - id: task-5
        title: Completed Task
  - id: todo
    title: To Do (Another Duplicate)
    tasks:
      - id: task-6
        title: Sixth Task
---

