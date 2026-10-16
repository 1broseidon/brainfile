/**
 * The first word of `brainfile <word>` is a command or a board's path
 * (cli.ts): every command the program registers is in SUBCOMMANDS, or
 * `brainfile agents` beside an agents/ folder opens the TUI on it.
 */
import { describe, test, expect } from '@jest/globals';
import { SUBCOMMANDS, createProgram } from '../program';

describe('SUBCOMMANDS', () => {
  test('names every command the program registers', () => {
    const registered = createProgram().commands.map((c) => c.name());
    expect(registered.length).toBeGreaterThan(40);
    expect(registered.filter((name) => !SUBCOMMANDS.includes(name))).toEqual([]);
  });

  test('names the hand-off commands', () => {
    for (const name of ['dispatch', 'run', 'discuss', 'review', 'land', 'discard', 'agents', 'pr']) expect(SUBCOMMANDS).toContain(name);
  });
});
