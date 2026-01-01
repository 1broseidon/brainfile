import * as fs from 'fs';
import * as path from 'path';

describe('contract badge prop wiring (TaskList + StackedTaskList)', () => {
  const srcRoot = path.join(__dirname, '..');

  function read(relPathFromSrc: string): string {
    return fs.readFileSync(path.join(srcRoot, relPathFromSrc), 'utf-8');
  }

  it('TaskList should pass showContractBadge={true} to TaskCard', () => {
    const contents = read('tui/components/TaskList.tsx');

    // Ensure we’re not just matching an unrelated string.
    expect(contents).toMatch(/<TaskCard[\s\S]*showContractBadge=\{true\}/m);
  });

  it('StackedTaskList should pass showContractBadge={true} to TaskCard', () => {
    const contents = read('tui/components/StackedTaskList.tsx');

    expect(contents).toMatch(/<TaskCard[\s\S]*showContractBadge=\{true\}/m);
  });
});
