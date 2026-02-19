---
id: task-2
type: task
title: Add CI validation for brainfile
priority: medium
tags: [ci, tooling]
completedAt: "2026-02-01T12:00:00Z"
contract:
  status: done
  version: 1
  deliverables:
    - type: file
      path: .github/workflows/validate.yml
      description: CI workflow that runs brainfile lint and tests
  validation:
    commands:
      - npx @brainfile/cli lint --check
  metrics:
    pickedUpAt: "2026-02-01T10:00:00Z"
    deliveredAt: "2026-02-01T11:00:00Z"
    validatedAt: "2026-02-01T12:00:00Z"
    duration: 3600
    reworkCount: 0
---

Completed and validated.
