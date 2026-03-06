import {
  DependencyCycleError,
  MissingDependencyError,
  topologicalSort,
} from '../graph';

describe('graph', () => {
  it('sorts tasks so dependencies come first', () => {
    const order = topologicalSort([
      { id: 'test-1', dependsOn: ['impl-1'] },
      { id: 'research-1' },
      { id: 'impl-1', dependsOn: ['research-1'] },
    ]);

    expect(order).toEqual(['research-1', 'impl-1', 'test-1']);
  });

  it('rejects cycles and reports the cycle path', () => {
    expect(() => topologicalSort([
      { id: 'research-1', dependsOn: ['test-1'] },
      { id: 'impl-1', dependsOn: ['research-1'] },
      { id: 'test-1', dependsOn: ['impl-1'] },
    ])).toThrow(DependencyCycleError);

    try {
      topologicalSort([
        { id: 'research-1', dependsOn: ['test-1'] },
        { id: 'impl-1', dependsOn: ['research-1'] },
        { id: 'test-1', dependsOn: ['impl-1'] },
      ]);
      throw new Error('expected cycle');
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyCycleError);
      expect((error as DependencyCycleError).cycle).toEqual(['research-1', 'test-1', 'impl-1', 'research-1']);
      expect((error as Error).message).toContain('research-1 -> test-1 -> impl-1 -> research-1');
    }
  });

  it('rejects missing dependency references', () => {
    expect(() => topologicalSort([
      { id: 'impl-1', dependsOn: ['research-1'] },
    ])).toThrow(MissingDependencyError);
  });
});
