---
name: Brainfile QA Pipeline
description: Run post-delivery QA using pragmatist (complexity) and karen (spec/reality) reviews, then toggle validation subtasks and report pass/fail with concrete rework feedback.
dependencies: brainfile (installed via npm)
---

# Brainfile QA Pipeline Skill

## Overview

Use this skill when a task is **delivered** and you need to run the full QA pipeline before completion.

Pipeline order:
1. **Contract validation** (automated checks)
2. **Pragmatist review** (complexity / over-engineering)
3. **Karen review** (spec compliance / reality check)
4. **Subtask updates** (`@pragmatist`, `@karen`)
5. **Final verdict** (pass or rework)

This skill is for **review + coordination**, not implementation.

---

## When to Use

Invoke this skill when:
- a contract has status `delivered`
- user asks for “run QA”, “run pragmatist + karen”, or “validate delivery”
- you need a reusable decision framework for pass/fail and rework feedback

---

## QA Workflow

### 1) Load task context

```bash
brainfile show -t <task-id>
```

Confirm:
- scope from task `description`
- deliverables
- validation commands
- constraints
- QA subtasks present (`@pragmatist`, `@karen`)

### 2) Run automated contract validation

```bash
brainfile contract validate -t <task-id>
```

Capture pass/fail of each command.

### 3) Pragmatist review (complexity fit)

Assess whether solution complexity matches problem complexity.

Fail examples:
- heavy abstractions for simple docs/code changes
- runtime animation or custom interaction where static docs suffice
- large styling/architecture surface added for small tone changes

### 4) Karen review (spec + reality)

Assess whether implementation actually matches acceptance criteria.

Fail examples:
- acceptance criteria not fully satisfied (even if build passes)
- remaining behavior/tone contradictions vs requested outcome
- required files updated but final UX still misses objective

### 5) Update task logs and subtasks

Append findings with explicit agent attribution:

```bash
brainfile note -t <task-id> --agent "@brainfile-pragmatist" "..."
brainfile note -t <task-id> --agent "@brainfile-karen" "..."
```

Then set subtasks:
- PASS: mark the corresponding subtask complete
- FAIL: ensure corresponding subtask is incomplete

### 6) Final decision

- If both pass: task can be completed
- If either fails: provide exact, file-level rework instructions and hand back to implementer

---

## Output Format

Use this response shape:

```md
## Task: <task-id>
**Automated validation**: PASS | FAIL
**Pragmatist**: PASS | FAIL
**Karen**: PASS | FAIL

### Findings
- ...

### Subtask status
- @pragmatist: complete | incomplete
- @karen: complete | incomplete

### Verdict
PASS (ready to complete) | FAIL (rework required)
```

For FAIL, include:
- exact files
- concrete changes
- what to remove, what to keep

---

## Pass/Fail Rubric

### PASS when
- validation commands pass
- complexity is proportionate to scope
- acceptance criteria are fully met in real UX/behavior
- no major contradiction with requested tone/positioning

### FAIL when
- validation fails, or
- complexity is over-engineered for requested scope, or
- acceptance criteria are partially met only

---

## Notes

- Automated validation passing does **not** guarantee Karen PASS.
- Prefer explicit, minimal rework requests over vague “improve quality” guidance.
- Keep protocol semantics accurate (board/logs/contracts/types/rules).
