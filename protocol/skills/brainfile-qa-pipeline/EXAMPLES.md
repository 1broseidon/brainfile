# Brainfile QA Pipeline Examples

## Example 1: Full PASS

**Scenario:** Task delivered with clear scope and proportional changes.

1. `brainfile contract validate -t task-101` → PASS
2. Pragmatist: PASS (no over-engineering)
3. Karen: PASS (all acceptance criteria met)
4. Mark both subtasks complete
5. Complete task

---

## Example 2: Build PASS, QA FAIL (tone mismatch)

**Scenario:** Landing page redesign requested to be docs-native and non-marketing.

1. `brainfile contract validate -t task-202` → PASS (`npm run build` succeeds)
2. Pragmatist: **FAIL**
   - Found unnecessary runtime canvas animation
   - Found heavy custom CSS and extra interaction complexity
3. Karen: **FAIL**
   - Acceptance criterion “simple, docs-native design” not fully met
4. Mark both subtasks incomplete
5. Hand back with exact rework instructions:
   - remove runtime animation script
   - simplify hero/section structure
   - reduce custom CSS surface

---

## Example 3: Pragmatist FAIL, Karen PASS (still rework)

**Scenario:** Functionally correct implementation, but much too complex.

1. Validation commands pass
2. Pragmatist: FAIL (over-abstraction)
3. Karen: PASS (meets spec functionally)
4. Final verdict: FAIL (rework required)

Reason: complexity risk can still block acceptance even with functional correctness.
