import {
  formatTaskRef,
  isQualifiedRef,
  lintRelatedConfig,
  lintTaskRefs,
  parseTaskRef,
  readRelatedConfig,
} from '../related';
import { BrainfileLinter } from '../linter';
import { MissingDependencyError, topologicalSort } from '../graph';

describe('parseTaskRef', () => {
  it('leaves a plain ID exactly as written', () => {
    expect(parseTaskRef('task-12')).toEqual({ raw: 'task-12', id: 'task-12' });
    expect(parseTaskRef(' odd id ')).toEqual({ raw: ' odd id ', id: ' odd id ' });
  });

  it('splits alias:id', () => {
    expect(parseTaskRef('mobile:task-12')).toEqual({ raw: 'mobile:task-12', alias: 'mobile', id: 'task-12' });
    expect(parseTaskRef('Web_2:epic-3')).toMatchObject({ alias: 'Web_2', id: 'epic-3' });
  });

  it.each(['mobile:', ':task-1', 'a:b:c', 'mo bile:task-1', 'mobile:task 1', 'mobile:../task-1', '-x:task-1'])(
    'rejects %s',
    (ref) => {
      expect(parseTaskRef(ref)).toBeNull();
    },
  );

  it('formats and detects qualified refs', () => {
    expect(formatTaskRef('mobile', 'task-1')).toBe('mobile:task-1');
    expect(formatTaskRef(undefined, 'task-1')).toBe('task-1');
    expect(isQualifiedRef('mobile:task-1')).toBe(true);
    expect(isQualifiedRef('task-1')).toBe(false);
  });
});

describe('readRelatedConfig', () => {
  it('keeps well-named aliases with folder paths', () => {
    expect(readRelatedConfig({ related: { mobile: ' ../hotline-mobile ', 'bad name': '../x', empty: '', num: 3 } }))
      .toEqual({ mobile: '../hotline-mobile' });
  });

  it('is empty without a map', () => {
    expect(readRelatedConfig({})).toEqual({});
    expect(readRelatedConfig(null)).toEqual({});
    expect(readRelatedConfig({ related: ['../x'] })).toEqual({});
  });
});

describe('lintRelatedConfig', () => {
  it('accepts a map of folders, and nothing at all', () => {
    expect(lintRelatedConfig({ mobile: '../m' })).toEqual([]);
    expect(lintRelatedConfig(undefined)).toEqual([]);
  });

  it('warns on a non-map, bad names and non-folders', () => {
    expect(lintRelatedConfig(['../m'])).toHaveLength(1);
    expect(lintRelatedConfig('../m')[0]).toMatchObject({ type: 'warning', code: 'RELATED_INVALID' });
    const issues = lintRelatedConfig({ 'bad name': '../m', web: 4 });
    expect(issues.map((i) => i.message)).toEqual([
      "related.bad name: short names use letters, digits, '-' and '_'",
      'related.web: must be a folder path',
    ]);
  });

  it('runs as part of BrainfileLinter', () => {
    const content = '---\ntitle: T\nrelated:\n  mobile: 3\ncolumns:\n  - id: todo\n    title: To Do\n---\n';
    const result = BrainfileLinter.lint(content);
    expect(result.valid).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain('RELATED_INVALID');

    const clean = '---\ntitle: T\nrelated:\n  mobile: ../m\ncolumns:\n  - id: todo\n    title: To Do\n---\n';
    expect(BrainfileLinter.lint(clean).issues).toEqual([]);
  });
});

describe('lintTaskRefs', () => {
  it('ignores plain IDs and known aliases', () => {
    expect(lintTaskRefs([{ id: 'task-1', dependsOn: ['task-2', 'nope', 'mobile:task-3'] }], { mobile: '../m' })).toEqual([]);
    expect(lintTaskRefs([{ id: 'task-1' }, { id: 'task-2', dependsOn: 'x' }], {})).toEqual([]);
  });

  it('warns on malformed refs and unknown aliases', () => {
    const issues = lintTaskRefs([{ id: 'task-1', dependsOn: ['web:task-1', 'mobile:', 'mobile:task-2', 7] }], { mobile: '../m' });
    expect(issues.map((i) => i.code)).toEqual(['UNKNOWN_RELATED_ALIAS', 'MALFORMED_TASK_REF']);
    expect(issues.every((i) => i.type === 'warning')).toBe(true);
  });
});

describe('topologicalSort with references to other boards', () => {
  it('treats alias:id as an edge out of the graph', () => {
    expect(topologicalSort([
      { id: 'task-1', dependsOn: ['mobile:task-12'] },
      { id: 'task-2', dependsOn: ['task-1', 'web:task-3'] },
    ])).toEqual(['task-1', 'task-2']);
  });

  it('still rejects a missing plain dependency', () => {
    expect(() => topologicalSort([{ id: 'task-1', dependsOn: ['task-9'] }])).toThrow(MissingDependencyError);
  });
});
