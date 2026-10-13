/**
 * The sealed channel (link.md): the same tests as brainfile-mobile's
 * tests/noise.test.ts, against the same vectors, so the desk's copy of
 * src/link/noise.ts is held to the Noise protocol's IK vector and Hotline's.
 * Only the import differs: the desk's runner loads it bundled (bundle.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { bundled } from './bundle.ts';

const {
  FrameReader,
  fromBase64Url,
  Initiator,
  keyPair,
  MAX_CHUNK,
  Responder,
  sealFrame,
  SealedError,
  toBase64Url,
} = bundled<typeof import('../src/link/noise.ts')>('src/link/noise.ts');

const hex = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const json = (name: string) =>
  JSON.parse(readFileSync(new URL(`./vectors/${name}`, import.meta.url), 'utf8'));

test('the Noise protocol’s own IK vector, both halves and the transport after', () => {
  const v = json('noise-ik.json')[0];
  const messages: { payload: string; ciphertext: string }[] = v.messages;
  const initiator = new Initiator(
    keyPair(hex(v.init_static)),
    hex(v.init_remote_static),
    keyPair(hex(v.init_ephemeral)),
    hex(v.init_prologue),
  );
  const responder = new Responder(
    keyPair(hex(v.resp_static)),
    keyPair(hex(v.resp_ephemeral)),
    hex(v.resp_prologue),
  );
  const m1 = initiator.writeMessage1(hex(messages[0].payload));
  assert.equal(toHex(m1), messages[0].ciphertext);
  const first = responder.readMessage1(m1);
  assert.equal(toHex(first.payload), messages[0].payload);
  assert.equal(toHex(first.remoteStatic), toHex(keyPair(hex(v.init_static)).public));
  const second = responder.writeMessage2(hex(messages[1].payload));
  assert.equal(toHex(second.message), messages[1].ciphertext);
  const back = initiator.readMessage2(second.message);
  assert.equal(toHex(back.payload), messages[1].payload);
  assert.equal(toHex(back.session.hash), v.handshake_hash);
  assert.equal(toHex(second.session.hash), v.handshake_hash);
  // After the handshake the initiator speaks first, then they take turns.
  for (const [i, m] of messages.slice(2).entries()) {
    const [from, to] =
      i % 2 === 0 ? [back.session, second.session] : [second.session, back.session];
    const sealed = from.send.encrypt(hex(m.payload));
    assert.equal(toHex(sealed), m.ciphertext);
    assert.equal(toHex(to.receive.decrypt(sealed)), m.payload);
  }
});

test('Hotline’s vector: the same channel with its prologue, and a frame’s flag byte', () => {
  const v = json('hotline-ik.json');
  const device = new Initiator(
    keyPair(hex(v.device_static_private_key_hex)),
    hex(v.desk_static_public_key_hex),
    keyPair(hex(v.device_ephemeral_private_key_hex)),
    hex(v.prologue_hex),
  );
  const desk = new Responder(
    keyPair(hex(v.desk_static_private_key_hex)),
    keyPair(hex(v.desk_ephemeral_private_key_hex)),
    hex(v.prologue_hex),
  );
  const m1 = device.writeMessage1();
  assert.equal(toHex(m1), v.message_1_hex);
  desk.readMessage1(m1);
  const { message, session: deskSide } = desk.writeMessage2();
  assert.equal(toHex(message), v.message_2_hex);
  const { session: phoneSide } = device.readMessage2(message);
  assert.equal(toHex(phoneSide.hash), v.handshake_hash_hex);
  const [up] = sealFrame(phoneSide.send, Buffer.from(v.initiator_first_transport_text_utf8));
  assert.equal(toHex(up), v.initiator_first_transport_ciphertext_hex);
  const [down] = sealFrame(deskSide.send, Buffer.from(v.responder_first_transport_text_utf8));
  assert.equal(toHex(down), v.responder_first_transport_ciphertext_hex);
  assert.equal(
    Buffer.from(new FrameReader(deskSide.receive).push(up)!).toString(),
    v.initiator_first_transport_text_utf8,
  );
});

test('a large frame goes in chunks and comes back whole', () => {
  const desk = keyPair(randomBytes(32));
  const phone = new Initiator(keyPair(randomBytes(32)), desk.public, keyPair(randomBytes(32)));
  const responder = new Responder(desk, keyPair(randomBytes(32)));
  responder.readMessage1(phone.writeMessage1());
  const { message, session: deskSide } = responder.writeMessage2();
  const { session: phoneSide } = phone.readMessage2(message);
  const frame = randomBytes(MAX_CHUNK * 2 + 10);
  const sealed = sealFrame(deskSide.send, frame);
  assert.equal(sealed.length, 3);
  const reader = new FrameReader(phoneSide.receive);
  assert.equal(reader.push(sealed[0]), null);
  assert.equal(reader.push(sealed[1]), null);
  assert.deepEqual(Buffer.from(reader.push(sealed[2])!), frame);
  // An empty frame is still one message.
  assert.equal(sealFrame(deskSide.send, new Uint8Array(0)).length, 1);
});

test('a desk without the key from the QR never finishes the handshake', () => {
  const real = keyPair(randomBytes(32));
  const impostor = keyPair(randomBytes(32));
  const phone = new Initiator(keyPair(randomBytes(32)), real.public, keyPair(randomBytes(32)));
  const m1 = phone.writeMessage1(new TextEncoder().encode('{"pair":"x"}'));
  // The impostor cannot even read the phone's first message.
  assert.throws(
    () => new Responder(impostor, keyPair(randomBytes(32))).readMessage1(m1),
    SealedError,
  );
  // Nor forge the second: a reply sealed by a desk that never saw message one is refused.
  const other = new Initiator(keyPair(randomBytes(32)), impostor.public, keyPair(randomBytes(32)));
  const fake = new Responder(impostor, keyPair(randomBytes(32)));
  fake.readMessage1(other.writeMessage1());
  assert.throws(() => phone.readMessage2(fake.writeMessage2().message), SealedError);
});

test('a tampered message does not open', () => {
  const desk = keyPair(randomBytes(32));
  const phone = new Initiator(keyPair(randomBytes(32)), desk.public, keyPair(randomBytes(32)));
  const responder = new Responder(desk, keyPair(randomBytes(32)));
  responder.readMessage1(phone.writeMessage1());
  const { message, session: deskSide } = responder.writeMessage2();
  const { session: phoneSide } = phone.readMessage2(message);
  const [sealed] = sealFrame(phoneSide.send, new TextEncoder().encode('{"id":1}'));
  sealed[5] ^= 1;
  assert.throws(() => new FrameReader(deskSide.receive).push(sealed), SealedError);
});

test('keys travel as unpadded base64url', () => {
  for (const n of [0, 1, 2, 3, 31, 32, 33]) {
    const data = randomBytes(n);
    const text = toBase64Url(data);
    assert.equal(text, Buffer.from(data).toString('base64url'));
    assert.deepEqual(Buffer.from(fromBase64Url(text)), data);
  }
  assert.throws(() => fromBase64Url('a+b/'), SealedError);
});
