# Research: Agentic Orchestration Patterns

Generated: 2026-03-04
Related tasks: brainfile supervisor pipeline design

## Question

What are the common, realistic, and useful agentic orchestration patterns being used in production or discussed as best practices in the AI agent ecosystem? Specifically: framework primitives, pipeline patterns, agent communication, decomposition, validation/review, and what's painful/missing. Focus on what maps well to a file-based task board (markdown + YAML frontmatter, declarative agents, orchestration derived from task relationships).

---

## 1. Core Orchestration Patterns

Five patterns are widely agreed upon across Azure Architecture Center, Google ADK, LangGraph, CrewAI, AutoGen, and OpenAI. These are canonical as of early 2026.

---

### 1.1 Sequential (Pipeline / Prompt Chaining)

**How it works:** Agents execute in a fixed linear order. Each agent's output becomes the next agent's input via shared state or artifact file.

**AKA:** Pipeline, linear delegation, pipes-and-filters.

**Production use:** VERY COMMON. The baseline pattern. Used in document processing, draft-review-polish, code generation chains (generate → review → test → deploy), contract generation (template → customize → compliance → risk assessment).

**Frameworks:** LangGraph (graph edges), CrewAI (task dependencies), Azure Architecture Center (documented baseline), Google ADK (SequentialAgent with `output_key`).

**Primitives exposed:**
- Ordered task list with `depends_on`
- Shared state object or named artifact files
- Exit conditions on each stage

**Brainfile mapping:** Tasks with `dependsOn` fields. Topological sort of task graph gives execution order. Each task's deliverables become the next task's `relatedFiles`.

**Gotchas:**
- Early-stage failures cascade — garbage in, garbage amplified out
- Single bottleneck agent stalls everything downstream
- No partial parallelism even when stages are independent
- Always validate output before passing downstream

---

### 1.2 Concurrent (Fan-Out / Fan-In / Scatter-Gather)

**How it works:** Dispatcher sends same input to N agents simultaneously. Each agent works independently and writes to a unique state key. A collector/aggregator synthesizes results.

**AKA:** Parallel, scatter-gather, map-reduce, ensemble.

**Production use:** COMMON. Code review (security + style + performance agents in parallel), financial analysis (fundamental + technical + sentiment + ESG simultaneously), A/B evaluation, multi-perspective document analysis. Benchmarked 36% latency reduction vs. sequential.

**Frameworks:** LangGraph (parallel node branches), Google ADK (ParallelAgent), Azure AI (Concurrent Orchestration pattern), CrewAI (parallel task execution in flows).

**Aggregation strategies:**
- Voting/majority-rule for classification
- Weighted merging for scored recommendations
- LLM synthesizer agent for narrative reconciliation

**Key constraint:** Each parallel agent MUST write to a unique state key. Write conflicts on shared state are a common production bug.

**Brainfile mapping:** Tasks with the same parent and no mutual `dependsOn` can run concurrently. A collector task references all of them via `blockedBy`. Currently no explicit parallel dispatch — opportunity.

**Gotchas:**
- Resource costs multiply (model calls × agent count)
- Conflict resolution strategy must be defined upfront
- "Best of N" aggregation is expensive — only do it when diversity of perspective has clear value

---

### 1.3 Handoff / Router / Triage

**How it works:** A triage agent receives input, decides which specialist handles it, and transfers full control. Only one agent is active at a time. Full conversation history travels with the handoff.

**AKA:** Coordinator-dispatcher, classifier-router, conditional dispatch.

**Production use:** VERY COMMON. Customer support routing (billing vs. technical vs. account), intent-based dispatch, dynamic expert escalation.

**Frameworks:** OpenAI Swarm/Agents SDK (handoffs are the defining primitive — `transfer_to_XXX()` functions return Agent objects). LangGraph (conditional edges). Google ADK (LlmAgent with `sub_agents` + AutoFlow routing by description).

**OpenAI Swarm/Agents SDK primitives:**
- Agents expose transfer functions that return `Agent` objects
- System prompt swaps on handoff; conversation history persists
- Three primitives total: Agents, Handoffs, Guardrails

**Brainfile mapping:** An orchestrator reading task type/tags to choose `assignee`. In the supervisor pipeline, the routing agent picks which subagent contract to dispatch.

**Gotchas:**
- Router quality is critical — wrong routing wastes all downstream work
- Agent descriptions ARE the routing signal in LLM-based routers (treat them as API docs)
- Infinite handoff loops — set max handoff depth and explicit terminal states

---

### 1.4 Group Chat / Roundtable / Maker-Checker

**How it works:** Multiple agents participate in a shared conversation thread managed by a chat manager. Agents read all prior turns and respond in rotation. Thread is the accumulated shared state.

**AKA:** Roundtable, collaborative, council, multi-agent debate.

**Maker-Checker sub-pattern (most practically useful):**
- Maker agent produces output
- Checker agent evaluates against defined criteria
- Checker provides specific structured feedback if rejected
- Cycle repeats until pass or max iterations

**AKA for maker-checker:** Evaluator-optimizer, generator-verifier, critic loop, reflection loop.

**Production use:** COMMON for review patterns. AutoGen's defining feature. Used for document review, code critique, compliance validation.

**Frameworks:** AutoGen (group chat is its primary pattern), LangGraph (LoopAgent with `condition_key` and `exit_condition`), Azure AI (Group Chat Orchestration pattern), Google ADK (LoopAgent).

**Key constraints:**
- Limit to 2-3 agents. More agents = context explosion and termination difficulty
- Always set `max_iterations` — infinite critic loops are a real failure mode
- Agents in pure group chat tend toward sycophancy (agreeing with previous speakers)

**Brainfile mapping:** `@brainfile-pragmatist` + `@brainfile-karen` as sequential review stages after delivery. Contract `feedback` field is the structured rejection mechanism. `reworkCount` tracks loop iterations.

---

### 1.5 Dynamic / Magentic / Task-Ledger Orchestration

**How it works:** A manager agent dynamically builds and refines a task plan (a "ledger") as it discovers more. It invokes specialized agents, receives their reports, updates the plan, and iterates until the original goal is satisfied or stall is detected.

**AKA:** ReAct-style orchestration, Magentic-One pattern.

**Production use:** RARE in practice. Used for: open-ended incident response, research tasks with unknown scope. Most teams who attempt pure dynamic orchestration abandon it for cost/reliability reasons.

**Frameworks:** Microsoft Magentic-One (defining implementation), LangGraph (ReAct loop), some AutoGen patterns.

**Key difference from sequential:** Plan is NOT known upfront. It emerges from agent interactions. Agents report back before receiving next instruction.

**Brainfile mapping:** Orchestrator using `@brainfile-researcher` to inform planning, then creating tasks dynamically on the board. The task board IS the ledger.

**Gotchas:**
- Expensive and slow — genuinely unbounded cost
- Hard to test or predict behavior
- Only justified when solution path genuinely cannot be predetermined

---

## 2. Supporting Patterns (Used Within Core Patterns)

### 2.1 Human-in-the-Loop (HITL)

Three trigger models used in production:
1. **Mandatory gate:** Workflow pauses at fixed checkpoints before irreversible actions
2. **Risk-triggered:** Low confidence score or policy violation routes to human
3. **Escalation-on-failure:** After N failed retries, escalate to human

**Production prevalence:** 59.8% of production agents include human review. Required for: financial transactions, code deployments, irreversible side effects, regulatory compliance.

**LangGraph implementation (most mature):** `interrupt()` call suspends graph. State persisted to PostgresSaver. Resumes via `Command(resume=value)`. Conceptually identical to BizTalk dehydration/rehydration.

**Brainfile mapping:** Already implemented. `blocked` status = HITL trigger. Contract `delivered → validate → done/failed` is the HITL lifecycle. PM is the human-in-the-loop.

**Gotcha:** Human fatigue from too many gates kills adoption. Only gate decisions that genuinely require human judgment.

---

### 2.2 Planner-Worker Separation

Dedicated planning agent decomposes goal into task list. Worker agents execute individual tasks. Planner may be invoked once (static) or repeatedly (dynamic).

**Cost optimization (widely reported in production):** Use expensive model (Opus/o3) for planning; cheap fast model (Haiku/Sonnet) for execution workers. 90% cost reduction reported.

**Brainfile mapping:** Orchestrator (PM role) creates tasks on board; `@brainfile-implementer` picks up contracts. Natural separation already exists.

---

### 2.3 Two-Phase Commit (Plan → Validate → Execute)

Agent proposes actions as a structured plan. Deterministic policy checks validate the plan before execution. Produces auditable artifact before anything is written.

**Used for:** Any irreversible or high-risk action (file writes, API calls, deployments, schema changes).

**Brainfile mapping:** Contract `deliverables` = the plan. `brainfile contract validate` = policy check. Execution only happens after PM validation.

---

### 2.4 Circuit Breaker

Failing agents are automatically isolated to prevent cascade. Agent is temporarily removed from dispatch pool until remediation. Other agents route around it.

**Production use:** Common in enterprise deployments with SLA requirements.

**Brainfile mapping:** `assignee` reassignment when contract repeatedly fails. Could be `fallbackAssignee` field.

---

### 2.5 Model Cascade / Routing by Complexity

Route by task complexity: cheap/fast model for simple extraction/formatting, expensive model for reasoning/planning. Cascade on failure: if model A fails, retry with model B (more capable).

**Brainfile mapping:** Agent configs could specify model preferences. Supervisor could implement cascade logic.

---

## 3. Agent-to-Agent Communication Mechanisms

Four mechanisms are in common use. Real systems combine them.

| Mechanism | Description | Used By | Production Status |
|-----------|-------------|---------|------------------|
| **Shared mutable state** | All agents read/write a typed state object in memory | LangGraph, Google ADK | Most common; requires unique key namespacing per agent |
| **Artifact files / deliverables** | Agent writes output to a named file; next agent reads it | Brainfile, Roo Commander MDTM, Claude Code | Very practical; durable, versionable, inspectable |
| **Message bus / pub-sub** | Async event passing via Kafka/Redis/RabbitMQ | Enterprise production | Adds operational complexity; justified for long-running workflows |
| **Structured handoff object** | Typed payload (task ID, context, instructions) passed on transfer | OpenAI Agents SDK | Cleanest for explicit control transfer |

**Emerging cross-framework protocols (2025):**
- **A2A (Agent-to-Agent, Google):** Open protocol for cross-framework agent communication. HTTP POST + JSON task objects with lifecycle states (submitted → working → input-required → completed). April 2025.
- **MCP (Model Context Protocol, Anthropic):** Tool/resource access protocol. Agents expose capabilities as MCP servers. De facto standard for tool access.
- **ACP (Agent Communication Protocol, BeeAI/IBM):** DAG-encoded execution blueprints, streaming support, multi-modal messages. Used in brainfile supervisor.

**Key observation:** The most production-resilient pattern is artifact files + task IDs. State lives in a durable store (files/DB), agents communicate via task IDs, not in-memory objects. This is exactly what brainfile does — and it solves the #1 production pain point (state persistence across restarts) automatically.

---

## 4. Task Decomposition Patterns

### 4.1 Static (Decomposition-First)

PM/planner decomposes upfront into a fixed task list before any execution begins. Works when scope is knowable.

**Best for:** Repeatable workflows, known software features, well-defined documents.

**Risk:** Planner makes wrong assumptions; replanning after partial execution is expensive.

**Brainfile's current model.** Most production systems use this.

---

### 4.2 Recursive / As-Needed (ADaPT Pattern)

Agent encounters a subtask it can't execute directly. It spawns sub-subtasks, waits for completion, then continues. Decomposition depth is bounded by primitive operability.

**Academic name:** ADaPT (As-Needed Decomposition and Planning for Tasks). ReCAP (Recursive Context-Aware Reasoning and Planning) adds context propagation.

**Key ReCAP insight:** Don't pass full parent context to each child. Summarize relevant context per subtask to control token costs.

**Used in:** Claude Code (`Task` tool), complex research pipelines.

---

### 4.3 Dynamic / Emergent (Magentic)

Plan emerges from agent exploration. Expensive but handles genuinely unknown scope.

**Production reality:** Most teams who attempt this revert to static decomposition + dynamic reordering (add/remove tasks mid-flight). Pure dynamic decomposition is rare outside research demos.

---

### 4.4 DAG Scheduling

Task graph with explicit dependencies. Topological sort determines which tasks can run in parallel vs. sequentially. Any task with all dependencies satisfied can be dispatched immediately.

**Used in:** Prefect, Dagster, Airflow (traditional data engineering); LangGraph; any multi-step agent workflow with dependency tracking.

**Brainfile mapping:** `dependsOn` fields already encode the DAG. The supervisor could compute topological sort and dispatch independent tasks concurrently — this is a direct feature gap.

---

## 5. Validation / Review Patterns

### 5.1 Post-Execution Quality Gates

**What's checked:**
1. Deliverable files exist at expected paths
2. Validation commands pass (tests, linters, builds)
3. Schema/format conformance (YAML parses, JSON validates)
4. Spec compliance (separate agent reads spec vs. output)

**Production standard:** `brainfile contract validate` implements steps 1-2. Step 4 is what `@brainfile-karen` does.

---

### 5.2 Sequential Multi-Agent Review Chain

Multiple reviewers check output from different perspectives in sequence. Each reviewer reads prior reviewers' concerns.

Recommended order:
1. **Pragmatist/simplicity check** — Is it over-engineered? Unnecessary dependencies?
2. **Spec compliance check** — Does it satisfy stated requirements?
3. **Security/constraint check** — Does it violate any constraints?

**Why sequential not parallel for reviews:** Each reviewer benefits from prior concerns. Parallel review loses this; reviewers may flag the same issue and miss others.

---

### 5.3 LLM-as-Judge

An LLM evaluates agent output against a rubric, producing a score and structured rationale. Used as a quality gate when deterministic validation isn't possible.

**Production prevalence:** 53.3% of production agent teams use LLM-as-judge (LangChain State of Agents survey).

**Brainfile mapping:** `@brainfile-karen` is effectively LLM-as-judge for spec compliance.

---

### 5.4 Static Analysis Before Execution (Pre-Flight)

Analyze the plan before any execution:
- Detect circular dependencies
- Flag hallucinated subtasks (tasks that don't map to executable work)
- Check for scope creep vs. stated objective

**Used in:** Responsible AI systems, enterprise agentic workflows.

---

### 5.5 Continuous Evaluation Harness (Production Standard)

- Golden dataset with known-good input/output pairs
- Regression tests on every prompt/agent change
- Shadow mode: run new version on real traffic, compare without serving
- Canary releases: serve new agent to small % of traffic
- Replay: store full traces, replay against new model versions

**Production prevalence:** Only 52.4% of teams run offline evals. 37.3% do online monitoring. This is widely cited as a gap.

---

## 6. What's Actually in Production vs. Theoretical

### Genuinely deployed (confirmed by LangChain State of Agents survey, 57% of surveyed teams have agents in production):
- Customer support routing (handoff pattern, CrewAI or OpenAI Agents SDK)
- Document review pipelines (sequential + maker-checker)
- Parallel financial/compliance analysis (concurrent fan-out)
- CI/CD-integrated code review (security + style + perf in parallel)
- Internal productivity automation (LangGraph-based custom implementations)

### Claimed but rarely deployed successfully:
- Full autonomous planning without human gates
- Recursive self-improving loops
- Pure dynamic task decomposition with no upfront structure
- Peer-to-peer agent networks without central coordinator

### Architecture reality (important):
Most reliable production systems are **"mostly deterministic with bounded LLM decision points."** Orchestration flow is controlled by code; LLMs make decisions only within tightly scoped nodes. Pure emergent orchestration remains brittle. Teams learn this after their first demo-to-production attempt fails.

---

## 7. What's Missing / Painful (Production Complaints)

### #1: State persistence across restarts
No standard. LangGraph PostgresSaver is the most mature. Everyone else loses state on crash. **File-based systems (brainfile) solve this by default.**

### #2: Context window budget management
As agents chain, context grows rapidly. No framework provides automatic context compaction. Teams manually summarize between stages. Widespread pain.

### #3: Cost unpredictability
Magentic/dynamic patterns have unbounded cost. Even sequential patterns exceed expectations because intermediate reasoning tokens accumulate. Per-request budgets are manual to implement.

### #4: Observability and debugging
Most frameworks lack end-to-end traces with correlation IDs. Hard to replay a specific agent invocation with exact inputs. LangSmith addresses this for LangChain-native systems only.

### #5: Cross-framework agent interoperability
A CrewAI agent can't natively call a LangGraph subgraph. A2A and ACP are addressing this; adoption is nascent (2025–2026).

### #6: Testing agent workflows
Unit testing agent behavior is hard. No standard testing primitives. Evaluation is expensive (requires LLM calls). Most teams rely on golden datasets and manual inspection.

### #7: Coordination overhead not justified
Gartner predicts 40%+ of agentic projects cancelled by 2027. #1 cause: teams build multi-agent systems when a single agent with tools would suffice. The overhead (latency, cost, debugging) exceeds the benefit.

### #8: Human-in-loop UX
Most HITL presents raw transcripts for human review. What teams actually need: structured evidence diffs showing what was done and what is proposed, with approve/reject/amend actions.

### #9: Replanning after partial failure
If executor fails mid-plan: what succeeded? What's the current world state? What was the original goal? No framework provides clean replanning primitives.

### #10: File-based lifecycle management
For file-based workflows: when to archive completed tasks, how to handle partial deliveries, how to detect stale in-progress tasks. No framework addresses this specifically — brainfile opportunity.

---

## 8. Mapping to Brainfile's Architecture

### Already well-implemented (brainfile solves top industry pain points):

| Brainfile Concept | Orchestration Pattern |
|-------------------|----------------------|
| Task `dependsOn` fields | Sequential pipeline |
| Contract feedback/rework cycle | Maker-checker / generator-critic |
| `delivered → validate → done/failed` | HITL post-execution gate |
| `blocked` status | Human escalation trigger |
| Orchestrator creating tasks dynamically | Magentic / dynamic planning (PM role) |
| `relatedFiles` + deliverable paths | Artifact-based agent communication |
| `brainfile contract validate` | Two-phase commit quality gate |
| `@brainfile-researcher` pre-step | Planner pre-flight |
| `_defaults.md` shared agent config | Agent capability registry |
| File system persistence | State across restarts (solves #1 pain point) |
| `reworkCount` metric | Iteration tracking in critic loop |

### Gaps vs. industry patterns:

1. **No automatic parallel dispatch** — tasks with no mutual dependencies aren't dispatched concurrently automatically. Topological sort + parallel executor would unlock this.
2. **No context compaction** — agents re-read all `relatedFiles` even when a summary would suffice. Cost/token issue as task graphs grow.
3. **No per-task cost/token budget** — no way to set bounds on what an agent contract is allowed to consume.
4. **No declarative retry policy** — rework loop is manual PM action, not automatic retries with backoff.
5. **No confidence gating** — agents can't self-report uncertainty to trigger escalation.
6. **No evaluation harness** — no golden dataset testing, shadow mode, or replay capability.
7. **No fan-out/fan-in semantics** — no `parallel: true` signal, no `aggregatedBy` pointer, no aggregation strategy declaration.

### Patterns worth adding as first-class concepts:

```yaml
# Fan-out/fan-in primitives
parallel: true                    # Signal this task can run concurrently with siblings
aggregatedBy: task-id             # Points to the fan-in collector task
aggregationStrategy: voting       # voting | weighted-merge | llm-synthesize

# Retry policy
retryPolicy:
  maxAttempts: 3
  backoffSeconds: 60
  fallbackAssignee: claude          # Reassign after N failures

# Context management
contextSummary: true              # Prior deliverables should be summarized before injection
contextBudgetTokens: 8000        # Max tokens of context to inject

# Confidence gating
minConfidence: 0.8               # Agent must self-report >= 0.8 or task is escalated
```

---

## Sources

- [Azure Architecture Center: AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) — Sequential, Concurrent, Group Chat, Handoff, Magentic patterns with production guidance
- [Google ADK: Developer's Guide to Multi-Agent Patterns](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/) — SequentialAgent, ParallelAgent, LoopAgent, Generator-Critic, Hierarchical primitives
- [OpenAI Cookbook: Orchestrating Agents — Routines and Handoffs](https://developers.openai.com/cookbook/examples/orchestrating_agents) — Swarm/Agents SDK primitives
- [OpenAI Agents SDK Docs](https://openai.github.io/openai-agents-python/) — Agents, handoffs, guardrails
- [LangChain State of Agent Engineering](https://www.langchain.com/state-of-agent-engineering) — Production stats, failure modes, tooling gaps
- [LangGraph State Machines in Production](https://dev.to/jamesli/langgraph-state-machines-managing-complex-agent-task-flows-in-production-36f4) — Checkpointing, HITL, retry
- [Agent-to-Agent Communication Patterns](https://mbrenndoerfer.com/writing/communication-between-agents) — Message formats, coordination protocols, failure handling
- [AetherLab: Quality Control for Multi-Agent Systems](https://aetherlab.co/blog/multi-agent-systems-quality-control) — Hierarchical validation, circuit breaker, conflict resolution
- [Roo Commander: MDTM (Markdown-Driven Task Management)](https://github.com/jezweb/roo-commander/wiki/02_Core_Concepts-03_MDTM_Explained) — File-based agent coordination, a close analog to brainfile
- [AWS/Amazon: Evaluating AI Agents](https://aws.amazon.com/blogs/machine-learning/evaluating-ai-agents-real-world-lessons-from-building-agentic-systems-at-amazon/) — Production evaluation patterns
- [ADaPT: As-Needed Decomposition and Planning](https://arxiv.org/html/2311.05772v2) — Recursive task decomposition
- [ReCAP: Recursive Context-Aware Reasoning](https://arxiv.org/html/2510.23822v1) — Context propagation in decomposition
- [Survey of Agent Interoperability Protocols (MCP/ACP/A2A/ANP)](https://arxiv.org/html/2505.02279v1) — Cross-framework communication standards
- [Skywork: 20 Agentic AI Workflow Patterns](https://skywork.ai/blog/agentic-ai-examples-workflow-patterns-2025/) — Fan-out/fan-in benchmarks
- [DataCamp: CrewAI vs LangGraph vs AutoGen](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen) — Framework comparison
