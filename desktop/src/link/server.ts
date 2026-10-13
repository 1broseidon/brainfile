/**
 * The desk's half of the phone link (brainfile-mobile docs/link.md, protocol
 * 1): a WebSocket server on the LAN at `/link/1`, a Noise IK handshake to the
 * desk's static key, and then the whitelisted slice of the window's own API
 * (bridge.ts) and its events, sealed frame by frame. The phone initiates;
 * the desk responds. The network is only a carrier: who a phone is comes
 * from its key, proven in the handshake, never from its address.
 *
 * Pure Node: the desk (its API, its projects) and the store are passed in,
 * so the tests run a real phone against it over a real socket, and
 * `npm run link:dev` runs it with a fake desk.
 */
import { randomBytes, timingSafeEqual } from 'crypto';
import * as http from 'http';
import type { AddressInfo } from 'net';
import type { Duplex } from 'stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { FrameReader, Responder, fromBase64Url, keyPair, sealFrame, toBase64Url, type Session } from './noise';
import { checkCall, UNKNOWN_PROJECT, type LinkDesk } from './bridge';
import type { LinkStore } from './store';
import type { AgentEvent, BoardSnapshot, LinkView, PairingCode, Result } from '../shared/api';

export const LINK_PATH = '/link/1';
export const LINK_PROTOCOL = 1;

/** The close codes the phone words (link.md, Connection). */
export const CLOSE = {
  /** `Desktop refused`: not a handshake, a text message, too slow, or an address that must wait. */
  refused: 4400,
  /** `Not linked · scan again`: a key the desk does not know, with no pairing. */
  notLinked: 4401,
  /** `Code expired`: a pairing secret that is wrong, spent or past its five minutes. */
  expired: 4403,
  /** `Update Brainfile`: another protocol's path. */
  mismatch: 4409,
  /** `Forgotten on desktop`: after `bye`. */
  forgotten: 4410,
} as const;

export interface Limits {
  /** How long a socket has to send message 1. */
  helloMs: number;
  /** Sockets at once, handshaking or linked. */
  sockets: number;
  /** The largest WebSocket message; a larger one closes the socket. */
  maxPayload: number;
  /** Failed handshakes from one address within `failWindowMs` before it waits `lockMs`. */
  failures: number;
  failWindowMs: number;
  lockMs: number;
  pingMs: number;
  /** At most one `board` event per board per phone this often; the latest wins. */
  boardMs: number;
  /** How long a pairing secret is good for. */
  codeMs: number;
  /** Ports tried, counting up from the remembered one. */
  ports: number;
}

export const LIMITS: Limits = {
  helloMs: 10_000,
  sockets: 8,
  maxPayload: 65_535,
  failures: 10,
  failWindowMs: 60_000,
  lockMs: 60_000,
  pingMs: 20_000,
  boardMs: 500,
  codeMs: 5 * 60_000,
  ports: 20,
};

export interface LinkServerOptions {
  store: LinkStore;
  desk: LinkDesk;
  /** Where the desk can be reached on a port, best first; asked for each code and each hello. */
  addresses(port: number): string[];
  /** The desk's name, as the phone shows it. */
  name: string;
  /** What Settings shows has changed: the switch, a phone linked, connected or gone. */
  onChange?(view: LinkView): void;
  limits?: Partial<Limits>;
  /** The interface to listen on; every one unless a test says otherwise. */
  listenHost?: string;
}

/** A board's pace for one phone: when it was last sent, and what waits to go. */
interface Pace {
  last: number;
  timer: NodeJS.Timeout | null;
  latest: BoardSnapshot | null;
}

interface Conn {
  id: number;
  ws: WebSocket;
  address: string;
  /** Set once the handshake is done: from then on the phone is linked. */
  session: Session | null;
  reader: FrameReader | null;
  key: string | null;
  closing: boolean;
  alive: boolean;
  hello: NodeJS.Timeout | null;
  /** The boards this phone opened: their changes go to it. */
  boards: Set<string>;
  pace: Map<string, Pace>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** The text a phone scans or is sent (link.md, Pairing code). */
export function pairingLink(deskKey: Uint8Array, secret: Uint8Array, addresses: string[], name: string): string {
  const n = encodeURIComponent([...name].slice(0, 64).join(''));
  return `brainfile://link?v=1&k=${toBase64Url(deskKey)}&s=${toBase64Url(secret)}&a=${addresses.join(',')}&n=${n}`;
}

/** `::ffff:192.168.1.20` is the IPv4 address it carries. */
function plainAddress(address: string | undefined): string {
  return (address ?? '').replace(/^::ffff:/, '');
}

function bytesOf(data: RawData): Uint8Array {
  const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function objectOf(bytes: Uint8Array): Record<string, unknown> | null {
  try {
    const value = JSON.parse(decoder.decode(bytes)) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A call that threw, in a few words. */
function words(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length <= 120 ? message : 'Failed';
}

function listenOn(server: http.Server, port: number, host: string | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = (err: Error) => reject(err);
    server.once('error', failed);
    const done = () => {
      server.off('error', failed);
      resolve();
    };
    if (host) server.listen(port, host, done);
    else server.listen(port, done);
  });
}

export class LinkServer {
  private readonly limits: Limits;
  private readonly wss: WebSocketServer;
  private server: http.Server | null = null;
  private readonly conns = new Set<Conn>();
  private secret: { bytes: Buffer; expiresAt: number } | null = null;
  private readonly failures = new Map<string, number[]>();
  private readonly locked = new Map<string, number>();
  private pinger: NodeJS.Timeout | null = null;
  private listenError: string | undefined;
  private paired: { name: string; at: number } | undefined;
  private nextConn = 1;

  constructor(private readonly options: LinkServerOptions) {
    this.limits = { ...LIMITS, ...options.limits };
    this.wss = new WebSocketServer({ noServer: true, maxPayload: this.limits.maxPayload, perMessageDeflate: false });
  }

  private get store(): LinkStore {
    return this.options.store;
  }

  /** Listens if the switch was left on. */
  async start(): Promise<void> {
    if (this.store.on) await this.listen();
  }

  /** The port it listens on, while it does. */
  get port(): number | null {
    return this.server ? (this.server.address() as AddressInfo).port : null;
  }

  view(): LinkView {
    const connected = new Set([...this.conns].filter((c) => c.session).map((c) => c.key));
    return {
      on: this.store.on,
      port: this.port,
      ...(this.store.on && this.listenError ? { error: this.listenError } : {}),
      phones: this.store.phones().map((phone) => ({ ...phone, connected: connected.has(phone.key) })),
      ...(this.paired ? { paired: this.paired } : {}),
    };
  }

  /** On listens; off closes every phone's socket and stops listening. The phones stay linked. */
  async setOn(on: boolean): Promise<LinkView> {
    this.store.on = on;
    if (on) await this.listen();
    else await this.stop();
    this.changed();
    return this.view();
  }

  /**
   * A new pairing code: 32 random bytes, good for one pairing within five
   * minutes. Showing a code turns the link on and retires the last one.
   */
  async code(): Promise<Result<PairingCode>> {
    let deskKey: Uint8Array;
    try {
      deskKey = this.store.key().public;
    } catch (err) {
      return { ok: false, error: words(err) };
    }
    if (!this.server) {
      this.store.on = true;
      await this.listen();
      this.changed();
    }
    const port = this.port;
    if (port === null) return { ok: false, error: this.listenError ?? 'Not listening' };
    const addresses = this.options.addresses(port);
    if (addresses.length === 0) return { ok: false, error: 'No network' };
    const bytes = randomBytes(32);
    const expiresAt = Date.now() + this.limits.codeMs;
    this.secret = { bytes, expiresAt };
    return { ok: true, value: { link: pairingLink(deskKey, bytes, addresses, this.options.name), expiresAt } };
  }

  /** Forget a phone: its key goes, and if it is connected it is told (`bye`) and let go. */
  forget(key: string): LinkView {
    this.store.forget(key);
    for (const conn of this.conns) {
      if (conn.key !== key || !conn.session) continue;
      this.send(conn, { event: 'bye', reason: 'forgotten' });
      this.end(conn, CLOSE.forgotten, 'Forgotten');
    }
    this.changed();
    return this.view();
  }

  // ── Events from the desk ──────────────────────────────────────────────────

  /** A board changed: each phone that opened it hears, at most once per `boardMs`, the latest. */
  board(snapshot: BoardSnapshot): void {
    for (const conn of this.conns) if (conn.session && conn.boards.has(snapshot.projectId)) this.pace(conn, snapshot);
  }

  /** Every run, ask and answer, for every project, to every phone. */
  agent(event: AgentEvent): void {
    for (const conn of this.conns) if (conn.session) this.send(conn, { event: 'agent', agent: event });
  }

  /** The desk's projects changed: every phone gets the list again; boards gone from it are no longer sent. */
  async projectsChanged(): Promise<void> {
    const linked = [...this.conns].filter((c) => c.session);
    if (linked.length === 0) return;
    let projects: unknown;
    try {
      projects = await this.options.desk.projects();
    } catch {
      return;
    }
    for (const conn of linked) {
      for (const projectId of conn.boards) if (!this.options.desk.knows(projectId)) this.unsubscribe(conn, projectId);
      this.send(conn, { event: 'projects', projects });
    }
  }

  /** The app is quitting: everything closes, the switch stays as it is. */
  async close(): Promise<void> {
    await this.stop();
  }

  // ── Listening ─────────────────────────────────────────────────────────────

  /** Port 47210, else the next free one, which is remembered so the phones' addresses keep working. */
  private async listen(): Promise<void> {
    if (this.server) return;
    const server = http.createServer((_req, res) => {
      res.writeHead(404, { Connection: 'close' });
      res.end();
    });
    server.headersTimeout = this.limits.helloMs;
    server.requestTimeout = this.limits.helloMs;
    server.on('upgrade', (req, socket, head) => this.upgrade(req, socket, head));
    server.on('clientError', (_err, socket) => socket.destroy());
    const first = this.store.port;
    this.listenError = 'No free port';
    for (let i = 0; i < this.limits.ports; i++) {
      // Port 0 (a test) is any free port.
      const port = first === 0 ? 0 : first + i;
      try {
        await listenOn(server, port, this.options.listenHost);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'EADDRINUSE' || code === 'EACCES') continue;
        this.listenError = words(err);
        break;
      }
      this.server = server;
      this.listenError = undefined;
      this.store.port = (server.address() as AddressInfo).port;
      this.pinger = setInterval(() => this.ping(), this.limits.pingMs);
      this.pinger.unref();
      return;
    }
  }

  private async stop(): Promise<void> {
    this.secret = null;
    if (this.pinger) clearInterval(this.pinger);
    this.pinger = null;
    const server = this.server;
    this.server = null;
    for (const conn of this.conns) this.end(conn, 1001, 'Phone link off');
    if (!server) return;
    await new Promise<void>((resolve) => {
      // A phone that never answers the close is cut off rather than waited for.
      const cut = setTimeout(() => {
        for (const conn of this.conns) conn.ws.terminate();
        resolve();
      }, 1000);
      server.close(() => {
        clearTimeout(cut);
        resolve();
      });
    });
  }

  /** Only `/link/1` is ours; another protocol's path is told so, anything else is closed. */
  private upgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): void {
    const path = new URL(req.url ?? '/', 'http://desk').pathname;
    const ours = path === LINK_PATH;
    if (!ours && !/^\/link\/\d+$/.test(path)) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    if (this.conns.size >= this.limits.sockets) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      return;
    }
    const address = plainAddress(req.socket.remoteAddress);
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      if (!this.server) return ws.terminate();
      if (!ours) return ws.close(CLOSE.mismatch, 'Update Brainfile');
      if (this.waiting(address)) return ws.close(CLOSE.refused, 'Wait a minute');
      this.accept(ws, address);
    });
  }

  private accept(ws: WebSocket, address: string): void {
    const conn: Conn = {
      id: this.nextConn++,
      ws,
      address,
      session: null,
      reader: null,
      key: null,
      closing: false,
      alive: true,
      hello: null,
      boards: new Set(),
      pace: new Map(),
    };
    this.conns.add(conn);
    conn.hello = setTimeout(() => this.refuse(conn, CLOSE.refused, 'Too slow'), this.limits.helloMs);
    ws.on('message', (data, isBinary) => this.message(conn, data, isBinary));
    ws.on('pong', () => (conn.alive = true));
    ws.on('close', () => this.dropped(conn));
    // A close always follows an error; that is where the socket is let go.
    ws.on('error', () => {});
  }

  /** Every `pingMs`, each socket is pinged; one that did not answer the last ping is cut off. */
  private ping(): void {
    for (const conn of this.conns) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      conn.ws.ping();
    }
    const now = Date.now();
    for (const [address, until] of this.locked) if (until <= now) this.locked.delete(address);
    for (const [address, times] of this.failures) if (times.every((t) => now - t >= this.limits.failWindowMs)) this.failures.delete(address);
  }

  // ── The handshake ─────────────────────────────────────────────────────────

  private message(conn: Conn, data: RawData, isBinary: boolean): void {
    if (conn.closing) return;
    if (!isBinary) return conn.session ? this.end(conn, CLOSE.refused, 'Binary only') : this.refuse(conn, CLOSE.refused, 'Not a handshake');
    const bytes = bytesOf(data);
    if (!conn.session) return this.handshake(conn, bytes);
    let frame: Uint8Array | null;
    try {
      frame = conn.reader!.push(bytes);
    } catch {
      return this.end(conn, CLOSE.refused, 'Could not open');
    }
    if (frame) void this.frame(conn, frame);
  }

  /**
   * Message 1 carries the phone's key and a JSON payload: a pairing
   * (`{"pair","phone"}`) or a return (`{}`). A pairing spends the open
   * secret; a return must be a linked phone. Message 2 carries the hello.
   */
  private handshake(conn: Conn, bytes: Uint8Array): void {
    if (conn.hello) clearTimeout(conn.hello);
    conn.hello = null;
    let responder: Responder;
    try {
      responder = new Responder(this.store.key(), keyPair(new Uint8Array(randomBytes(32))));
    } catch {
      return this.end(conn, CLOSE.refused, 'No key');
    }
    let first: { payload: Uint8Array; remoteStatic: Uint8Array };
    try {
      first = responder.readMessage1(bytes);
    } catch {
      return this.refuse(conn, CLOSE.refused, 'Not a handshake');
    }
    const payload = objectOf(first.payload);
    if (!payload) return this.refuse(conn, CLOSE.refused, 'Not a handshake');
    const key = toBase64Url(first.remoteStatic);
    if (payload.pair !== undefined) {
      if (typeof payload.pair !== 'string' || !this.spend(payload.pair)) return this.refuse(conn, CLOSE.expired, 'Code expired');
      const name = typeof payload.phone === 'string' && payload.phone.trim() ? [...payload.phone.trim()].slice(0, 64).join('') : 'Phone';
      this.store.link(key, name);
      this.paired = { name, at: Date.now() };
    } else if (this.store.phone(key)) {
      this.store.seen(key);
    } else {
      return this.refuse(conn, CLOSE.notLinked, 'Not linked');
    }
    const hello = { desk: this.store.deskId, name: this.options.name, addresses: this.options.addresses(this.port ?? this.store.port), protocol: LINK_PROTOCOL };
    const second = responder.writeMessage2(encoder.encode(JSON.stringify(hello)));
    conn.session = second.session;
    conn.reader = new FrameReader(second.session.receive);
    conn.key = key;
    conn.ws.send(second.message, { binary: true });
    // One socket per phone: a phone back on another network leaves its old one behind.
    for (const other of this.conns) if (other !== conn && other.key === key) this.end(other, 1000, 'Replaced');
    this.changed();
    void this.options.desk.projects().then((projects) => this.send(conn, { event: 'projects', projects }), () => {});
  }

  /** The open secret, if this is it and it is still good: compared in constant time, and spent. */
  private spend(given: string): boolean {
    const open = this.secret;
    if (!open || Date.now() > open.expiresAt) return false;
    let bytes: Uint8Array;
    try {
      bytes = fromBase64Url(given);
    } catch {
      return false;
    }
    if (bytes.length !== open.bytes.length || !timingSafeEqual(bytes, open.bytes)) return false;
    this.secret = null;
    return true;
  }

  /** A failed handshake: closed, and counted against the address. */
  private refuse(conn: Conn, code: number, reason: string): void {
    const now = Date.now();
    const recent = (this.failures.get(conn.address) ?? []).filter((t) => now - t < this.limits.failWindowMs);
    recent.push(now);
    if (recent.length >= this.limits.failures) {
      this.failures.delete(conn.address);
      this.locked.set(conn.address, now + this.limits.lockMs);
    } else {
      this.failures.set(conn.address, recent);
    }
    this.end(conn, code, reason);
  }

  private waiting(address: string): boolean {
    const until = this.locked.get(address);
    if (until === undefined) return false;
    if (Date.now() < until) return true;
    this.locked.delete(address);
    return false;
  }

  private end(conn: Conn, code: number, reason: string): void {
    if (conn.closing) return;
    conn.closing = true;
    if (conn.hello) clearTimeout(conn.hello);
    conn.hello = null;
    conn.ws.close(code, reason);
  }

  private dropped(conn: Conn): void {
    if (conn.hello) clearTimeout(conn.hello);
    for (const pace of conn.pace.values()) if (pace.timer) clearTimeout(pace.timer);
    conn.pace.clear();
    conn.boards.clear();
    conn.closing = true;
    this.conns.delete(conn);
    if (!conn.session) return;
    void this.options.desk.release(this.holder(conn)).catch(() => {});
    if (conn.key) this.store.seen(conn.key);
    this.changed();
  }

  // ── Frames ────────────────────────────────────────────────────────────────

  private holder(conn: Conn): string {
    return `phone:${conn.id}`;
  }

  /** A call: checked against the list, answered with what the window's API returns, or a few words. */
  private async frame(conn: Conn, bytes: Uint8Array): Promise<void> {
    const message = objectOf(bytes);
    if (!message) return this.end(conn, CLOSE.refused, 'Not JSON');
    const { id } = message;
    // Without an ID there is nobody to answer.
    if (typeof id !== 'number' && typeof id !== 'string') return;
    const checked = checkCall(message.call, message.args);
    if (!checked.ok) return this.send(conn, { id, error: checked.error });
    const { call, args, projectId } = checked;
    if (projectId !== null && !this.options.desk.knows(projectId)) return this.send(conn, { id, error: UNKNOWN_PROJECT });
    if (call === 'closeBoard') this.unsubscribe(conn, projectId!);
    let value: unknown;
    try {
      value = await this.options.desk.call(this.holder(conn), call, args);
    } catch (err) {
      return this.send(conn, { id, error: words(err) });
    }
    if (call === 'openBoard' && (value as Result).ok && !conn.closing) conn.boards.add(projectId!);
    this.send(conn, { id, value: value ?? null });
  }

  private unsubscribe(conn: Conn, projectId: string): void {
    conn.boards.delete(projectId);
    const pace = conn.pace.get(projectId);
    if (pace?.timer) clearTimeout(pace.timer);
    conn.pace.delete(projectId);
  }

  /** At most one `board` event per board every `boardMs`: the first at once, then the latest when the time is up. */
  private pace(conn: Conn, snapshot: BoardSnapshot): void {
    const projectId = snapshot.projectId;
    let pace = conn.pace.get(projectId);
    if (!pace) {
      pace = { last: 0, timer: null, latest: null };
      conn.pace.set(projectId, pace);
    }
    pace.latest = snapshot;
    if (pace.timer) return;
    const flush = (p: Pace) => {
      p.timer = null;
      const latest = p.latest;
      p.latest = null;
      if (!latest || !conn.boards.has(projectId)) return;
      p.last = Date.now();
      this.send(conn, { event: 'board', snapshot: latest });
    };
    const wait = pace.last + this.limits.boardMs - Date.now();
    if (wait <= 0) flush(pace);
    else pace.timer = setTimeout(flush, wait, pace);
  }

  /** One frame to a linked phone, sealed and sent in chunks; the chunks go out in order with no await between. */
  private send(conn: Conn, frame: Record<string, unknown>): void {
    if (!conn.session || conn.ws.readyState !== WebSocket.OPEN) return;
    let sealed: Uint8Array[];
    try {
      sealed = sealFrame(conn.session.send, encoder.encode(JSON.stringify(frame)));
    } catch {
      // Over the largest frame: an answer says so, an event is dropped.
      if ('id' in frame && !('error' in frame)) this.send(conn, { id: frame.id, error: 'Too large' });
      return;
    }
    for (const chunk of sealed) conn.ws.send(chunk, { binary: true });
  }

  private changed(): void {
    this.options.onChange?.(this.view());
  }
}
