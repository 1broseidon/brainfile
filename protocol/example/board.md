---
type: board
schema: https://brainfile.md/v1/board.json
title: Product Development Board
protocolVersion: 0.5.0
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Use task-[number] format for task IDs
    - Preserve all IDs and ordering
    - Update task status as work progresses
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
columns:
  - id: todo
    title: To Do
    order: 1
    tasks:
      - id: task-1
        title: Add user authentication
        description: |
          Implement JWT-based authentication system with:
          - Login/logout endpoints
          - Token refresh mechanism
          - Protected routes
        priority: high
        effort: large
        tags:
          - backend
          - security
          - feature
        template: feature
        relatedFiles:
          - src/auth/jwt.ts
          - src/middleware/auth.ts
        createdAt: "2025-11-24T10:00:00Z"
        subtasks:
          - id: task-1-1
            title: Implement JWT generation and validation
            completed: false
          - id: task-1-2
            title: Create login endpoint
            completed: false
          - id: task-1-3
            title: Create logout endpoint
            completed: false
          - id: task-1-4
            title: Add token refresh mechanism
            completed: false
          - id: task-1-5
            title: Write tests for auth flow
            completed: false
  - id: in-progress
    title: In Progress
    order: 2
    tasks:
      - id: task-2
        title: Fix pagination bug on dashboard
        description: |
          The pagination controls disappear after page 5.

          ## Steps to Reproduce
          1. Navigate to dashboard
          2. Load more than 50 items
          3. Click to page 6
          4. Pagination controls vanish
        priority: high
        effort: small
        tags:
          - bug
          - frontend
        template: bug
        assignee: alice
        relatedFiles:
          - src/components/Dashboard.tsx
          - src/hooks/usePagination.ts
        createdAt: "2025-11-23T14:30:00Z"
        updatedAt: "2025-11-24T09:15:00Z"
        subtasks:
          - id: task-2-1
            title: Reproduce the bug locally
            completed: true
          - id: task-2-2
            title: Identify root cause
            completed: true
          - id: task-2-3
            title: Fix the issue
            completed: false
          - id: task-2-4
            title: Add regression test
            completed: false
      - id: task-4
        title: Test Task from CLI
        description: Testing core operations integration
  - id: review
    title: Review
    order: 3
    tasks: []
  - id: done
    title: Done
    order: 4
    tasks:
      - id: task-3
        title: Set up CI/CD pipeline
        description: |
          Configure GitHub Actions for:
          - Automated testing on PR
          - Deployment to staging
          - Production deployment on merge
        priority: medium
        effort: medium
        tags:
          - devops
          - infrastructure
        assignee: bob
        createdAt: "2025-11-20T10:00:00Z"
        updatedAt: "2025-11-23T16:45:00Z"
        subtasks:
          - id: task-3-1
            title: Create GitHub Actions workflow
            completed: true
          - id: task-3-2
            title: Configure staging deployment
            completed: true
          - id: task-3-3
            title: Configure production deployment
            completed: true
          - id: task-3-4
            title: Test end-to-end pipeline
            completed: true
statsConfig:
  columns:
    - todo
    - in-progress
    - review
    - done
---
