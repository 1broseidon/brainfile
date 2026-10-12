/**
 * The desk's MCP server (spec-16): a small stdio program a chat agent starts
 * beside Brainfile's own `brainfile mcp`. It speaks just enough MCP for
 * tools (initialize, tools/list, tools/call, ping) as newline-delimited
 * JSON-RPC, and passes every call to the app over its socket (desk.ts).
 *
 * It is run by the app's own Electron binary as node (ELECTRON_RUN_AS_NODE),
 * so it needs no node on the Mac and reads itself straight out of app.asar.
 */
import { AGENT_IDS, DESK_ENV, callDesk } from './desk';

const VERSION = '0.1.0';
/** The newest protocol this speaks; an older one the client asks for is answered in kind (tools are the same). */
const PROTOCOL = '2025-06-18';
const KNOWN_PROTOCOLS = new Set(['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']);

const socketPath = process.env[DESK_ENV.socket] ?? '';
const token = process.env[DESK_ENV.token] ?? '';
const project = process.env[DESK_ENV.project] || undefined;

const TOOLS = [
  {
    name: 'dispatch',
    title: 'Hand a task to an agent',
    description:
      'Hand a task on this board to a coding agent, as Hand to… does in the Brainfile window: the agent works on it in its own git worktree ' +
      '(branch dispatch/<task-id>), the task gets a tab in the dock, the agent asks the person there before it acts, and it moves the task to review when done. ' +
      'Create the task first with the brainfile tools. agent and model are optional: by default, you and your own model.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task to hand off, such as task-35.' },
        agent: { type: 'string', enum: [...AGENT_IDS], description: 'Who does it. Default: the agent you are.' },
        model: { type: 'string', description: 'A model ID the agent offers. Default: your own model when the agent is you, else the person’s choice for that agent.' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'runs',
    title: 'What is running',
    description: 'What is running on this Mac: each hand-off’s task, agent, state and activity, and its board; and what finished on this board since the app opened.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'stop',
    title: 'Stop a hand-off',
    description: 'Stop the agent working on a task on this board. Its worktree and branch stay, for the person to review.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string', description: 'The task whose agent to stop, such as task-35.' } },
      required: ['taskId'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
];

type Id = string | number;
interface Message {
  jsonrpc?: '2.0';
  id?: Id | null;
  method?: string;
  params?: Record<string, unknown>;
}

function write(message: object): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
}

async function answer(message: Message): Promise<void> {
  const { id, method, params = {} } = message;
  // A notification (initialized, cancelled) asks for nothing back.
  if (id === undefined || id === null) return;
  switch (method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL;
      return write({
        id,
        result: {
          protocolVersion: KNOWN_PROTOCOLS.has(asked) ? asked : PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'desk', title: 'Brainfile desk', version: VERSION },
          instructions:
            'The Brainfile window’s own tools: dispatch hands a task on this board to a coding agent in its own worktree, runs says what is running, stop stops one. ' +
            'Ask the person before dispatching more than three tasks at once.',
        },
      });
    }
    case 'ping':
      return write({ id, result: {} });
    case 'tools/list':
      return write({ id, result: { tools: TOOLS } });
    case 'tools/call': {
      const name = String(params.name ?? '');
      if (!TOOLS.some((t) => t.name === name)) return write({ id, error: { code: -32602, message: `Unknown tool: ${name}` } });
      const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {};
      const result = await callDesk(socketPath, { token, project, tool: name, args });
      return write({
        id,
        result: result.ok
          ? { content: [{ type: 'text', text: result.value }] }
          : { content: [{ type: 'text', text: result.error }], isError: true },
      });
    }
    default:
      return write({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

let buffer = '';
let pending = 0;
let ended = false;
const finish = () => {
  if (ended && pending === 0) process.exit(0);
};

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  let end: number;
  while ((end = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, end).trim();
    buffer = buffer.slice(end + 1);
    if (!line) continue;
    let message: Message;
    try {
      message = JSON.parse(line) as Message;
    } catch {
      write({ id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    pending++;
    void answer(message)
      .catch((err) => {
        if (message.id !== undefined && message.id !== null) write({ id: message.id, error: { code: -32603, message: err instanceof Error ? err.message : String(err) } });
      })
      .finally(() => {
        pending--;
        finish();
      });
  }
});
// The agent closing its end is the signal to go.
process.stdin.on('end', () => {
  ended = true;
  finish();
});
