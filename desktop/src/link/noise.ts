/**
 * The sealed channel between a phone and its desktop (docs/link.md):
 * `Noise_IK_25519_ChaChaPoly_SHA256`, the phone as initiator. The desk's
 * static key comes from the QR, so a desk that cannot prove it holds that
 * key never finishes the handshake; the network under it is only a carrier.
 *
 * Pure TypeScript on @noble, so the phone (Hermes) and the desktop (Node)
 * run the same code. This file is kept identical in brainfile-mobile
 * (src/link/noise.ts) and the desktop (desktop/src/link/noise.ts); the
 * tests check it against the Noise protocol's IK vectors and Hotline's.
 */
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const PROTOCOL = 'Noise_IK_25519_ChaChaPoly_SHA256';
/** Mixed into every handshake, so a Hotline desk and a Brainfile desk never mistake each other. */
export const PROLOGUE = 'brainfile-link/1';
/** Noise's ceiling for one message, tag included. */
export const MAX_MESSAGE = 65_535;
const TAG = 16;
const DH_LEN = 32;
/** One transport message carries a flag byte and a chunk: 1 is a frame's last chunk, 0 more to come. */
export const MAX_CHUNK = MAX_MESSAGE - TAG - 1;
/** The most one reassembled frame may be. */
export const MAX_FRAME = 16 * 1_048_576;

export class SealedError extends Error {}

export interface KeyPair {
  secret: Uint8Array;
  public: Uint8Array;
}

/** A key pair from 32 random bytes (the caller's randomness: SecureRandom on a phone, node:crypto on a desk). */
export function keyPair(secret: Uint8Array): KeyPair {
  if (secret.length !== DH_LEN) throw new SealedError('A key is 32 bytes');
  return { secret, public: x25519.getPublicKey(secret) };
}

function dh(secret: Uint8Array, remote: Uint8Array): Uint8Array {
  if (remote.length !== DH_LEN) throw new SealedError('A key is 32 bytes');
  try {
    return x25519.getSharedSecret(secret, remote);
  } catch {
    // A low-order point gives an all-zero secret; noble refuses it, and so do we.
    throw new SealedError('Bad key');
  }
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const ONE = new Uint8Array([1]);
const TWO = new Uint8Array([2]);

function hkdf2(ck: Uint8Array, ikm: Uint8Array): [Uint8Array, Uint8Array] {
  const temp = hmac(sha256, ck, ikm);
  const a = hmac(sha256, temp, ONE);
  const b = hmac(sha256, temp, concat(a, TWO));
  return [a, b];
}

/** A Noise CipherState: one key and a counting nonce, 32 zero bits then the count little-endian. */
export class CipherState {
  private n = 0n;
  constructor(private readonly key: Uint8Array) {}

  private nonce(): Uint8Array {
    if (this.n >= 0xffff_ffff_ffff_ffffn) throw new SealedError('Out of nonces; reconnect');
    const out = new Uint8Array(12);
    new DataView(out.buffer).setBigUint64(4, this.n, true);
    this.n += 1n;
    return out;
  }

  encrypt(plaintext: Uint8Array, ad: Uint8Array = new Uint8Array(0)): Uint8Array {
    return chacha20poly1305(this.key, this.nonce(), ad).encrypt(plaintext);
  }

  decrypt(ciphertext: Uint8Array, ad: Uint8Array = new Uint8Array(0)): Uint8Array {
    if (ciphertext.length < TAG) throw new SealedError('Could not open a message');
    const nonce = this.nonce();
    try {
      return chacha20poly1305(this.key, nonce, ad).decrypt(ciphertext);
    } catch {
      throw new SealedError('Could not open a message');
    }
  }
}

/** The SymmetricState of the handshake. */
class Symmetric {
  h: Uint8Array;
  ck: Uint8Array;
  private k: CipherState | null = null;

  constructor(prologue: Uint8Array) {
    const name = new TextEncoder().encode(PROTOCOL);
    // The name is exactly HASHLEN bytes, so it is h as it is.
    this.h = name.length === 32 ? name : sha256(name);
    this.ck = this.h;
    this.mixHash(prologue);
  }

  mixHash(data: Uint8Array): void {
    this.h = sha256(concat(this.h, data));
  }

  mixKey(ikm: Uint8Array): void {
    const [ck, k] = hkdf2(this.ck, ikm);
    this.ck = ck;
    this.k = new CipherState(k);
  }

  encryptAndHash(plaintext: Uint8Array): Uint8Array {
    const out = this.k ? this.k.encrypt(plaintext, this.h) : plaintext;
    this.mixHash(out);
    return out;
  }

  decryptAndHash(ciphertext: Uint8Array): Uint8Array {
    const out = this.k ? this.k.decrypt(ciphertext, this.h) : ciphertext;
    this.mixHash(ciphertext);
    return out;
  }

  split(): [CipherState, CipherState] {
    const [a, b] = hkdf2(this.ck, new Uint8Array(0));
    return [new CipherState(a), new CipherState(b)];
  }
}

/** The channel once the handshake is done: one cipher each way, and the handshake's hash. */
export interface Session {
  send: CipherState;
  receive: CipherState;
  hash: Uint8Array;
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** The phone's half: `-> e, es, s, ss` then `<- e, ee, se`. */
export class Initiator {
  private readonly sym: Symmetric;
  private step = 0;

  constructor(
    private readonly s: KeyPair,
    private readonly rs: Uint8Array,
    private readonly e: KeyPair,
    prologue: Uint8Array = bytes(PROLOGUE),
  ) {
    if (rs.length !== DH_LEN) throw new SealedError('The desk key is invalid');
    this.sym = new Symmetric(prologue);
    this.sym.mixHash(rs);
  }

  writeMessage1(payload: Uint8Array = new Uint8Array(0)): Uint8Array {
    if (this.step++ !== 0) throw new SealedError('Out of order');
    this.sym.mixHash(this.e.public);
    this.sym.mixKey(dh(this.e.secret, this.rs));
    const s = this.sym.encryptAndHash(this.s.public);
    this.sym.mixKey(dh(this.s.secret, this.rs));
    const sealed = this.sym.encryptAndHash(payload);
    return concat(this.e.public, s, sealed);
  }

  readMessage2(message: Uint8Array): { payload: Uint8Array; session: Session } {
    if (this.step++ !== 1) throw new SealedError('Out of order');
    if (message.length < DH_LEN + TAG) throw new SealedError('The desk could not prove who it is');
    try {
      const re = message.subarray(0, DH_LEN);
      this.sym.mixHash(re);
      this.sym.mixKey(dh(this.e.secret, re));
      this.sym.mixKey(dh(this.s.secret, re));
      const payload = this.sym.decryptAndHash(message.subarray(DH_LEN));
      const [send, receive] = this.sym.split();
      return { payload, session: { send, receive, hash: this.sym.h } };
    } catch {
      throw new SealedError('The desk could not prove who it is');
    }
  }
}

/** The desk's half: reads `e, es, s, ss`, learns the phone's key, then writes `e, ee, se`. */
export class Responder {
  private readonly sym: Symmetric;
  private re: Uint8Array | null = null;
  private rs: Uint8Array | null = null;
  private step = 0;

  constructor(
    private readonly s: KeyPair,
    private readonly e: KeyPair,
    prologue: Uint8Array = bytes(PROLOGUE),
  ) {
    this.sym = new Symmetric(prologue);
    this.sym.mixHash(s.public);
  }

  /** The phone's static key comes back with the payload: who is asking, proven. */
  readMessage1(message: Uint8Array): { payload: Uint8Array; remoteStatic: Uint8Array } {
    if (this.step++ !== 0) throw new SealedError('Out of order');
    if (message.length < DH_LEN + DH_LEN + TAG + TAG) throw new SealedError('Not a handshake');
    try {
      const re = message.subarray(0, DH_LEN);
      this.sym.mixHash(re);
      this.sym.mixKey(dh(this.s.secret, re));
      const rs = this.sym.decryptAndHash(message.subarray(DH_LEN, DH_LEN + DH_LEN + TAG));
      this.sym.mixKey(dh(this.s.secret, rs));
      const payload = this.sym.decryptAndHash(message.subarray(DH_LEN + DH_LEN + TAG));
      this.re = re;
      this.rs = rs;
      return { payload, remoteStatic: rs };
    } catch {
      throw new SealedError('Not a handshake');
    }
  }

  writeMessage2(payload: Uint8Array = new Uint8Array(0)): {
    message: Uint8Array;
    session: Session;
  } {
    if (this.step++ !== 1 || !this.re || !this.rs) throw new SealedError('Out of order');
    this.sym.mixHash(this.e.public);
    this.sym.mixKey(dh(this.e.secret, this.re));
    this.sym.mixKey(dh(this.e.secret, this.rs));
    const sealed = this.sym.encryptAndHash(payload);
    const [receive, send] = this.sym.split();
    return { message: concat(this.e.public, sealed), session: { send, receive, hash: this.sym.h } };
  }
}

/** One frame, sealed as transport messages: each a flag byte (1 last, 0 more) and a chunk. */
export function sealFrame(cipher: CipherState, frame: Uint8Array): Uint8Array[] {
  if (frame.length > MAX_FRAME) throw new SealedError('A message is too large');
  const out: Uint8Array[] = [];
  let at = 0;
  do {
    const chunk = frame.subarray(at, at + MAX_CHUNK);
    at += chunk.length;
    out.push(cipher.encrypt(concat(new Uint8Array([at >= frame.length ? 1 : 0]), chunk)));
  } while (at < frame.length);
  return out;
}

/** Opens transport messages in order and gives back each frame once its last chunk is in. */
export class FrameReader {
  private parts: Uint8Array[] = [];
  private size = 0;

  constructor(private readonly cipher: CipherState) {}

  push(message: Uint8Array): Uint8Array | null {
    if (message.length > MAX_MESSAGE) throw new SealedError('A message is too large');
    const plain = this.cipher.decrypt(message);
    const flag = plain[0];
    if (flag !== 0 && flag !== 1) throw new SealedError('Could not open a message');
    const chunk = plain.subarray(1);
    this.size += chunk.length;
    if (this.size > MAX_FRAME) throw new SealedError('A message is too large');
    this.parts.push(chunk);
    if (flag === 0) return null;
    const frame = concat(...this.parts);
    this.parts = [];
    this.size = 0;
    return frame;
  }
}

/** 32 bytes as unpadded base64url, as keys and secrets travel in a QR. */
export function toBase64Url(data: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < data.length; i += 3) {
    const n = (data[i] << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((data.length - i) * 8) / 6));
    for (let j = 0; j < chars; j++) out += alphabet[(n >> (18 - 6 * j)) & 63];
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1)
    throw new SealedError('Not base64url');
  const value = (c: string) => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return code - 65;
    if (code >= 97 && code <= 122) return code - 71;
    if (code >= 48 && code <= 57) return code + 4;
    return c === '-' ? 62 : 63;
  };
  const out = new Uint8Array(Math.floor((text.length * 6) / 8));
  let bits = 0;
  let acc = 0;
  let at = 0;
  for (const c of text) {
    acc = (acc << 6) | value(c);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}
