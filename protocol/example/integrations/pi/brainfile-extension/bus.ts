import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

import type { AuditAppendNotice } from './types';
import {
  PI_EVENT_BUS_BASENAME,
  PI_EVENT_BUS_RECONNECT_DELAY_MS,
  PI_EVENT_BUS_CONNECT_TIMEOUT_MS,
  PI_EVENT_BUS_MAX_FRAME_BYTES,
} from './constants';

const BUS_CHANNEL = 'brainfile.audit';
const BUS_VERSION = 1;

type BusFrame = {
  channel: typeof BUS_CHANNEL;
  version: typeof BUS_VERSION;
  senderId: string;
  payload: AuditAppendNotice;
};

export type MessageBusLifecycleState = 'connected' | 'reconnected' | 'disconnected';

export type MessageBusLifecycleEvent = {
  state: MessageBusLifecycleState;
  at: string;
  socketPath: string;
};

export interface MessageBus {
  start(): void;
  stop(): void;
  publishAuditAppend(notice: AuditAppendNotice): void;
  subscribe(handler: (notice: AuditAppendNotice) => void): () => void;
  onLifecycle(handler: (event: MessageBusLifecycleEvent) => void): () => void;
  getSocketPath(): string;
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function isPipePath(socketPath: string): boolean {
  return socketPath.startsWith('\\\\.\\pipe\\');
}

function resolveSocketPath(stateDir: string): string {
  const fingerprint = shortHash(path.resolve(stateDir));

  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\brainfile-events-${fingerprint}`;
  }

  const preferred = path.join(stateDir, PI_EVENT_BUS_BASENAME);
  // Keep headroom for platform-specific sockaddr limits.
  if (preferred.length < 92) {
    return preferred;
  }

  return path.join(os.tmpdir(), `brainfile-events-${fingerprint}.sock`);
}

function parseFrame(line: string): BusFrame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const raw = parsed as Record<string, unknown>;
  if (raw.channel !== BUS_CHANNEL || raw.version !== BUS_VERSION) {
    return null;
  }

  const senderId = typeof raw.senderId === 'string' ? raw.senderId.trim() : '';
  if (!senderId) {
    return null;
  }

  const payload = raw.payload;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const payloadRaw = payload as Record<string, unknown>;
  const logPath = typeof payloadRaw.logPath === 'string' ? payloadRaw.logPath.trim() : '';
  const emittedAt = typeof payloadRaw.emittedAt === 'string' ? payloadRaw.emittedAt.trim() : '';
  const eventId = typeof payloadRaw.eventId === 'string' ? payloadRaw.eventId.trim() : '';

  if (!logPath || !emittedAt) {
    return null;
  }

  return {
    channel: BUS_CHANNEL,
    version: BUS_VERSION,
    senderId,
    payload: {
      logPath,
      emittedAt,
      ...(eventId ? { eventId } : {}),
    },
  };
}

function probeSocket(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    let settled = false;

    const finalize = (connected: boolean) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // best effort
      }
      resolve(connected);
    };

    const timer = setTimeout(() => finalize(false), PI_EVENT_BUS_CONNECT_TIMEOUT_MS);

    socket.once('connect', () => {
      clearTimeout(timer);
      finalize(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      finalize(false);
    });
    socket.once('close', () => {
      clearTimeout(timer);
      finalize(false);
    });
  });
}

class LocalRealtimeMessageBus implements MessageBus {
  private readonly socketPath: string;
  private readonly senderId: string;

  private running = false;
  private connecting = false;
  private connected = false;
  private connectedOnce = false;

  private server: net.Server | null = null;
  private readonly serverPeers = new Set<net.Socket>();

  private client: net.Socket | null = null;
  private clientBuffer = '';

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly subscribers = new Set<(notice: AuditAppendNotice) => void>();
  private readonly lifecycleSubscribers = new Set<(event: MessageBusLifecycleEvent) => void>();

  constructor(private readonly stateDir: string) {
    this.socketPath = resolveSocketPath(stateDir);
    this.senderId = `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  getSocketPath(): string {
    return this.socketPath;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleConnectNow();
  }

  stop(): void {
    this.running = false;
    this.connecting = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.teardownClient(false);
    this.teardownServer();
  }

  publishAuditAppend(notice: AuditAppendNotice): void {
    if (!this.running) {
      this.start();
    }

    const frame: BusFrame = {
      channel: BUS_CHANNEL,
      version: BUS_VERSION,
      senderId: this.senderId,
      payload: {
        logPath: notice.logPath,
        emittedAt: notice.emittedAt,
        ...(notice.eventId ? { eventId: notice.eventId } : {}),
      },
    };

    const line = JSON.stringify(frame);

    if (this.client && !this.client.destroyed && this.client.writable) {
      this.client.write(`${line}\n`);
      return;
    }

    // Best-effort fallback when we are hosting but client is not yet bound.
    if (this.server) {
      this.broadcastLine(line);
      this.dispatchFrame(frame);
      return;
    }

    this.scheduleReconnect();
  }

  subscribe(handler: (notice: AuditAppendNotice) => void): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  onLifecycle(handler: (event: MessageBusLifecycleEvent) => void): () => void {
    this.lifecycleSubscribers.add(handler);
    return () => {
      this.lifecycleSubscribers.delete(handler);
    };
  }

  private scheduleConnectNow(): void {
    if (!this.running) return;
    void this.ensureConnected();
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected();
    }, PI_EVENT_BUS_RECONNECT_DELAY_MS);
  }

  private emitLifecycle(state: MessageBusLifecycleState): void {
    const event: MessageBusLifecycleEvent = {
      state,
      at: new Date().toISOString(),
      socketPath: this.socketPath,
    };

    for (const handler of this.lifecycleSubscribers) {
      try {
        handler(event);
      } catch {
        // Listener errors must not break the bus.
      }
    }
  }

  private dispatchFrame(frame: BusFrame): void {
    for (const handler of this.subscribers) {
      try {
        handler(frame.payload);
      } catch {
        // Listener errors must not break the bus.
      }
    }
  }

  private broadcastLine(line: string): void {
    for (const peer of this.serverPeers) {
      if (peer.destroyed || !peer.writable) continue;
      try {
        peer.write(`${line}\n`);
      } catch {
        // best effort; socket lifecycle handlers perform cleanup.
      }
    }
  }

  private attachServerPeer(socket: net.Socket): void {
    socket.setNoDelay(true);

    let buffer = '';
    this.serverPeers.add(socket);

    const cleanup = () => {
      this.serverPeers.delete(socket);
      try {
        socket.destroy();
      } catch {
        // best effort
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      if (buffer.length > PI_EVENT_BUS_MAX_FRAME_BYTES) {
        buffer = '';
        return;
      }

      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex < 0) break;

        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;

        this.broadcastLine(line);
      }
    });

    socket.on('error', () => {
      cleanup();
    });
    socket.on('close', () => {
      cleanup();
    });
  }

  private handleClientData(chunk: string): void {
    this.clientBuffer += chunk;
    if (this.clientBuffer.length > PI_EVENT_BUS_MAX_FRAME_BYTES) {
      this.clientBuffer = '';
      return;
    }

    while (true) {
      const newlineIndex = this.clientBuffer.indexOf('\n');
      if (newlineIndex < 0) break;

      const line = this.clientBuffer.slice(0, newlineIndex).trim();
      this.clientBuffer = this.clientBuffer.slice(newlineIndex + 1);
      if (!line) continue;

      const frame = parseFrame(line);
      if (!frame) continue;
      this.dispatchFrame(frame);
    }
  }

  private attachClient(socket: net.Socket): void {
    this.teardownClient(false);

    this.client = socket;
    this.clientBuffer = '';

    socket.setNoDelay(true);

    const previouslyConnected = this.connectedOnce;
    if (!this.connected) {
      this.connected = true;
      this.connectedOnce = true;
      this.emitLifecycle(previouslyConnected ? 'reconnected' : 'connected');
    }

    socket.on('data', (chunk) => {
      this.handleClientData(chunk.toString('utf-8'));
    });

    const onDisconnect = () => {
      if (this.client !== socket) return;
      this.teardownClient(true);
      if (this.running) {
        this.scheduleReconnect();
      }
    };

    socket.on('error', onDisconnect);
    socket.on('close', onDisconnect);
  }

  private teardownClient(emitDisconnected: boolean): void {
    if (this.client) {
      try {
        this.client.destroy();
      } catch {
        // best effort
      }
      this.client = null;
    }

    this.clientBuffer = '';

    if (this.connected) {
      this.connected = false;
      if (emitDisconnected) {
        this.emitLifecycle('disconnected');
      }
    }
  }

  private teardownServer(): void {
    if (this.server) {
      for (const peer of this.serverPeers) {
        try {
          peer.destroy();
        } catch {
          // best effort
        }
      }
      this.serverPeers.clear();

      try {
        this.server.close();
      } catch {
        // best effort
      }
      this.server = null;
    }

    if (!isPipePath(this.socketPath)) {
      try {
        if (fs.existsSync(this.socketPath)) {
          fs.unlinkSync(this.socketPath);
        }
      } catch {
        // best effort
      }
    }
  }

  private async connectAsClient(): Promise<boolean> {
    if (!this.running) return false;

    return new Promise((resolve) => {
      const socket = net.createConnection(this.socketPath);
      let settled = false;

      const finalize = (connected: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        if (connected) {
          this.attachClient(socket);
        } else {
          try {
            socket.destroy();
          } catch {
            // best effort
          }
        }

        resolve(connected);
      };

      const timeout = setTimeout(() => finalize(false), PI_EVENT_BUS_CONNECT_TIMEOUT_MS);

      socket.once('connect', () => finalize(true));
      socket.once('error', () => finalize(false));
      socket.once('close', () => finalize(false));
    });
  }

  private async maybeCleanupStaleSocket(): Promise<void> {
    if (isPipePath(this.socketPath)) return;
    if (!fs.existsSync(this.socketPath)) return;

    const alive = await probeSocket(this.socketPath);
    if (alive) return;

    try {
      fs.unlinkSync(this.socketPath);
    } catch {
      // best effort
    }
  }

  private async startServer(): Promise<boolean> {
    if (!this.running) return false;
    if (this.server) return true;

    if (!isPipePath(this.socketPath)) {
      fs.mkdirSync(path.dirname(this.socketPath), { recursive: true });
    }

    return new Promise((resolve) => {
      const server = net.createServer((socket) => this.attachServerPeer(socket));
      let settled = false;

      const finalize = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (!ok) {
          try {
            server.close();
          } catch {
            // best effort
          }
        }
        resolve(ok);
      };

      server.once('error', () => finalize(false));
      server.listen(this.socketPath, () => {
        server.on('error', () => {
          // Keep process alive on transient server socket errors.
        });
        this.server = server;
        finalize(true);
      });
    });
  }

  private async ensureConnected(): Promise<void> {
    if (!this.running || this.connecting || this.connected) return;
    this.connecting = true;

    try {
      const connected = await this.connectAsClient();
      if (connected || !this.running) {
        return;
      }

      await this.maybeCleanupStaleSocket();

      // Best-effort host election: whoever binds first becomes relay host.
      await this.startServer();

      if (!this.running) return;
      await this.connectAsClient();
    } finally {
      this.connecting = false;
      if (this.running && !this.connected) {
        this.scheduleReconnect();
      }
    }
  }
}

export function createLocalMessageBus(stateDir: string): MessageBus {
  return new LocalRealtimeMessageBus(stateDir);
}
