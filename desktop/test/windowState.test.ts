/**
 * Window placement (task-25): restore saved bounds only while they still
 * meet a connected display. Pure functions, so plain `node --test` runs them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  parsePlacement,
  readPlacement,
  resolvePlacement,
  writePlacement,
  type DisplayRect,
  type WindowPlacement,
} from '../src/main/windowState.ts';

const primary: DisplayRect = { x: 0, y: 0, width: 1920, height: 1080 };
const left: DisplayRect = { x: -1440, y: 0, width: 1440, height: 900 };

function placed(over: Partial<WindowPlacement> = {}): WindowPlacement {
  return { x: 120, y: 80, width: 1200, height: 800, maximized: false, fullscreen: false, ...over };
}

test('a placement that still overlaps a display is restored, including maximized and fullscreen', () => {
  const saved = placed({ maximized: true });
  const restored = resolvePlacement(saved, [primary]);
  assert.deepEqual(restored, {
    width: 1200,
    height: 800,
    position: { x: 120, y: 80 },
    maximized: true,
    fullscreen: false,
  });
  // x -1300, width 1200 ends at -100, so it meets only the left display.
  assert.equal(resolvePlacement(placed({ x: -1300, fullscreen: true }), [primary, left]).fullscreen, true);
});

test('a placement on a display that is no longer connected falls back to the centered default', () => {
  const unplugged = placed({ x: -1300, y: 40, maximized: true, fullscreen: true });
  const restored = resolvePlacement(unplugged, [primary]);
  assert.deepEqual(restored, {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    maximized: false,
    fullscreen: false,
  });
  assert.equal(restored.position, undefined);
});

test('a resolution change that leaves the window off every display uses the default', () => {
  const wasOnAWiderDesktop = placed({ x: 2000, y: 100, width: 800, height: 600 });
  assert.equal(resolvePlacement(wasOnAWiderDesktop, [primary]).position, undefined);
  // Still overlapping the narrower display: keep it.
  assert.deepEqual(resolvePlacement(placed({ x: 1600, width: 800 }), [primary]).position, { x: 1600, y: 80 });
});

test('touching an edge is not on the display; a missing or corrupt file is not a placement', () => {
  assert.equal(resolvePlacement(placed({ x: 1920 }), [primary]).position, undefined);
  assert.equal(parsePlacement(null), null);
  assert.equal(parsePlacement({ x: 0, y: 0, width: 0, height: 800 }), null);
  assert.equal(parsePlacement({ x: '0', y: 0, width: 800, height: 600 }), null);
});

test('placement round-trips through the state file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-window-'));
  const file = path.join(dir, 'window.json');
  const saved = placed({ x: -200, y: 40, maximized: true });
  writePlacement(file, saved);
  assert.deepEqual(readPlacement(file), saved);
  assert.equal(readPlacement(path.join(dir, 'missing.json')), null);
});
