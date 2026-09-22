---
id: spec-3
type: task
title: "First-class plans: document type, linkage, and verbs"
tags:
  - product
  - plans
  - core
createdAt: "2026-08-12T01:20:44.549Z"
completedAt: "2026-08-12T02:39:39.743Z"
---

## Description
Promote .brainfile/plans/ from informal agent convention to a first-class document type. The flexible types system nearly covers it already (types: {plan: {idPrefix: plan}}); what's missing: (1) canonical location + naming (plans/ dir vs board/ with type=plan), (2) IDs (plan-N) and frontmatter schema (title, status, related tasks — parentId links any-to-any today), (3) CLI/MCP verbs: plan add/list/show/link, (4) agents discovering plans relevant to a task (task -> plan backlink), (5) search across plan bodies. Design constraint: build on the V2 file-mutation core layer (spec-2 Phase 2) so all frontends see plans identically.

## Log
- 2026-08-12T02:39:39.743Z: [reconstructed] Archived body lost to migrate --logs-to-ledger (destructive pre-fix); frontmatter and description restored from ledger record.
