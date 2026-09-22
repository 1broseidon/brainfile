# ADR: AI SDK (Vercel) vs ACP Agents for Alternate Providers

## Introduction
Currently, Brainfile dispatches tasks to agents using the Agent Client Protocol (ACP) over stdio. This relies on the agent binary (e.g., `claude`) to implement the AI loop, tool calling, and model interaction. To support custom models or "Bring Your Own Key" (BYOK), we must decide between integrating the Vercel AI SDK natively into Brainfile or relying on users to configure alternative ACP-compliant agents.

## Option A: Integrate Vercel AI SDK

This approach means Brainfile would run its own AI loop using the Vercel AI SDK, acting as the agent itself rather than just orchestrating a subprocess.

### Feasibility & Mapping to ACP Concepts
- **Tool Calls**: AI SDK's `toolCalls` and `toolResults` would replace ACP's `ReadTextFileRequest`/`WriteTextFileRequest`. We would define `CoreTool` objects for file reading/writing.
- **Streaming**: AI SDK's `streamText` function yields text deltas and tool call streams, which would map to ACP's `agent_message_chunk` and `tool_call_update` events in our dispatch logs.
- **Session Management**: AI SDK is stateless. Brainfile would need to persist the full message history (array of `CoreMessage`) to disk and reload it to resume sessions, unlike ACP's `loadSession`/`listSessions`.

### What's Missing?
- **Permission Model**: ACP's `requestPermission` allows agents to ask for user approval before taking risky actions. We would have to build a custom tool wrapper in the AI SDK to pause execution and prompt the user.
- **Advanced State**: AI SDK doesn't natively emit `usage_update` mid-stream or track "thoughts" versus "messages" natively out of the box without custom event mapping.
- **Agent Loop Quality**: Building a production-grade agent loop (handling context limits, tool failure retries, parallel tools) is non-trivial and would duplicate effort already solved by dedicated agents.

### Config Changes
Agent configuration (`agents/my-agent.md`) would need to support a new `transport: ai-sdk` alongside `acp-stdio`. We'd add fields like `provider`, `model`, and `apiKeyEnv`.

### Pseudocode for AI SDK Integration Shim

```typescript
import { streamText, tool } from 'ai';
import { z } from 'zod';
// e.g. using openai provider
import { openai } from '@ai-sdk/openai';

async function dispatchVercelAI(ctx: DispatchContext, config: AgentConfig) {
  const messages = loadMessageHistory(ctx.taskId);
  messages.push({ role: 'user', content: buildDispatchPrompt(ctx) });

  const result = await streamText({
    model: openai(config.model), // or generic provider factory
    messages,
    tools: {
      readTextFile: tool({
        description: 'Read a file',
        parameters: z.object({ path: z.string() }),
        execute: async ({ path }) => fs.readFileSync(path, 'utf-8'),
      }),
      writeTextFile: tool({
        description: 'Write a file',
        parameters: z.object({ path: z.string(), content: z.string() }),
        execute: async ({ path, content }) => fs.writeFileSync(path, content),
      })
    },
    onStepFinish({ text, toolCalls }) {
       // shim to translate to dispatch logs
       if (text) appendDispatchLog({ type: 'message', text });
       for (const tc of toolCalls) {
           appendDispatchLog({ type: 'tool_call', title: tc.toolName });
       }
    }
  });

  for await (const delta of result.textStream) {
     // Emulate agent_message_chunk
     emitSessionUpdate({ sessionUpdate: 'agent_message_chunk', content: { text: delta } });
  }
}
```

## Option B: "Just use another ACP agent"

This approach maintains Brainfile as a pure orchestrator. Users who want different models install a different ACP-compatible CLI agent.

### Existing ACP Agents & Maturity
1. **Claude Code**: The reference implementation. Highly mature, fully supports ACP, `session/update`, usage metrics, and permissions.
2. **Goose**: Open source agent from Block. It is standardizing around MCP/ACP patterns. Maturity is growing; it can act as a drop-in replacement if it provides an ACP stdio wrapper.
3. **Aider**: A popular AI coding agent. While not natively ACP out of the box, community wrappers or standard adapters can bridge Aider to ACP.
4. **OpenCode** (or other upcoming open-source agents): The agent ecosystem is rapidly adopting MCP and ACP as standards.

### User Experience Differences
- **Configuring another agent**: The user updates their agent `.md` file:
  ```yaml
  transport: acp-stdio
  command: npx
  args: ["goose", "acp"]
  ```
- **Versus new SDK**: Using the SDK would require Brainfile to maintain a massive dependency tree (`@ai-sdk/openai`, `@ai-sdk/anthropic`, etc.) and users would have to configure API keys in Brainfile rather than delegating secret management to the agent tool.

## Recommendation

**We recommend Option B (Just use another ACP agent).**

**Reasoning:**
1. **Separation of Concerns**: Brainfile's core value is orchestrating tasks, contracts, and context—not building a robust AI evaluation loop. Writing a good agent loop with context management, tool retry logic, and fallback parsing is extremely difficult and distracts from Brainfile's core mission.
2. **Ecosystem Leverage**: The open-source community is building excellent agents (Goose, Aider). By remaining a pure ACP orchestrator, Brainfile gets "for free" all the advancements in agent reasoning, context caching, and model support that these dedicated tools provide.
3. **Reduced Maintenance**: We avoid bloating Brainfile with multiple provider SDKs and a custom shim layer.
4. **Consistency**: The user experience remains unified. Whether using Claude Code or an open-source alternative, the configuration paradigm (`command`, `args`) and the inter-process communication (stdio ndjson) remain exactly the same.