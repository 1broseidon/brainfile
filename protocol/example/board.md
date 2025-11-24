---
# Type discriminator - identifies this as a board brainfile
type: board

# Schema URL for validation - points to board-specific schema
schema: https://brainfile.md/v1/board.json

# Title of the board
title: Product Development Board

# Protocol version this file conforms to
protocolVersion: 0.5.0

# Instructions for AI agents interacting with this board
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Use task-[number] format for task IDs
    - Preserve all IDs and ordering
    - Update task status as work progresses
  # Additional context for AI to understand the board's purpose
  llmNotes: This is a product development board tracking features and bugs

# Rules that apply to this board and all tasks
rules:
  # Rules that must always be followed
  always:
    - id: 1
      rule: test all features before moving to done
    - id: 2
      rule: link related files for each task
  # Rules that must never be violated
  never:
    - id: 1
      rule: skip code review for any task
  # Preferred practices (flexible guidelines)
  prefer:
    - id: 1
      rule: small, focused tasks over large epics
  # Context that helps understand the project
  context:
    - id: 1
      rule: this is a TypeScript project using React
    - id: 2
      rule: we deploy continuously to production
# Columns organize tasks by workflow stage
# Each column has a unique ID, title, and order (left to right)
columns:
  - id: todo
    # Column title displayed in UI
    title: To Do
    # Display order (lower numbers appear first/left)
    order: 1
    # Tasks within this column
    tasks:
      # Each task has a unique ID, title, and metadata
      - id: task-1
        # Task title - short, actionable summary
        title: Add user authentication
        # Detailed description - supports markdown formatting
        description: |
          Implement JWT-based authentication system with:
          - Login/logout endpoints
          - Token refresh mechanism
          - Protected routes
        # Priority level: low, medium, high, critical
        priority: high
        # Effort estimate: small, medium, large, extra-large
        effort: large
        # Tags for filtering and categorization
        tags:
          - backend
          - security
          - feature
        # Template type: feature, bug, refactor (affects task structure)
        template: feature
        # Links to relevant code files or documentation
        relatedFiles:
          - src/auth/jwt.ts
          - src/middleware/auth.ts
        # When this task was created (ISO 8601 timestamp)
        createdAt: "2025-11-24T10:00:00Z"
        # Subtasks - smaller steps to complete this task
        subtasks:
          - id: task-1-1
            title: Implement JWT generation and validation
            # Completion status for subtask
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
  # Second column - tasks actively being worked on
  - id: in-progress
    title: In Progress
    order: 2
    tasks:
      # Bug template task - notice different fields and format
      - id: task-2
        title: Fix pagination bug on dashboard
        # Bug descriptions often include reproduction steps
        description: |
          The pagination controls disappear after page 5.

          ## Steps to Reproduce
          1. Navigate to dashboard
          2. Load more than 50 items
          3. Click to page 6
          4. Pagination controls vanish
        # Bugs often have high priority to fix quality issues
        priority: high
        # Small effort for a targeted bug fix
        effort: small
        tags:
          - bug
          - frontend
        # Bug template includes reproduction steps and fix verification
        template: bug
        # Person currently working on this task
        assignee: alice
        relatedFiles:
          - src/components/Dashboard.tsx
          - src/hooks/usePagination.ts
        createdAt: "2025-11-23T14:30:00Z"
        # When this task was last modified (optional field)
        updatedAt: "2025-11-24T09:15:00Z"
        # Note: Some subtasks are completed, showing progress
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
# Statistics configuration - defines which columns to include in task counts
# This helps track progress and generate reports
statsConfig:
  # List of column IDs to include in statistics
  # Typically excludes archive or backlog columns
  columns:
    - todo
    - in-progress
    - review
    - done
---

# Product Development Board

This board tracks all features, bugs, and improvements for our product.

## Project Context

We're building a modern web application with:
- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + PostgreSQL
- **Infrastructure**: AWS + Docker + Kubernetes

## Team

- **Alice** - Frontend Lead
- **Bob** - DevOps Engineer
- **Carol** - Backend Lead

## Links

- [Production](https://app.example.com)
- [Staging](https://staging.example.com)
- [Documentation](https://docs.example.com)
