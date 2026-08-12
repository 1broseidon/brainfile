/**
 * Drives the REAL MCP server over a real transport, in-process.
 *
 * `FakeMcpServer` (./mcp.ts) captures handler functions and calls them
 * directly, which is fine for handler logic but structurally cannot see any
 * of the SDK behaviour this helper exists to test: zod input parsing,
 * `outputSchema` validation, the era-specific wire codec, or the
 * `structuredContent` projection. Those only happen inside `McpServer` +
 * `serveStdio`.
 *
 * `serveStdio` owns the era decision for a connection (the opening exchange
 * picks it and pins one server instance), and it accepts a caller-supplied
 * transport — so an `InMemoryTransport` linked pair gets the genuine
 * two-era code path without spawning a process or requiring a built bundle.
 */
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createBrainfileMcpServer } from '../../commands/mcp';

export type Era = 'legacy' | 'modern';

/** Wire constants, matching @modelcontextprotocol/core's exported keys. */
const PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
const CLIENT_CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities';
const MODERN_PROTOCOL_VERSION = '2026-07-28';
const LEGACY_PROTOCOL_VERSION = '2025-11-25';

export interface ToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export interface AdvertisedTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/**
 * An MCP client speaking raw JSON-RPC to a real server over an in-memory
 * transport. No `@modelcontextprotocol/client` package is installed, so the
 * wire protocol is driven by hand.
 */
export class WireClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >();
  private readonly clientTransport: InMemoryTransport;
  private readonly handle: { close(): Promise<void> };

  private constructor(
    clientTransport: InMemoryTransport,
    handle: { close(): Promise<void> },
    private readonly era: Era,
  ) {
    this.clientTransport = clientTransport;
    this.handle = handle;
    this.clientTransport.onmessage = (message: any) => {
      if (message?.id === undefined) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) {
        waiter.reject(new Error(`${message.error.code}: ${message.error.message}`));
      } else {
        waiter.resolve(message.result);
      }
    };
  }

  /** Opens a connection in the given era and completes the handshake. */
  static async open(brainfilePath: string, era: Era): Promise<WireClient> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = serveStdio(() => createBrainfileMcpServer(brainfilePath), {
      transport: serverTransport,
    });
    const client = new WireClient(clientTransport, handle, era);
    await clientTransport.start();
    await client.handshake();
    return client;
  }

  /**
   * The 2026 era carries a `_meta` envelope on every request; the 2025 era
   * carries none and its wire stays byte-identical to a plain stdio server.
   */
  private envelope(): Record<string, unknown> | undefined {
    if (this.era !== 'modern') return undefined;
    return {
      [PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION,
      [CLIENT_CAPABILITIES_META_KEY]: {},
    };
  }

  private async handshake(): Promise<void> {
    if (this.era === 'legacy') {
      await this.request(
        'initialize',
        {
          protocolVersion: LEGACY_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'wire-test', version: '0.0.0' },
        },
        { envelope: false },
      );
      await this.clientTransport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      } as any);
      return;
    }
    await this.request('server/discover', {
      protocolVersions: [MODERN_PROTOCOL_VERSION],
      clientInfo: { name: 'wire-test', version: '0.0.0' },
    });
  }

  async request(
    method: string,
    params: Record<string, unknown> = {},
    opts: { envelope?: boolean } = {},
  ): Promise<any> {
    const id = this.nextId++;
    const env = opts.envelope === false ? undefined : this.envelope();
    const message = {
      jsonrpc: '2.0' as const,
      id,
      method,
      params: env ? { ...params, _meta: env } : params,
    };
    const result = new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout waiting for ${method}`));
        }
      }, 15000).unref?.();
    });
    await this.clientTransport.send(message as any);
    return result;
  }

  async listTools(): Promise<AdvertisedTool[]> {
    const result = await this.request('tools/list', {});
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    return this.request('tools/call', { name, arguments: args });
  }

  /** The text of the first `type: 'text'` content block, if any. */
  static text(result: ToolResult): string | undefined {
    return result.content?.find((b) => b.type === 'text')?.text;
  }

  async close(): Promise<void> {
    await this.handle.close();
  }
}
