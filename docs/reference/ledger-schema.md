---
title: Ledger Schema Reference
description: Formal field reference for a single Brainfile ledger JSONL record
---

# Ledger Schema Reference

The ledger record schema defines a single completion entry in `.brainfile/logs/ledger.jsonl`.

**Source of Truth**: [ledger-record.json](https://brainfile.md/v2/ledger-record.json)

## Record Shape

| Field | Type | Required | Source | Description |
|-------|------|----------|--------|-------------|
| `id` | `string` | Yes | Task frontmatter (`id`) | The unique identifier of the completed item (e.g., `task-1`, `epic-2`, `adr-3`). |
| `type` | `string` | Yes | Task frontmatter (`type`) | The item type. Supported values: `task`, `epic`, `adr`. |
| `title` | `string` | Yes | Task frontmatter (`title`) | The title of the item at the time of completion. |
| `columnHistory` | `Array<string>` | No | Task lifecycle tracking | An ordered list of workflow columns visited before completion. |
| `assignee` | `string` | No | Task frontmatter (`assignee`) | The final assignee assigned to the task upon completion. |
| `priority` | `string` | No | Task frontmatter (`priority`) | The priority level at completion. Supported values: `low`, `medium`, `high`, `critical`. |
| `tags` | `Array<string>` | No | Task frontmatter (`tags`) | A list of tags used for categorization and filtering. |
| `parentId` | `string` | No | Task frontmatter (`parentId`) | The ID of the parent item, if applicable. |
| `relatedFiles` | `Array<string>` | No | Task frontmatter (`relatedFiles`) | The list of files declared as context in the task metadata. |
| `filesChanged` | `Array<string>` | Yes | Completion runtime | The list of file paths created or modified during the task. |
| `deliverables` | `Array<string>` | No | Contract (`contract.deliverables[].path`) | The paths of deliverables defined in the contract. |
| `contractStatus` | `string` | No | Contract (`contract.status`) | The final status of the contract upon completion. |
| `validationAttempts` | `integer` | No | Contract validation runtime | The total number of validation attempts made before the task was completed. |
| `constraints` | `Array<string>` | No | Contract (`contract.constraints`) | The implementation constraints copied from the contract. |
| `createdAt` | `string` (`date-time`) | Yes | Task metadata (`createdAt`) | The ISO 8601 timestamp indicating when the task was created. |
| `completedAt` | `string` (`date-time`) | Yes | Completion runtime | The ISO 8601 timestamp indicating when the task was completed. |
| `cycleTimeHours` | `number` | Yes | Computed at completion | The total time elapsed between `createdAt` and `completedAt`, measured in hours. |
| `summary` | `string` | Yes | Agent completion summary | A brief retrospective summary of the work performed. |
| `subtasksCompleted` | `integer` | No | Task subtask snapshot | The number of subtasks completed at the time of finalization. |
| `subtasksTotal` | `integer` | No | Task subtask snapshot | The total number of subtasks defined at the time of completion. |

## Notes

- The schema validates one JSON object per line, not the entire JSONL file as an array.
- Records are append-only: new completions add lines, and existing lines are not rewritten.
- `createdAt` and `completedAt` use ISO 8601 date-time format (`YYYY-MM-DDTHH:mm:ssZ`).
