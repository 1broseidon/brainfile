---
id: task-1
type: task
title: Implement rate limiting
column: in-progress
priority: high
effort: medium
assignee: codex
tags: [backend, api]
relatedFiles:
  - src/api/gateway.ts
  - src/middleware/rateLimit.ts
subtasks:
  - id: sub-1
    title: Add token bucket implementation
    completed: true
  - id: sub-2
    title: Add unit tests
    completed: false
contract:
  status: in_progress
  version: 1
  deliverables:
    - type: file
      path: src/rateLimiter.ts
      description: Token bucket rate limiter
    - type: test
      path: src/__tests__/rateLimiter.test.ts
      description: Unit tests for limiter behavior
  validation:
    commands:
      - npm test -- rateLimiter
      - npm run build
  constraints:
    - Use token bucket algorithm
    - Keep implementation non-blocking (async)
  outOfScope:
    - UI for rate limit settings
---

## Context

We need to protect upstream providers from bursty traffic and avoid quota exhaustion.

## Notes

- Prefer per-provider buckets
- Include clear error messages when rejecting requests
