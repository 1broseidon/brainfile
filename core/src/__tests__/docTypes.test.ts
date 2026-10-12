import {
  DOC_ROLES,
  DOC_TYPES,
  TYPE_GLYPHS,
  allowedChildRoles,
  allowedParentRoles,
  availableTypeNames,
  canonicalTypeName,
  docRole,
  isBuiltInType,
  isKnownType,
  isTypeAlias,
  lintTypesConfig,
  listDocTypes,
  parentFit,
  resolveDocType,
  typeGlyph,
  typesMatch,
} from '../docTypes';
import { isTypeCompletable, validateType } from '../boardValidation';
import type { BoardConfig, TypesConfig } from '../types';

describe('docTypes (spec-12)', () => {
  describe('the five', () => {
    it('ships epic, spec, plan, task and decision in outline order', () => {
      expect(DOC_ROLES).toEqual(['epic', 'spec', 'plan', 'task', 'decision']);
      expect(listDocTypes().map((t) => t.name)).toEqual(['epic', 'spec', 'plan', 'task', 'decision']);
    });

    it('keeps the TUI glyphs', () => {
      expect(TYPE_GLYPHS).toEqual({ epic: '▸', spec: '◆', plan: '⎘', task: '', decision: '●' });
    });

    it('encodes the containment table', () => {
      expect(DOC_TYPES.epic.children).toEqual(['spec', 'plan', 'task']);
      expect(DOC_TYPES.spec.children).toEqual(['plan', 'task']);
      expect(DOC_TYPES.plan.children).toEqual(['task']);
      expect(DOC_TYPES.task.children).toEqual(['task']);
      expect(DOC_TYPES.decision.children).toEqual([]);
      // parents are the same table read the other way
      for (const role of DOC_ROLES) {
        for (const parent of DOC_TYPES[role].parents) {
          expect(DOC_TYPES[parent].children).toContain(role);
        }
      }
    });

    it('resolves built-ins with no config at all', () => {
      const decision = resolveDocType('decision');
      expect(decision).toMatchObject({
        name: 'decision', role: 'decision', builtIn: true, configured: false,
        idPrefix: 'decision', completable: false, work: false, glyph: '●', aliases: ['adr'],
      });
      expect(resolveDocType(undefined)).toMatchObject({ name: 'task', role: 'task', completable: true, glyph: '' });
      expect(resolveDocType('')).toMatchObject({ name: 'task' });
    });
  });

  describe('aliases', () => {
    it('canonicalises issue and adr, case-insensitively', () => {
      expect(canonicalTypeName('issue')).toBe('task');
      expect(canonicalTypeName('ADR')).toBe('decision');
      expect(canonicalTypeName(' Spec ')).toBe('spec');
      expect(canonicalTypeName('Bug')).toBe('Bug');
      expect(canonicalTypeName(undefined)).toBe('task');
      expect(isTypeAlias('adr')).toBe(true);
      expect(isTypeAlias('decision')).toBe(false);
    });

    it('matches an alias to its canonical type', () => {
      expect(typesMatch('adr', 'decision')).toBe(true);
      expect(typesMatch(undefined, 'issue')).toBe(true);
      expect(typesMatch('task', 'epic')).toBe(false);
      expect(isBuiltInType('adr')).toBe(true);
      expect(isBuiltInType('bug')).toBe(false);
    });

    it('resolves an alias to the canonical type, ignoring an entry under the alias name', () => {
      const types: TypesConfig = { adr: { idPrefix: 'adr', completable: true } };
      expect(resolveDocType('adr', types)).toMatchObject({ name: 'decision', idPrefix: 'decision', completable: false, configured: false });
    });
  });

  describe('like:', () => {
    const types: TypesConfig = {
      bug: { like: 'task' },
      rfc: { like: 'spec', idPrefix: 'rfc' },
      initiative: { like: 'epic', completable: false },
      choice: { like: 'adr' },
      hotfix: { like: 'bug' },
      chore: { idPrefix: 'chore' },
    };

    it('borrows the role, glyph, parents and children of its model', () => {
      expect(resolveDocType('rfc', types)).toMatchObject({
        name: 'rfc', role: 'spec', builtIn: false, configured: true, like: 'spec', glyph: '◆',
        parents: ['epic'], children: ['plan', 'task'], idPrefix: 'rfc',
      });
      expect(resolveDocType('choice', types)).toMatchObject({ role: 'decision', completable: false, glyph: '●', like: 'decision' });
      expect(resolveDocType('hotfix', types).role).toBe('task');
      expect(docRole('initiative', types)).toBe('epic');
      expect(typeGlyph('initiative', types)).toBe('▸');
    });

    it('behaves as a task without like', () => {
      expect(resolveDocType('chore', types)).toMatchObject({ role: 'task', glyph: '', idPrefix: 'chore', completable: true });
      expect(resolveDocType('spike')).toMatchObject({ role: 'task', configured: false, idPrefix: 'spike' });
    });

    it('respects explicit completable over the default, except for task and decision', () => {
      expect(resolveDocType('initiative', types).completable).toBe(false);
      expect(resolveDocType('plan', { plan: { completable: false } }).completable).toBe(false);
      expect(resolveDocType('task', { task: { completable: false } }).completable).toBe(true);
      expect(resolveDocType('decision', { decision: { completable: true } }).completable).toBe(false);
    });

    it('lets a built-in be overridden, and survives a loop', () => {
      expect(resolveDocType('spec', { spec: { like: 'plan' } }).role).toBe('plan');
      expect(resolveDocType('a', { a: { like: 'b' }, b: { like: 'a' } }).role).toBe('task');
    });

    it('falls back to the name for an unusable idPrefix', () => {
      expect(resolveDocType('bug', { bug: { idPrefix: '../x' } }).idPrefix).toBe('bug');
    });

    it('lists built-ins first, then the board\'s own, without alias entries', () => {
      const names = listDocTypes({ ...types, adr: { idPrefix: 'adr' }, epic: { completable: false } }).map((t) => t.name);
      expect(names).toEqual(['epic', 'spec', 'plan', 'task', 'decision', 'bug', 'rfc', 'initiative', 'choice', 'hotfix', 'chore']);
      expect(availableTypeNames({ bug: {} })).toEqual(['task', 'epic', 'spec', 'plan', 'decision', 'bug']);
    });

    it('lints a like that names nothing, and a loop', () => {
      const issues = lintTypesConfig({ bug: { like: 'nope' }, a: { like: 'b' }, b: { like: 'a' }, ok: { like: 'issue' } });
      expect(issues.map((i) => i.code).sort()).toEqual(['LIKE_LOOP', 'LIKE_LOOP', 'UNKNOWN_LIKE']);
      expect(issues.every((i) => i.type === 'warning')).toBe(true);
      expect(lintTypesConfig(undefined)).toEqual([]);
    });
  });

  describe('containment', () => {
    it.each([
      ['spec', 'epic'], ['plan', 'epic'], ['task', 'epic'],
      ['plan', 'spec'], ['task', 'spec'],
      ['task', 'plan'],
      ['task', 'task'],
      ['issue', 'epic'],
    ])('%s fits under %s', (child, parent) => {
      expect(parentFit(child, parent)).toEqual({ fits: true });
    });

    it('explains an off-pattern parent', () => {
      expect(parentFit('epic', 'task')).toEqual({ fits: false, reason: 'an epic sits at the top of the tree, not under a task' });
      expect(parentFit('spec', 'plan')).toEqual({ fits: false, reason: 'a spec goes under an epic, not under a plan' });
      expect(parentFit('plan', 'plan')).toEqual({ fits: false, reason: 'a plan goes under an epic or a spec, not under a plan' });
      expect(parentFit('decision', 'epic').reason).toBe('decisions are never in the tree');
      expect(parentFit('choice', 'epic', { choice: { like: 'decision' } }).reason).toBe('a choice is a decision, and decisions are never in the tree');
      expect(parentFit('task', 'adr').reason).toBe('decisions hold nothing');
    });

    it('decides by role, so custom types fit where their model does', () => {
      const types: TypesConfig = { bug: { like: 'task' }, rfc: { like: 'spec' } };
      expect(parentFit('bug', 'plan', types).fits).toBe(true);
      expect(parentFit('rfc', 'epic', types).fits).toBe(true);
      expect(parentFit('rfc', 'bug', types).fits).toBe(false);
      expect(allowedParentRoles('bug', types)).toEqual(['epic', 'spec', 'plan', 'task']);
      expect(allowedChildRoles('rfc', types)).toEqual(['plan', 'task']);
    });
  });

  describe('board validation on top of the registry', () => {
    const board = (types?: TypesConfig, strict = true): BoardConfig => ({ title: 'B', columns: [{ id: 'todo', title: 'To Do' }], strict, types });

    it('accepts the five and their aliases on a strict board without listing them', () => {
      for (const name of ['epic', 'spec', 'plan', 'task', 'decision', 'issue', 'adr']) {
        expect(validateType(board({ bug: {} }), name)).toEqual({ valid: true });
        expect(validateType(board(undefined), name)).toEqual({ valid: true });
      }
    });

    it('refuses a type that is neither built in nor listed', () => {
      const result = validateType(board(undefined), 'spike');
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Type 'spike' is not defined. Available types: task, epic, spec, plan, decision");
      expect(isKnownType('bug', { bug: { like: 'task' } })).toBe(true);
    });

    it('never auto-completes a decision', () => {
      expect(isTypeCompletable('adr', undefined)).toBe(false);
      expect(isTypeCompletable('decision', { decision: { completable: true } })).toBe(false);
      expect(isTypeCompletable('spec', undefined)).toBe(true);
    });
  });
});
