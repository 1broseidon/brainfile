import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { tuiCommand } from '../commands/tui';
import { render } from 'ink';
import { shouldSuggestV2Migration, markV2MigrationHintShown } from '../utils/v2-detect';

jest.mock('ink', () => ({
  render: jest.fn(() => ({
    waitUntilExit: () => Promise.resolve(),
  })),
}));

jest.mock('../utils/v2-detect', () => ({
  shouldSuggestV2Migration: jest.fn(() => true),
  markV2MigrationHintShown: jest.fn(),
}));

describe('tui command', () => {
  let tempDir: string;
  let originalIsTTY: boolean | undefined;
  let originalSetRawMode: ((mode: boolean) => void) | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-tui-test-'));
    originalIsTTY = (process.stdin as any).isTTY;
    originalSetRawMode = (process.stdin as any).setRawMode;

    (process.stdin as any).isTTY = true;
    (process.stdin as any).setRawMode = jest.fn();
  });

  afterEach(() => {
    (process.stdin as any).isTTY = originalIsTTY;
    (process.stdin as any).setRawMode = originalSetRawMode;
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it('shows soft migration warning before launching TUI for legacy layouts', async () => {
    const brainfilePath = path.join(tempDir, 'brainfile.md');
    fs.writeFileSync(brainfilePath, '---\ncolumns: []\n---\n', 'utf-8');

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await tuiCommand({ file: brainfilePath });

    expect(shouldSuggestV2Migration).toHaveBeenCalled();
    expect(markV2MigrationHintShown).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
    expect(logSpy.mock.calls.flat().join(' ')).toContain('brainfile migrate');

    writeSpy.mockRestore();
    logSpy.mockRestore();
  });
});
