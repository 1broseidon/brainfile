---
id: adr-1
type: adr
title: Use token bucket for rate limiting
column: review
tags: [architecture, backend]
status: accepted
---

## Decision

Use a token bucket algorithm per provider.

## Rationale

- Allows bursts while enforcing an average rate
- Simple to reason about and test

## Consequences

- Requires tracking bucket state per provider key
- Needs careful clock/timer handling to avoid drift
