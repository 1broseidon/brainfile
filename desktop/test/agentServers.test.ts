/**
 * Custom agents (task-47): the person's own ACP servers, in Zed's
 * agent_servers shape, as the window edits them: their IDs, how an entry is
 * cleaned, and pasting across from Zed's settings. How they are kept in
 * dispatch.json and started is core's (@brainfile/core/dispatch), tested there
 * (core/src/__tests__/dispatch-agents.test.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  argsFrom,
  argsText,
  cleanServers,
  commandName,
  customId,
  customName,
  envFrom,
  envText,
  isCustom,
  pastedServers,
} from '../src/shared/agentServers.ts';

test('a custom agent’s ID is its name under custom:', () => {
  const id = customId('Muse Code');
  assert.equal(id, 'custom:Muse Code');
  assert.equal(isCustom(id), true);
  assert.equal(isCustom('claude'), false);
  assert.equal(customName(id), 'Muse Code');
});

test('an entry is cleaned as it is read: strings only, Zed’s other keys let go, no command no entry', () => {
  assert.deepEqual(
    cleanServers({
      'Muse Code': { type: 'custom', command: 'muse-acp', args: ['--port', 8080, true, null, { x: 1 }], env: { A: 'a', N: 1, O: {} }, default_mode: 'ask' },
      Registry: { type: 'registry' },
      Broken: 'muse-acp',
      'Bad\nName': { command: 'x' },
    }),
    { 'Muse Code': { command: 'muse-acp', args: ['--port', '8080', 'true'], env: { A: 'a', N: '1' } } }
  );
  assert.deepEqual(cleanServers(null), {});
  assert.deepEqual(cleanServers(['muse-acp']), {});
});

test('Zed’s settings paste across: the whole file with comments, the block, the map, or one entry', () => {
  const want = { 'Muse Code': { command: 'muse-acp', args: [], env: {} } };
  const zed = `// Zed settings
{
  "theme": "One Dark", // the theme
  /* the agents */
  "agent_servers": {
    "Muse Code": {
      "type": "custom",
      "command": "muse-acp",
      "args": [],
      "env": {},
    },
  },
}`;
  for (const text of [
    zed,
    '"agent_servers": { "Muse Code": { "command": "muse-acp", "args": [], "env": {} } }',
    '{ "Muse Code": { "command": "muse-acp" } }',
    '"Muse Code": { "command": "muse-acp", "args": [], "env": {} },',
  ]) {
    assert.deepEqual(pastedServers(text), { ok: true, value: want }, text);
  }
  // A URL in a string is not a comment.
  assert.deepEqual(pastedServers('"Remote": { "command": "muse", "args": ["--url", "http://localhost:1/x"] }'), {
    ok: true,
    value: { Remote: { command: 'muse', args: ['--url', 'http://localhost:1/x'], env: {} } },
  });
});

test('a paste Brainfile cannot use says why', () => {
  const error = (text: string) => {
    const result = pastedServers(text);
    return result.ok ? '' : result.error;
  };
  assert.match(error(''), /Paste an entry/);
  assert.match(error('not json at all'), /not JSON/);
  assert.match(error('{ "command": "muse-acp" }'), /its name/);
  assert.match(error('{ "agent_servers": { "Registry": { "type": "registry" } } }'), /No entry with a command/);
});

test('the editor’s arguments are one a line, and its environment KEY=value', () => {
  assert.deepEqual(argsFrom('--acp\n\n  --model opus  \n'), ['--acp', '--model opus']);
  assert.equal(argsText(['--acp', '--model opus']), '--acp\n--model opus');
  assert.deepEqual(envFrom('MUSE_KEY=a=b\n\n LEVEL = 2\nEMPTY='), { ok: true, value: { MUSE_KEY: 'a=b', LEVEL: ' 2', EMPTY: '' } });
  assert.equal(envText({ MUSE_KEY: 'a=b', EMPTY: '' }), 'MUSE_KEY=a=b\nEMPTY=');
  const bad = envFrom('MUSE_KEY');
  assert.equal(bad.ok, false);
  assert.equal(envFrom('1X=y').ok, false);
});

test('a command is named by its file, not the folders before it', () => {
  assert.equal(commandName('/usr/local/bin/muse-acp'), 'muse-acp');
  assert.equal(commandName('muse-acp'), 'muse-acp');
});
