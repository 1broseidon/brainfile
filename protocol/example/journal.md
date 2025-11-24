---
# Type discriminator - identifies this as a journal brainfile
type: journal

# Schema URL for validation - points to journal-specific schema
schema: https://brainfile.md/v1/journal.json

# Title of the journal
title: Dev Log 2025

# Protocol version this file conforms to
protocolVersion: 0.5.0

# Instructions for AI agents interacting with this journal
agent:
  instructions:
    # Journals are chronological - newest entries go at the top
    - Append new entries at the top
    # Use consistent date format for entry IDs (YYYY-MM-DD)
    - Use ISO date format (YYYY-MM-DD) for entry IDs
    # Keep entries in reverse chronological order (newest first)
    - Preserve chronological order (newest first)
    # Each entry should have a one-line summary
    - Include summary for each entry
  # Additional context for AI to understand the journal's purpose
  llmNotes: This is a daily developer journal for tracking work progress and decisions

# Rules specific to this journal
rules:
  # Required practices for journal maintenance
  always:
    - id: 1
      rule: add entry for each work session
    - id: 2
      rule: include what was accomplished and what's blocked
  # Preferred style guidelines
  prefer:
    - id: 1
      rule: brief summaries over lengthy descriptions
# Journal entries - chronological log of work sessions
# Entries are ordered newest-first for easy reading
entries:
  # Each entry represents one work session or day
  - id: "2025-11-24"
    # Optional title - includes date for clarity
    title: "2025-11-24 - Schema Evolution Planning"
    # When this entry was created (start of work session)
    createdAt: "2025-11-24T10:30:00Z"
    # When this entry was last updated (supports editing)
    updatedAt: "2025-11-24T16:45:00Z"
    # Tags for categorizing and filtering entries
    tags:
      - planning
      - schema-evolution
      - brainfile
    # Mood tracking (optional): productive, neutral, frustrated, energized, blocked
    mood: productive
    # One-line summary - quick overview of the work session
    summary: "Designed base schema architecture and created comprehensive roadmap for multi-type support"
    # Main content - detailed notes in markdown format
    content: |
      ## What I Worked On

      Today was a major planning day for the Brainfile schema evolution project:

      - ✅ Created complete roadmap document (SCHEMA_EVOLUTION_ROADMAP.md)
      - ✅ Designed base schema architecture with type discriminator
      - ✅ Implemented v1/base.json, v1/board.json, and v1/journal.json
      - ✅ Updated v1.json with optional type field for backward compatibility
      - ✅ Created example files for all types

      ## Key Decisions

      **Type System Architecture**
      - Chose polymorphic schema approach with base + type-specific schemas
      - Type field optional initially (defaults to board) for backward compatibility
      - Used JSON Schema `allOf` pattern for extension

      **Timeline**
      - Phase 0: 2 weeks (foundation & planning)
      - Phase 1-5: 6-9 months total
      - No breaking changes until v1.0.0

      ## Blockers

      None today! Everything went smoothly.

      ## Tomorrow

      - Start implementing type inference in core library
      - Create comprehensive test suite for schema validation
      - Begin documentation updates

      ## Notes

      The analysis session that led to this was incredibly valuable. Having an unbiased
      exploration of the schema evolution helped identify gaps we hadn't considered.
    # Links to related tasks or issues (optional)
    # Useful for cross-referencing between journal and board
    relatedTasks:
      - task-31
      - task-32
      - task-37
  - id: "2025-11-23"
    title: "2025-11-23 - VSCode Extension Bug Fixes"
    createdAt: "2025-11-23T09:00:00Z"
    updatedAt: "2025-11-23T17:30:00Z"
    tags:
      - bug-fix
      - vscode
      - drag-drop
    mood: energized
    summary: "Fixed cross-column drag-and-drop persistence bug in VSCode extension"
    content: |
      ## What I Worked On

      Spent the day debugging the drag-and-drop issue:

      - 🐛 Fixed cross-column drag not persisting after drop
      - ✅ Added debug logging to trace event flow
      - ✅ Verified boardOperations.moveTask handles cross-column moves
      - ✅ Confirmed file writes and board refreshes work correctly

      ## Technical Details

      The issue was in Column.vue's handleEnd() method. The Sortable.js event
      data wasn't being extracted correctly for cross-column moves. Fixed by:

      ```typescript
      const fromColumnId = event.from.dataset.columnId;
      const toColumnId = event.to.dataset.columnId;
      ```

      ## Testing

      - ✅ Within-column reordering works
      - ✅ Cross-column drag persists correctly
      - ✅ Multiple rapid moves don't cause conflicts
      - ✅ Undo/redo works as expected

      ## Tomorrow

      - Start Phase 0 planning
      - Design base schema architecture
    relatedTasks:
      - task-28
  - id: "2025-11-22"
    title: "2025-11-22 - AI Agent Integration Research"
    createdAt: "2025-11-22T10:00:00Z"
    updatedAt: "2025-11-22T15:20:00Z"
    tags:
      - research
      - ai-integration
      - vscode
    mood: neutral
    summary: "Researched AI agent extension APIs for GitHub Copilot, Claude Code, and Cursor"
    content: |
      ## What I Worked On

      Deep dive into AI agent integration:

      - 📚 Researched GitHub Copilot's workbench.action.chat.open command
      - 📚 Tested Claude Code's editor integration
      - 📚 Investigated Cursor's command APIs
      - ⚠️ Discovered limitations with Cline/Roo/Kilo temp document approach

      ## Findings

      **Tier 1 Agents (Reliable)**
      - GitHub Copilot: Native chat API works great
      - Claude Code: focusInput with paste is clean

      **Tier 2 Agents (Needs Work)**
      - Cline/Roo/Kilo: Temp documents cause save dialogs (poor UX)
      - Cursor: Need more research on command APIs

      ## Decisions

      Focusing on Tier 1 agents initially. Will defer Tier 2 until we find
      better integration patterns.

      ## Tomorrow

      - Implement manifest-driven provider system
      - Create registry for agent detection
    relatedTasks:
      - task-24
  - id: "2025-11-21"
    title: "2025-11-21 - Rules and Archive UI Unification"
    createdAt: "2025-11-21T09:30:00Z"
    updatedAt: "2025-11-21T16:00:00Z"
    tags:
      - ui
      - ux
      - vscode
      - design
    mood: productive
    summary: "Unified Rules and Archive tabs with main Tasks view styling"
    content: |
      ## What I Worked On

      UI consistency pass:

      - 🎨 Unified Rules tab layout with Tasks view
      - 🎨 Unified Archive tab layout with Tasks view
      - ✅ Added distinct affordances for non-task lists
      - ✅ Improved empty states
      - ✅ QA pass for accessibility

      ## Design Decisions

      - Same card structure but different interaction affordances
      - Clear labeling to distinguish from task lists
      - Maintained true black dark mode aesthetic

      ## User Feedback

      Early testers love the consistency. The extension feels more polished now.

      ## Tomorrow

      - Research AI agent integration APIs
    relatedTasks:
      - task-30
  - id: "2025-11-20"
    title: "2025-11-20 - Linter Integration"
    createdAt: "2025-11-20T08:00:00Z"
    updatedAt: "2025-11-20T17:45:00Z"
    tags:
      - feature
      - vscode
      - linter
    mood: frustrated
    summary: "Integrated BrainfileLinter into VSCode error page with preview and auto-fix"
    content: |
      ## What I Worked On

      Major feature addition:

      - ✅ Imported BrainfileLinter from @brainfile/core
      - ✅ Added "Fix Issues" button to error page
      - ✅ Implemented preview functionality (diff editor)
      - ✅ Added auto-fix capability
      - ✅ Updated to core@0.3.0

      ## Challenges

      Spent 3 hours debugging the diff editor. The API was confusing and poorly
      documented. Eventually got it working but it was frustrating.

      ## Benefits

      Users can now:
      - See detailed lint diagnostics with line numbers
      - Preview fixes before applying
      - Auto-fix common YAML errors with one click

      ## Tomorrow

      - Work on Rules/Archive UI unification
    relatedTasks:
      - task-10
---

# Dev Log 2025

This journal tracks daily progress, decisions, and learnings from the Brainfile development project.

## Purpose

- **Daily Standup Notes**: What I worked on, what's blocked, what's next
- **Decision Log**: Important architectural and design decisions
- **Learning Journal**: Technical insights and lessons learned
- **Mood Tracking**: Reflection on productivity and challenges

## Related Boards

- [Main Development Board](./board.md)
- [VSCode Extension Board](../vscode/brainfile.md)
