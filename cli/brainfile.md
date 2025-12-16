---
schema: https://brainfile.md/v1/board.json
title: Brainfile CLI TUI Test Data
type: board
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
    - Keep ordering
    - Make minimal changes
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-100
        title: "[Long Description] Task with very long description to test wrapping"
        description: "This is a very long description that should wrap across multiple keyboard lines. It is designed to test the layout engine's ability to handle multi-line content gracefully without breaking the visual hierarchy or causing overlap with subsequent tasks. We want to ensure that the truncation happens correctly after 3 lines as specified in the design doc."
        priority: high
        tags:
          - test
          - layout
      - id: task-101
        title: "[No Desc] Simple task with no description"
        priority: medium
        tags:
          - test
      - id: task-102
        title: "[Subtasks] Task with subtasks (Mixed status)"
        description: "Task with some completed and some incomplete subtasks"
        priority: high
        subtasks:
          - id: task-102-1
            title: Completed subtask
            completed: true
          - id: task-102-2
            title: Incomplete subtask
            completed: false
          - id: task-102-3
            title: Another incomplete subtask
            completed: false
      - id: task-103
        title: "[Subtasks Only] Task with ONLY subtasks (No Description)"
        priority: low
        subtasks:
          - id: task-103-1
            title: Subtask 1
            completed: true
          - id: task-103-2
            title: Subtask 2
            completed: false
      - id: task-104
        title: "[Related] Task with related files"
        description: "Task showing related files display"
        relatedFiles:
          - "src/tui/components/TaskCard.tsx"
          - "src/tui/components/TaskList.tsx"
          - "src/tui/theme.ts"
          - "src/utils/very-long-file-name-that-should-be-truncated-correctly.ts"
      - id: task-105
        title: "[All Features] Complex task with everything"
        description: "This task has priority, tags, due date, subtasks, and related files."
        priority: critical
        tags:
          - feature
          - complex
        dueDate: "2025-12-31"
        subtasks:
          - id: task-105-1
            title: Subtask A
            completed: true
        relatedFiles:
          - "README.md"
  - id: spacing-test
    title: Spacing Test
    tasks:
      - id: task-201
        title: Spacing Task 1
      - id: task-202
        title: Spacing Task 2
      - id: task-203
        title: Spacing Task 3
      - id: task-204
        title: Spacing Task 4
      - id: task-205
        title: Spacing Task 5
      - id: task-206
        title: Spacing Task 6
      - id: task-207
        title: Spacing Task 7
      - id: task-208
        title: Spacing Task 8
      - id: task-209
        title: Spacing Task 9
      - id: task-210
        title: Spacing Task 10
  - id: done
    title: Done
    tasks:
      - id: task-301
        title: Completed Task
        priority: low
---