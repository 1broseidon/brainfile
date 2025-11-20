---
title: Test Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: First task
        priority: high
        tags:
          - test
          - urgent
  - id: in-progress
    title: In Progress
    tasks:
      - id: task-2
        title: Second task
        priority: medium
        tags:
          - test
        subtasks:
          - id: task-2-1
            title: Subtask one
            completed: false
          - id: task-2-2
            title: Subtask two
            completed: true
  - id: done
    title: Done
    tasks:
      - id: task-3
        title: Completed task
        priority: low
---
