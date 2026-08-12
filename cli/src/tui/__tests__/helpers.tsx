import React from 'react';
import { render } from 'ink-testing-library';
import { BrainfileTUI } from '../BrainfileTUI.js';
import { createFixtureBoard, type FixtureBoard } from './fixture-board.js';

export const ESC = '';
export const TAB = '\t';
export const ENTER = '\r';
export const SPACE = ' ';

/** Terminal widths either side of the design's 110-column detail breakpoint. */
export const WIDE = 120;
export const NARROW = 90;

export async function tick(ms = 120): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export interface Harness {
  app: ReturnType<typeof render>;
  fixture: FixtureBoard;
  /** Send keys one at a time, letting the app settle between each. */
  press(...keys: string[]): Promise<void>;
  frame(): string;
  teardown(): void;
}

/**
 * Mount the TUI against a throwaway v2 board at a pinned terminal size, already
 * focused on the `To Do` column (index 1) — the column the design mockups show.
 */
export async function mount(
  width = WIDE,
  height = 26,
  { column = 1 }: { column?: number } = {},
): Promise<Harness> {
  const fixture = createFixtureBoard();
  const app = render(<BrainfileTUI filePath={fixture.brainfilePath} width={width} height={height} />);
  await tick(200);

  const harness: Harness = {
    app,
    fixture,
    async press(...keys: string[]) {
      for (const key of keys) {
        app.stdin.write(key);
        await tick();
      }
    },
    frame: () => app.lastFrame() ?? '',
    teardown: () => {
      app.unmount();
      fixture.cleanup();
    },
  };

  for (let i = 0; i < column; i += 1) await harness.press(TAB);
  return harness;
}
