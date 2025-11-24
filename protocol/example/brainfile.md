---
# LEGACY EXAMPLE: This file demonstrates backward compatibility
# Notice: NO "type" field - older brainfiles work without explicit type
# The system will infer type: board based on presence of "columns" field

# Title of the board (required)
title: Example Project Board

# Schema URL pointing to legacy v1 schema (before type-specific schemas)
schema: https://brainfile.md/v1

# Agent instructions - how AI should interact with this board
agent:
  instructions:
    - This is an example board demonstrating Brainfile features
    - Shows various task metadata fields (priority, assignee, tags)
    - Demonstrates multi-column workflow
# Statistics configuration - columns to include in counts
statsConfig:
  columns:
    - todo
    - in-progress
    - review
    - done

# Rules system - guidelines for working with this board
rules:
  # Rules that must always be followed
  always:
    - id: 1
      rule: write tests for all new features
    - id: 2
      rule: update documentation when changing APIs
    - id: 3
      rule: run linter before committing code
  # Rules that must never be violated
  never:
    - id: 1
      rule: deploy without running tests
    - id: 2
      rule: commit directly to main branch
  # Preferred practices (flexible guidelines)
  prefer:
    - id: 1
      rule: functional components over class components
    - id: 2
      rule: TypeScript over JavaScript for new files
    - id: 3
      rule: descriptive variable names over comments

# Columns define the workflow stages
# Legacy format - identical to new typed format
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Implement user authentication
        description: Add JWT-based authentication system with refresh tokens
        priority: critical
        assignee: alice
        tags:
          - backend
          - security
          - auth
      - id: task-2
        title: Design dashboard UI
        description: Create responsive dashboard layout with charts and widgets
        priority: high
        assignee: bob
        tags:
          - frontend
          - ui
          - design
      - id: task-3
        title: Write API documentation
        description: Document all REST endpoints with examples
        priority: medium
        assignee: charlie
        tags:
          - docs
          - api
  - id: in-progress
    title: In Progress
    tasks:
      - id: task-4
        title: Database Schema Design
        description: |-
          * Define tables and relationships
          * Document constraints
          * Create migration scripts
        priority: high
        assignee: david
        tags:
          - backend
          - database
      - id: task-5
        title: Optimize image loading
        description: Implement lazy loading for gallery images
        priority: medium
        assignee: bob
        tags:
          - frontend
          - performance
          - optimization
  - id: review
    title: Review
    tasks:
      - id: task-6
        title: Refactor user service
        description: Clean up user service code and improve error handling
        priority: low
        assignee: alice
        tags:
          - backend
          - refactoring
      - id: task-7
        title: Update dependencies
        description: Upgrade all npm packages to latest stable versions
        priority: low
        assignee: charlie
        tags:
          - maintenance
          - dependencies
  - id: done
    title: Done
    tasks:
      - id: task-8
        title: Project Setup
        description: Initialize repository and configure development environment
        priority: high
        tags:
          - setup
          - devops
      - id: task-9
        title: CI Pipeline
        description: Set up continuous integration workflow with GitHub Actions
        priority: high
        assignee: david
        tags:
          - devops
          - ci-cd
          - automation
      - id: task-10
        title: Implement dark mode
        description: Add dark theme support with system preference detection
        priority: medium
        assignee: bob
        tags:
          - frontend
          - ui
          - theme
---
