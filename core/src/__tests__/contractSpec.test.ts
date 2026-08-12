import {
  ALLOWED_DELIVERABLE_TYPES,
  normalizeToArray,
  parseDeliverableSpec,
  buildContract,
} from '../contractSpec';

describe('contractSpec', () => {
  describe('normalizeToArray', () => {
    it('returns an empty array for undefined', () => {
      expect(normalizeToArray(undefined)).toEqual([]);
    });

    it('wraps a single string', () => {
      expect(normalizeToArray('one')).toEqual(['one']);
    });

    it('passes an array through unchanged', () => {
      expect(normalizeToArray(['a', 'b'])).toEqual(['a', 'b']);
    });
  });

  describe('parseDeliverableSpec', () => {
    it('parses type:path:description', () => {
      expect(parseDeliverableSpec('file:src/a.ts:The impl')).toEqual({
        type: 'file',
        path: 'src/a.ts',
        description: 'The impl',
      });
    });

    it('parses type:path with no description', () => {
      expect(parseDeliverableSpec('test:src/a.test.ts')).toEqual({
        type: 'test',
        path: 'src/a.test.ts',
      });
    });

    it('keeps extra colons inside the description', () => {
      expect(parseDeliverableSpec('docs:README.md:See: the notes').description).toBe('See: the notes');
    });

    it('lowercases the type', () => {
      expect(parseDeliverableSpec('FILE:src/a.ts').type).toBe('file');
    });

    it('rejects a spec with no colon', () => {
      expect(() => parseDeliverableSpec('nocolon')).toThrow(/Invalid deliverable format/);
    });

    it('rejects an empty path', () => {
      expect(() => parseDeliverableSpec('file:')).toThrow(/non-empty path/);
    });

    it('rejects an unknown deliverable type', () => {
      expect(() => parseDeliverableSpec('binary:dist/app')).toThrow(/Invalid deliverable type/);
    });

    it('rejects an empty spec', () => {
      expect(() => parseDeliverableSpec('   ')).toThrow('Deliverable spec is required');
    });

    it('accepts every allowed type', () => {
      for (const type of ALLOWED_DELIVERABLE_TYPES) {
        expect(parseDeliverableSpec(`${type}:some/path`).type).toBe(type);
      }
    });
  });

  describe('buildContract', () => {
    it('defaults to draft with no optional sections', () => {
      expect(buildContract({})).toEqual({ status: 'draft' });
    });

    it('assembles deliverables, validation, and constraints', () => {
      const contract = buildContract({
        deliverableSpecs: ['file:src/a.ts:Impl'],
        validationCommands: ['npm test', '  '],
        constraints: ['Minimal changes'],
      });

      expect(contract.deliverables).toHaveLength(1);
      expect(contract.validation).toEqual({ commands: ['npm test'] });
      expect(contract.constraints).toEqual(['Minimal changes']);
    });

    it('stamps metrics.readyAt only for ready contracts', () => {
      expect(buildContract({ status: 'ready' }).metrics!.readyAt).toBeDefined();
      expect(buildContract({ status: 'draft' }).metrics).toBeUndefined();
    });

    it('propagates deliverable spec errors', () => {
      expect(() => buildContract({ deliverableSpecs: ['bogus'] })).toThrow(/Invalid deliverable format/);
    });
  });
});
