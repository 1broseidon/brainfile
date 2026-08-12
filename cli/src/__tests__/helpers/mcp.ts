/**
 * Minimal MCP server stub for exercising tool handlers directly in tests.
 *
 * Tool modules call `server.registerTool(name, definition, handler)`; this
 * captures the handler so tests can invoke it with a plain args object,
 * bypassing transport and zod parsing.
 */

export type McpToolHandler = (args: any) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}>;

export class FakeMcpServer {
  readonly handlers = new Map<string, McpToolHandler>();

  registerTool(name: string, _definition: unknown, handler: McpToolHandler): void {
    this.handlers.set(name, handler);
  }

  handler(name: string): McpToolHandler {
    const found = this.handlers.get(name);
    if (!found) {
      throw new Error(`Tool not registered: ${name}`);
    }
    return found;
  }
}

/** Extract the plain text payload from an MCP tool result. */
export function mcpText(result: { content: Array<{ type: 'text'; text: string }> }): string {
  return result.content.map((c) => c.text).join('\n');
}

/** Parse an MCP tool result whose text payload is JSON. */
export function mcpJson<T = any>(result: { content: Array<{ type: 'text'; text: string }> }): T {
  return JSON.parse(mcpText(result));
}
