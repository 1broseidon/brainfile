/**
 * What the desk keeps for the phone link (brainfile-mobile docs/link.md,
 * Trust), in one file in the app's data, link.json: the desk's static X25519
 * key, made once and sealed by the Keychain (Electron safeStorage); a stable
 * desk id; the port it listens on; the switch; and the linked phones. The
 * key is only made when the link is first wanted, so a desk that never links
 * a phone has no file. Sealing is passed in, so plain node runs it.
 */
import { randomBytes, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fromBase64Url, keyPair, toBase64Url, type KeyPair } from './noise';
import type { LinkedPhone } from '../shared/api';

/** Where the desk listens unless that port was taken, and then the next free one is remembered. */
export const LINK_PORT = 47210;

/** How the desk's secret key is kept at rest: the Keychain's care in the app, nothing in a test. */
export interface Sealer {
  seal(text: string): Buffer;
  open(sealed: Buffer): string;
}

interface LinkFile {
  desk: string;
  /** The desk's static secret key, sealed, as base64. */
  key?: string;
  port: number;
  on: boolean;
  phones: LinkedPhone[];
}

export class LinkStore {
  private data: LinkFile;
  private pair: KeyPair | null = null;

  constructor(
    private readonly file: string,
    private readonly sealer: Sealer
  ) {
    this.data = this.read();
  }

  /** Stable across restarts: the phone knows its desk by it. */
  get deskId(): string {
    return this.data.desk;
  }

  get port(): number {
    return this.data.port;
  }

  set port(port: number) {
    if (port === this.data.port) return;
    this.data.port = port;
    this.write();
  }

  get on(): boolean {
    return this.data.on;
  }

  set on(on: boolean) {
    if (on === this.data.on) return;
    this.data.on = on;
    this.write();
  }

  /**
   * The desk's static key pair, made on first use from 32 random bytes. A key
   * that no longer opens (the Keychain was reset) is replaced, and the phones
   * linked to the old one go with it: they could not reach this desk anyway.
   * While nothing can be sealed (the Keychain is unavailable) this throws and
   * changes nothing.
   */
  key(): KeyPair {
    if (this.pair) return this.pair;
    if (this.data.key) {
      try {
        this.pair = keyPair(fromBase64Url(this.sealer.open(Buffer.from(this.data.key, 'base64'))));
        return this.pair;
      } catch {
        // Replaced below, if a new one can be sealed.
      }
    }
    const pair = keyPair(new Uint8Array(randomBytes(32)));
    const sealed = this.sealer.seal(toBase64Url(pair.secret)).toString('base64');
    if (this.data.key) this.data.phones = [];
    this.data.key = sealed;
    this.write();
    this.pair = pair;
    return pair;
  }

  phones(): LinkedPhone[] {
    return this.data.phones.map((phone) => ({ ...phone }));
  }

  phone(key: string): LinkedPhone | undefined {
    return this.data.phones.find((phone) => phone.key === key);
  }

  /** A phone let in by a pairing: kept, or its name and date renewed if it was linked before. */
  link(key: string, name: string, now = Date.now()): LinkedPhone {
    const phone: LinkedPhone = { key, name, pairedAt: now, lastSeen: now };
    this.data.phones = [...this.data.phones.filter((p) => p.key !== key), phone];
    this.write();
    return phone;
  }

  seen(key: string, now = Date.now()): void {
    const phone = this.data.phones.find((p) => p.key === key);
    if (!phone) return;
    phone.lastSeen = now;
    this.write();
  }

  forget(key: string): boolean {
    const before = this.data.phones.length;
    this.data.phones = this.data.phones.filter((p) => p.key !== key);
    if (this.data.phones.length === before) return false;
    this.write();
    return true;
  }

  private read(): LinkFile {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<LinkFile>;
      return {
        desk: typeof parsed.desk === 'string' && parsed.desk ? parsed.desk : randomUUID(),
        ...(typeof parsed.key === 'string' ? { key: parsed.key } : {}),
        port: Number.isInteger(parsed.port) && parsed.port! > 0 && parsed.port! < 65_536 ? parsed.port! : LINK_PORT,
        on: parsed.on === true,
        phones: Array.isArray(parsed.phones) ? parsed.phones.filter(isPhone) : [],
      };
    } catch {
      return { desk: randomUUID(), port: LINK_PORT, on: false, phones: [] };
    }
  }

  private write(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify(this.data, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  }
}

function isPhone(value: unknown): value is LinkedPhone {
  const phone = value as LinkedPhone;
  return !!phone && typeof phone.key === 'string' && typeof phone.name === 'string' && typeof phone.pairedAt === 'number' && typeof phone.lastSeen === 'number';
}
