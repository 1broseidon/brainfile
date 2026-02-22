# Epic-5 A2A Messaging Protocol Review

Date: 2026-02-22
Scope: deliverables from tasks 102–106
Reviewed files:
- `types.ts`
- `events.ts`
- `listener.ts`
- `messaging.ts`
- `worker.ts`
- `tools.ts`

---

## Summary Verdict

**PASS WITH NOTES**

The implementation is coherent and mostly robust: backward compatibility is preserved, event tailing/watcher behavior is significantly improved, worker load reporting is integrated, and conversational messaging works end-to-end.

However, there are **two correctness issues** worth fixing before broad rollout:
1. PM-side address matching can over-match worker-targeted messages in certain model/assignee combinations.
2. `message.decision` is accepted as a conversational kind but is not included in orchestration batching, so it can be silently non-visible to the receiving agent UI.

No blocker was found that would prevent controlled usage in current PM↔worker flows.

---

## Per-file Findings

## 1) `types.ts`

### ✅ Good
- `Envelope` is a proper backward-compatible superset of `PiEventRecord`.
- `normalizeEnvelope()` gracefully fills required legacy fields (`id`, `at`, `source`) when missing.
- Legacy mapping is correct and explicit:
  - `messageId <- id`
  - `kind <- type`
  - `from <- actorMode`
- New kinds (`message.*`, `worker.ready`, `worker.busy`) are represented and type-checked.

### ⚠️ Notes
- `priority` is intentionally permissive (`... | string`), which is practical but weakens strict typing.

---

## 2) `events.ts`

### ✅ Good
- Byte-offset tailing (`lastByteOffset`) is implemented correctly and handles:
  - append-only incremental reads,
  - truncation (`size < lastByteOffset`),
  - coalesced writes,
  - partial line handling.
- Conversational message collection + single-batch UI delivery per cycle is implemented.
- Auto-ack behavior is present and avoids ack loops (`kind !== message.ack`).
- Dedup (`seenMessageIds`) uses ephemeral in-memory TTL + size cap (5 min / 1000) and does not persist.

### ⚠️ Issues
1. **Addressing over-match risk in PM mode**
   - `isEnvelopeAddressedToSession()` falls back to PM “identity” derived from `getEffectiveListenerAssignee(...)` and uses `assigneeMatches(...)`.
   - Because `assigneeMatches` supports bare-family wildcard matching (`codex` ↔ `codex-1`), PM sessions can accidentally treat worker-targeted messages as addressed to PM in some setups.

2. **`message.decision` not surfaced in batch notifications**
   - `isConversationalMessageKind` includes `message.decision`, but `ORCHESTRATION_BATCH_KINDS` excludes it.
   - Result: decision messages can be parsed and processed but not shown in the orchestration batch notification.

### Suggested fix
- PM address matching: in PM mode, only accept `to` of `pm`/`main` (and maybe explicit PM identity), not worker assignee wildcards.
- Add `message.decision` to `ORCHESTRATION_BATCH_KINDS` (or intentionally document why excluded).

---

## 3) `listener.ts`

### ✅ Good
- `fs.watch` is now primary trigger; 30s interval fallback retained for unreliable FS environments.
- `stopListener()` correctly closes watcher and interval.
- Integration with `session_shutdown` cleanup path (via `stopListener`) is correct.
- Manual/interval/watch source handling is sensible.

### ⚠️ Notes
- `getContractStatus` import appears unused (minor dead code / cleanup opportunity).

---

## 4) `messaging.ts`

### ✅ Good
- `emitMessage()` centralizes envelope/message semantics cleanly.
- Thread defaults are sensible (`task:<taskId>` fallback).
- Sender/recipient normalization is consistent with assignee normalization.
- `sendOrchestrationMessage()` tick-level race guard remains sound.

### ⚠️ Notes
- No major correctness issues found.

---

## 5) `worker.ts`

### ✅ Good
- `worker.ready` emission is integrated with heartbeat and startup.
- `getWorkerAvailabilitySnapshot()` is backward-compatible:
  - falls back to `maxConcurrency=1` + task counting when readiness absent,
  - uses readiness fields when available.
- Load formatting (`formatWorkerLoad`) is coherent and used by listener/status messaging.

### ⚠️ Notes
- Readiness freshness is currently tied to presence freshness (reasonable), but there is no independent readiness staleness policy.

---

## 6) `tools.ts`

### ✅ Good
- `brainfile_send_message` tool is properly registered and validated.
- Allowed kinds align with conversational kinds.
- Tool passes through `threadId` and `inReplyTo` correctly.
- Integrates with `emitMessage()` and event pipeline cleanly.

### ⚠️ Notes
- No blocking tool-level issues found in messaging path.

---

## Integration Findings (Cross-file)

### ✅ Coherent integrations
- `types.ts` envelope model is consumed consistently by `events.ts` and `messaging.ts`.
- `worker.ready` type + projection + snapshot usage is consistent across `types.ts`, `events.ts`, and `worker.ts`.
- Listener lifecycle cleanup (`listener.ts`) and shutdown wiring behave coherently.

### ⚠️ Cross-file risks
1. **Routing ambiguity** (`events.ts` + `worker.ts` assignee matching semantics): PM-mode fallback address matching can collide with worker assignee wildcards.
2. **Conversational kind mismatch** (`messaging.ts` vs `events.ts`): `message.decision` is considered conversational for sending/validation but omitted from batch display.

---

## Dead Code / Unused Introductions

- `listener.ts`: imported `getContractStatus` appears unused.

---

## Final Recommendation

**PASS WITH NOTES**

Ship for controlled use, then apply a small follow-up patch:
1. Tighten PM-side recipient matching in `isEnvelopeAddressedToSession()`.
2. Include `message.decision` in orchestration batching (or explicitly document exclusion).
3. Remove unused import in `listener.ts`.
