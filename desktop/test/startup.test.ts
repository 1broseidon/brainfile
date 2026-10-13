/**
 * Stop during a run's startup (task-39): the startup is aborted, a session
 * that opens anyway is closed, and the run is never handed its prompt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Startups, unlessAborted } from '../src/agents/startup.ts';

/** A promise and the hands to settle it, for an agent that takes its time to start. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

test('a startup nobody stops opens its session', async () => {
  const startups = new Startups();
  const closed: string[] = [];
  const session = await startups.open('run-1', async () => 'session', (s) => closed.push(s));
  assert.equal(session, 'session');
  assert.deepEqual(closed, []);
  assert.equal(startups.starting('run-1'), false);
});

test('stop aborts a startup still under way, and the session is never handed over', async () => {
  const startups = new Startups();
  const launch = deferred<string>();
  let seen: AbortSignal | undefined;
  const opening = startups.open('run-1', (signal) => ((seen = signal), unlessAborted(signal, launch.promise)), () => {});
  assert.equal(startups.starting('run-1'), true);
  assert.equal(startups.stop('run-1'), true);
  assert.equal(seen?.aborted, true);
  assert.equal(await opening, null);
  assert.equal(startups.starting('run-1'), false);
});

test('a session that opens after the stop is closed, not returned', async () => {
  const startups = new Startups();
  const launch = deferred<string>();
  const closed: string[] = [];
  // An open that does not listen to its signal: it finishes regardless.
  const opening = startups.open('run-1', () => launch.promise, (s) => closed.push(s));
  startups.stop('run-1');
  launch.resolve('late session');
  assert.equal(await opening, null);
  assert.deepEqual(closed, ['late session']);
});

test('a startup that fails because it was stopped is a stop, not a failure', async () => {
  const startups = new Startups();
  const launch = deferred<string>();
  const opening = startups.open('run-1', () => launch.promise, () => {});
  startups.stop('run-1');
  launch.reject(new Error('Codex stopped'));
  assert.equal(await opening, null);
});

test('a startup that fails on its own still fails', async () => {
  const startups = new Startups();
  await assert.rejects(
    startups.open('run-1', async () => {
      throw new Error('Codex is not installed on this Mac');
    }, () => {}),
    /not installed/
  );
  assert.equal(startups.starting('run-1'), false);
});

test('stop reaches only a run that is starting', async () => {
  const startups = new Startups();
  const launch = deferred<string>();
  const opening = startups.open('run-1', (signal) => unlessAborted(signal, launch.promise), () => {});
  assert.equal(startups.stop('run-2'), false);
  launch.resolve('session');
  assert.equal(await opening, 'session');
  assert.equal(startups.stop('run-1'), false);
});

test('unlessAborted settles as its promise does until the signal aborts', async () => {
  assert.equal(await unlessAborted(undefined, Promise.resolve(1)), 1);
  const controller = new AbortController();
  assert.equal(await unlessAborted(controller.signal, Promise.resolve(2)), 2);
  const never = new Promise<number>(() => {});
  const waiting = unlessAborted(controller.signal, never);
  controller.abort(new Error('stopped'));
  await assert.rejects(waiting, /stopped/);
  await assert.rejects(unlessAborted(controller.signal, Promise.resolve(3)), /stopped/);
});
