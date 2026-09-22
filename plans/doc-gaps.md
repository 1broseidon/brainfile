# Task-135: Code Review + Documentation Gap Analysis

Date: 2026-03-03
Reviewer: Karen (QA)

## Scope

Code reviewed:
- `cli/src/commands/pipeline.ts`
- `cli/src/commands/complete.ts`
- `cli/src/lib/agentsConfig.ts`
- `cli/src/lib/contractRunner.ts`

Docs compared:
- `protocol/docs/reference/commands.md`
- `protocol/docs/guides/orchestration.md`
- `protocol/docs/guides/contracts.md`
- `protocol/docs/agents/integration.md`
- `protocol/docs/cli/commands.md`
- `protocol/docs/types/contract.md`
- `protocol/docs/reference/types.md`

## Code Review Findings

### 1) High: `maxRetries` accounting is inconsistent and can under-allow retries

Evidence:
- `cli/src/lib/contractRunner.ts:203-205` increments `metrics.reworkCount` during validation auto-retry decision.
- `cli/src/lib/contractRunner.ts:224-227` increments `metrics.reworkCount` again on `pickup`.

Impact:
- Rework count can be incremented twice in one rework loop (once on failed validation, once on next pickup).
- With `maxRetries > 1`, retries can be exhausted earlier than expected.

Missing tests:
- `cli/src/__tests__/contract.test.ts` has retry coverage for `maxRetries: 1`, but no scenario validating `maxRetries > 1` across repeated pickup/validate loops.

### 2) High: failed validation without retry does not reliably persist actionable feedback

Evidence:
- `cli/src/lib/contractRunner.ts:206` sets `contract.feedback` only in the auto-retry branch.
- `cli/src/lib/contractRunner.ts:216` returns `failed` without setting feedback when retry is not available.

Impact:
- Final failed contracts can end without updated failure guidance in `contract.feedback`.
- This conflicts with docs claiming failed validation output is captured as feedback.

Doc contradiction:
- `protocol/docs/cli/contract-commands.md:74`
- `protocol/docs/guides/contracts.md:66`

Missing tests:
- No test asserting feedback is written on failure when `autoRetried` is false.

### 3) Medium: auto-dispatch misses tasks unblocked by parent auto-completion

Evidence:
- `cli/src/commands/complete.ts:515-517` runs `autoCompleteParentChain(...)` then dispatches based only on original `taskId`.
- `cli/src/commands/complete.ts:328-330` only selects tasks whose `blockedBy` includes that original completed task ID.

Impact:
- If completing child `task-X` auto-completes parent `epic-Y`, tasks blocked by `epic-Y` are not auto-dispatched in this completion cycle.

Missing tests:
- No test covers `child completion -> parent auto-completion -> dependent task dispatch`.

### 4) Medium: detached auto-dispatch reports optimistic success with weak validation

Evidence:
- `cli/src/commands/pipeline.ts:247-255` marks task as dispatched immediately after `spawn`, without verifying dispatch command outcome.
- `cli/src/commands/complete.ts:362-371` same detached spawn pattern.

Impact:
- Runtime failures in spawned `dispatch` (bad assignee config, contract state mismatch, dispatch runtime errors) are not reflected in command result.
- User sees “dispatched” logging without actual successful dispatch.

Missing tests:
- No test simulates detached dispatch child exiting non-zero.
- No test covers assignee present but missing matching agent config.

### 5) Medium: agent config presence checks are too shallow and can fail late

Evidence:
- `cli/src/lib/agentsConfig.ts:349-358` (`hasAgentConfigs`) only checks for `.md` filenames, not parse-valid configs.
- `cli/src/lib/agentsConfig.ts:292-294` silently skips invalid agent files.
- `cli/src/lib/agentsConfig.ts:385-388` prioritizes `agents/` dir over `agents.yaml` even if resulting set is empty.

Impact:
- System can pass early “agent config exists” checks and fail later during dispatch resolution.
- Error surfaces late and is harder to diagnose.

Missing tests:
- No test for `agents/` exists but all files invalid.
- No test for fallback behavior when `agents/` exists but produces zero valid agents.

### Type-Safety Gaps

- `cli/src/commands/complete.ts:332` uses `(task.contract as any).status` where a typed contract guard should be used.
- `cli/src/lib/agentsConfig.ts:189,220,268,292` uses `any` in error handling paths (`catch (e: any)`), losing type safety and narrowing.

## Documentation Gap Analysis

## `protocol/docs/reference/commands.md`

Current gaps:
- Command table omits `pipeline` and `dispatch` (`protocol/docs/reference/commands.md:31-58`).
- No dedicated `## pipeline` or `## dispatch` sections (headings jump from existing commands to `hooks`, `complete`, `contract`, etc.; see `365+`).
- `complete` docs omit options implemented in CLI:
  - `--summary`, `--files-changed`, `--auto-files` (`cli/src/cli.ts:345-352`)
  - parent auto-completion behavior (`cli/src/commands/complete.ts:253-319`)
  - auto-dispatch of newly unblocked tasks (`cli/src/commands/complete.ts:339-374`)
- `contract validate` docs omit `--retry` and auto-retry behavior (`cli/src/cli.ts:594`, `cli/src/commands/contract.ts:181-199`).

Required updates:
- Add `pipeline` section with `linear`, `fan-out`, `fan-in` syntax and options (`cli/src/cli.ts:251-293`).
- Add `dispatch` section with `list`, `cancel`, `tail`, `auto` subcommands (`cli/src/cli.ts:625-666`).
- Expand `complete` and `contract validate` sections with actual runtime behavior and flags.

## `protocol/docs/guides/orchestration.md`

Current gaps:
- “Workflow” is high-level only; no concrete pipeline usage patterns (`linear`, `fan-out`, `fan-in`).
- No mention of auto-dispatch behaviors after pipeline creation or completion.
- Failure/rework section is manual-only (`protocol/docs/guides/orchestration.md:86-99`), missing auto-retry path (`maxRetries`, `--retry`).

Required updates:
- Add pipeline pattern playbook with command examples tied to `pipeline` subcommands.
- Add dispatch orchestration guidance (`dispatch auto`, `dispatch list`, `dispatch tail`).
- Add validation failure branches:
  - auto-retry branch (status back to `ready`, re-dispatch)
  - terminal failure branch (manual intervention).

## `protocol/docs/guides/contracts.md`

Current gaps:
- Key field list lacks `maxRetries` (`protocol/docs/guides/contracts.md:84-90`).
- Validation description implies failure always maps directly to `failed` (`66-67`), missing auto-retry state transition.
- Lifecycle table and PM flow do not describe retry attempt accounting and `--retry` behavior.

Required updates:
- Document `contract.maxRetries` semantics and retry lifecycle.
- Document `brainfile contract validate --retry` as ad-hoc override.
- Clarify when `feedback` is generated/updated and how retry attempts are counted.

## `protocol/docs/agents/integration.md`

Current gaps:
- Directory structure omits `.brainfile/agents/` and `_defaults.md` (`protocol/docs/agents/integration.md:176-187`).
- No schema/format doc for per-agent `.md` files used by CLI (`cli/src/lib/agentsConfig.ts:30-39`, `141-199`, `201-229`).
- No resolution precedence explanation (`agents/` > `agents.yaml` > builtin) despite implementation (`cli/src/lib/agentsConfig.ts:383-414`).

Required updates:
- Add `agents/` directory examples and `_defaults.md` behavior.
- Add per-agent frontmatter fields:
  - `command`, `args`, `transport`, `capabilities`, `sessionMode`, `model`, `permissionMode`, `timeoutSeconds`
- Add instruction-body behavior (markdown body injected as agent instructions).

## `protocol/docs/cli/commands.md`

Current gaps:
- Command table omits `pipeline` and `dispatch` (`protocol/docs/cli/commands.md:16-42`).
- No dedicated `## pipeline` and `## dispatch` sections.
- `contract` section is too thin for current CLI behavior (`462-472`), missing `validate --retry` and attach command details.

Required updates:
- Add full `pipeline` command section (all three subcommands and flags).
- Add full `dispatch` command section (`dispatch`, `list`, `cancel`, `tail`, `auto`).
- Expand `contract` section with current subcommand options and retry semantics.

## `protocol/docs/types/contract.md`

Current gaps:
- `maxRetries` field is missing.
- `feedback` is documented (`139-143`), but retry-related behavior is not documented.
- Metrics section does not explain retry accounting behavior relative to pickup/validation paths.

Required updates:
- Add `maxRetries` field definition and examples.
- Add explicit retry flow example showing `delivered -> ready` auto-retry transition.
- Clarify `feedback` population semantics on validation failures.

## `protocol/docs/reference/types.md`

Current gaps:
- Task docs lack explicit `blockedBy` field coverage (present in schema: `protocol/v2/task.json:53-60`).
- Contract snippet omits retry-related fields (e.g., `maxRetries`) and feedback usage examples.

Required updates:
- Add `blockedBy` to task field docs with dependency semantics.
- Expand contract snippet to include `maxRetries` and `feedback` usage.

## Recommended Documentation Patch Order

1. `protocol/docs/cli/commands.md` and `protocol/docs/reference/commands.md` (biggest command discoverability gaps).
2. `protocol/docs/guides/orchestration.md` and `protocol/docs/guides/contracts.md` (workflow semantics, retries, dispatch behavior).
3. `protocol/docs/agents/integration.md` (agent config format and directory structure).
4. `protocol/docs/types/contract.md` and `protocol/docs/reference/types.md` (schema-level field parity).
