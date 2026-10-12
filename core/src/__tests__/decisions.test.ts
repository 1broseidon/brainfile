import {
  ACTION_CUE_WORDS,
  assessDecisionFamily,
  checkVerdictSeverity,
  claimKeyMatchesPrefix,
  claimKeyOf,
  claimKeyParent,
  combinePredicateChecks,
  comparePredicateValue,
  compareVersionish,
  decisionFamilyKey,
  decisionFamilyMembers,
  decisionTitleFromText,
  evaluateValidUntil,
  formatPackageSpec,
  groupDecisionFamilies,
  groupDecisionsByPrefix,
  isCurrentDecision,
  isDecisionDoc,
  isDecisionKind,
  isDecisionStance,
  isHistoricalDecision,
  isStopword,
  isValidClaimKey,
  noDecisionResult,
  normalizeClaimKey,
  parsePackageSpec,
  parsePredicateTime,
  relatedClaimFamilies,
  requestedAction,
  significantTokens,
  stanceActionAligns,
  summarizeDecision,
  tokenCoverage,
  worstCheckResult,
  type PredicateReport,
} from '../decisions';
import type { Task } from '../types';

const decision = (id: string, fields: Record<string, unknown> = {}): Task => ({
  id,
  title: `Decision ${id}`,
  type: 'decision',
  status: 'current',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...fields,
});

const unknownReport = (): PredicateReport => ({ status: 'unknown', checks: [] });

describe('claim keys', () => {
  it('normalises, validates and finds parents', () => {
    expect(normalizeClaimKey('  Dependency.HTTP-Client ')).toBe('dependency.http-client');
    expect(normalizeClaimKey(42)).toBe('');
    expect(isValidClaimKey('dependency.http-client')).toBe(true);
    expect(isValidClaimKey('storage_index')).toBe(true);
    expect(isValidClaimKey('bad key')).toBe(false);
    expect(isValidClaimKey('.leading')).toBe(false);
    expect(isValidClaimKey('trailing.')).toBe(false);
    expect(claimKeyParent('a.b.c')).toBe('a.b');
    expect(claimKeyParent('a')).toBeUndefined();
    expect(claimKeyOf({ claimKey: ' A.B ' })).toBe('a.b');
    expect(claimKeyOf({})).toBeUndefined();
    expect(claimKeyOf(undefined)).toBeUndefined();
  });

  it('matches prefixes segment by segment', () => {
    expect(claimKeyMatchesPrefix('dependency.http-client', 'dependency')).toBe(true);
    expect(claimKeyMatchesPrefix('dependency.http-client', 'dependency.')).toBe(true);
    expect(claimKeyMatchesPrefix('dependency', 'dependency')).toBe(true);
    expect(claimKeyMatchesPrefix('dependencyx.a', 'dependency')).toBe(false);
    expect(claimKeyMatchesPrefix(undefined, 'dependency')).toBe(false);
    expect(claimKeyMatchesPrefix('a.b', '')).toBe(false);
  });

  it('knows kinds and stances', () => {
    expect(isDecisionKind('constraint')).toBe(true);
    expect(isDecisionKind('wish')).toBe(false);
    expect(isDecisionStance('forbids')).toBe(true);
    expect(isDecisionStance('likes')).toBe(false);
  });
});

describe('decision status and families', () => {
  const tasks: Task[] = [
    decision('decision-3', { claimKey: 'dependency.http-client', supersedes: 'decision-1', createdAt: '2026-10-03T00:00:00.000Z' }),
    decision('decision-1', { claimKey: 'dependency.http-client', status: 'superseded', supersededBy: 'decision-3' }),
    decision('decision-2', { claimKey: 'storage.index' }),
    decision('decision-4', { claimKey: 'dependency.json', status: 'rejected' }),
    decision('adr-1', { type: 'adr', status: undefined }),
    decision('decision-5'),
    { id: 'task-1', title: 'Work', column: 'todo' },
  ];

  it('tells current from history', () => {
    expect(isCurrentDecision(tasks[0])).toBe(true);
    expect(isHistoricalDecision(tasks[1])).toBe(true);
    expect(isHistoricalDecision(tasks[3])).toBe(true);
    expect(isCurrentDecision(tasks[4])).toBe(false); // legacy ADR with no status is proposed
    expect(isDecisionDoc(tasks[6])).toBe(false);
    expect(isDecisionDoc({ type: 'adr' })).toBe(true);
    expect(decisionFamilyKey(tasks[5])).toBe('decision-5');
  });

  it('groups decisions into claim families', () => {
    const families = groupDecisionFamilies(tasks);
    expect(families.map((f) => f.key)).toEqual(['dependency.http-client', 'dependency.json', 'storage.index', 'adr-1', 'decision-5']);
    const http = families[0];
    expect(http.current.map((t) => t.id)).toEqual(['decision-3']);
    expect(http.history.map((t) => t.id)).toEqual(['decision-1']);
    expect(families.find((f) => f.key === 'adr-1')!.other.map((t) => t.id)).toEqual(['adr-1']);
    expect(decisionFamilyMembers(tasks, 'dependency.http-client').map((t) => t.id)).toEqual(['decision-3', 'decision-1']);
    expect(decisionFamilyMembers(tasks, '')).toEqual([]);
    expect(decisionFamilyMembers(tasks, 'nope')).toEqual([]);
  });

  it('keeps the first of a duplicated ID (board before logs)', () => {
    const dup = groupDecisionFamilies([decision('decision-9', { claimKey: 'x' }), decision('decision-9', { claimKey: 'x', status: 'stale' })]);
    expect(dup[0].current).toHaveLength(1);
    expect(dup[0].history).toHaveLength(0);
  });

  it('groups families by the first claim-key segment', () => {
    const groups = groupDecisionsByPrefix(tasks);
    expect(groups.map((g) => g.prefix)).toEqual(['dependency', 'storage', '']);
    expect(groups[0].families.map((f) => f.key)).toEqual(['dependency.http-client', 'dependency.json']);
    expect(groups[2].families.map((f) => f.key)).toEqual(['adr-1', 'decision-5']);
  });

  it('summarises a decision as plain data', () => {
    const summary = summarizeDecision(decision('decision-7', {
      claimKey: 'Dependency.Http',
      kind: 'constraint',
      stance: 'forbids',
      subject: 'axios',
      validUntil: new Date('2026-12-31T00:00:00.000Z'),
      supersedes: ['decision-1', 'decision-2'],
      sourcePath: 'docs/x.md',
      packageVersion: 'zod>=4',
    }));
    expect(summary).toMatchObject({
      id: 'decision-7',
      claimKey: 'dependency.http',
      kind: 'constraint',
      status: 'current',
      stance: 'forbids',
      subject: 'axios',
      validUntil: '2026-12-31',
      supersedes: ['decision-1', 'decision-2'],
      sourcePath: 'docs/x.md',
      packageVersion: 'zod>=4',
    });
  });
});

describe('tokens', () => {
  it('drops stopwords and keeps them only when nothing else is left', () => {
    expect(isStopword('The')).toBe(true);
    expect(significantTokens('Use the undici client for HTTP')).toEqual(['use', 'undici', 'client', 'http']);
    expect(significantTokens('the and of')).toEqual(['the', 'and', 'of']);
    expect(significantTokens('use the client', ACTION_CUE_WORDS)).toEqual(['client']);
    expect(significantTokens('keep the decision', ACTION_CUE_WORDS)).toEqual([]);
    expect(significantTokens('a a a b b')).toEqual(['b']);
  });

  it('measures coverage with whole words and prefixes', () => {
    expect(tokenCoverage(['undici', 'http'], 'Use undici for HTTP requests')).toBe(1);
    expect(tokenCoverage(['auth'], 'authentication fails')).toBe(1);
    expect(tokenCoverage(['ab'], 'abc')).toBe(0);
    expect(tokenCoverage([], 'anything')).toBe(0);
    expect(tokenCoverage(['x', 'http'], 'http')).toBe(0.5);
  });
});

describe('related claim families', () => {
  const docs = [
    { task: decision('decision-1', { claimKey: 'dependency.json-parser', title: 'Use simdjson' }) },
    { task: decision('decision-2', { claimKey: 'storage.index', title: 'Index with sqlite fts5' }), body: 'Local only, rebuildable.' },
    { task: decision('decision-3', { claimKey: 'storage.cache', title: 'Old cache', status: 'superseded', supersededBy: 'decision-9' }) },
    { task: decision('decision-4', { title: 'No key, sqlite everywhere' }) },
    { task: decision('decision-5', { claimKey: 'dependency.http-client', title: 'Use undici' }) },
  ];

  it('finds siblings under the same parent and families sharing the words', () => {
    const related = relatedClaimFamilies(docs, { claimKey: 'dependency.yaml', text: 'Use js-yaml for the yaml parser' });
    expect(related.map((r) => [r.id, r.reason])).toEqual([['decision-5', 'prefix'], ['decision-1', 'prefix']]); // by claim key

    const byText = relatedClaimFamilies(docs, { claimKey: 'search.engine', text: 'Search with the sqlite fts5 index' });
    expect(byText).toHaveLength(1);
    expect(byText[0]).toMatchObject({ id: 'decision-2', claimKey: 'storage.index', reason: 'text' });
    expect(byText[0].coverage).toBeGreaterThanOrEqual(0.5);
  });

  it('skips its own family, history, keyless decisions and excluded IDs', () => {
    expect(relatedClaimFamilies(docs, { claimKey: 'storage.index', text: 'sqlite fts5 index' })).toEqual([]);
    expect(relatedClaimFamilies(docs, { claimKey: 'dependency.yaml', text: 'x', excludeIds: ['decision-1', 'decision-5'] })).toEqual([]);
    expect(relatedClaimFamilies(docs, { text: 'Old cache' })).toEqual([]);
  });
});

describe('the stance rule', () => {
  it('reads adopt, remove, replace and affirm cues next to the subject', () => {
    expect(requestedAction('switch the HTTP client to axios: use axios', 'axios')).toBe('adopt_subject');
    expect(requestedAction('add the axios package', 'axios')).toBe('adopt_subject');
    expect(requestedAction('continue with better-sqlite3', 'better-sqlite3')).toBe('adopt_subject');
    expect(requestedAction('drop axios', 'axios')).toBe('remove_subject');
    expect(requestedAction("don't use axios here", 'axios')).toBe('remove_subject');
    expect(requestedAction('replace the axios client', 'axios')).toBe('replace_subject');
    expect(requestedAction('we keep the decision', 'axios')).toBe('affirm_decision');
    expect(requestedAction('axios is mentioned', 'axios')).toBe('unknown');
    expect(requestedAction('use undici', 'axios')).toBe('unknown');
    expect(requestedAction('', 'axios')).toBe('unknown');
  });

  it('aligns actions with stances', () => {
    expect(stanceActionAligns('prefers', 'adopt_subject')).toBe(true);
    expect(stanceActionAligns('requires', 'remove_subject')).toBe(false);
    expect(stanceActionAligns('rejects', 'remove_subject')).toBe(true);
    expect(stanceActionAligns('forbids', 'replace_subject')).toBe(true);
    expect(stanceActionAligns('forbids', 'adopt_subject')).toBe(false);
    expect(stanceActionAligns('rejects', 'affirm_decision')).toBe(true);
    expect(stanceActionAligns('maybe' as never, 'adopt_subject')).toBe(false);
  });
});

describe('predicates', () => {
  it('parses dates and timestamps', () => {
    expect(parsePredicateTime('2026-12-31')).toBe(Date.UTC(2026, 11, 31, 23, 59, 59, 999));
    expect(parsePredicateTime('2026-12-31T10:00:00Z')).toBe(Date.UTC(2026, 11, 31, 10));
    expect(parsePredicateTime('2026-02-30')).toBeNull();
    expect(parsePredicateTime('next week')).toBeNull();
    expect(parsePredicateTime(12)).toBeNull();
    expect(parsePredicateTime(new Date('2026-01-01T00:00:00Z'))).toBe(Date.UTC(2026, 0, 1));
    expect(parsePredicateTime(new Date('nope'))).toBeNull();
  });

  it('evaluates validUntil', () => {
    const now = Date.UTC(2026, 9, 12);
    expect(evaluateValidUntil('2026-12-31', now)).toMatchObject({ status: 'holds', reason: 'valid_until_holds' });
    expect(evaluateValidUntil('2026-01-01', now)).toMatchObject({ status: 'broken', reason: 'valid_until_expired' });
    expect(evaluateValidUntil('soon', now)).toMatchObject({ status: 'unknown', reason: 'invalid_valid_until' });
    expect(evaluateValidUntil(new Date('2027-01-01T00:00:00Z'), now)).toMatchObject({ status: 'holds', expected: '2027-01-01' });
  });

  it('parses package specs', () => {
    expect(parsePackageSpec('zod>=4.3')).toEqual({ name: 'zod', operator: '>=', version: '4.3' });
    expect(parsePackageSpec('@brainfile/core@0.21.2')).toEqual({ name: '@brainfile/core', operator: '==', version: '0.21.2' });
    expect(parsePackageSpec('engines.node >= 20')).toEqual({ name: 'engines.node', operator: '>=', version: '20' });
    expect(parsePackageSpec('go=1.22')).toEqual({ name: 'go', operator: '==', version: '1.22' });
    expect(parsePackageSpec('zod')).toBeNull();
    expect(parsePackageSpec(3)).toBeNull();
    expect(formatPackageSpec({ name: 'zod', operator: '<', version: '5' })).toBe('zod<5');
  });

  it('compares versions', () => {
    expect(compareVersionish('^4.3.6', '4.3')).toBe(1);
    expect(compareVersionish('4.3', '4.3.0')).toBe(0);
    expect(compareVersionish('1.2', '1.10')).toBe(-1);
    expect(compareVersionish('latest', '1')).toBeNull();
    expect(comparePredicateValue('^4.3.6', '==', '4.3.6')).toBe(true);
    expect(comparePredicateValue('workspace:*', '==', 'WORKSPACE:*')).toBe(true);
    expect(comparePredicateValue('4.3.6', '!=', '4.3.6')).toBe(false);
    expect(comparePredicateValue('>=20', '>=', '20')).toBe(true);
    expect(comparePredicateValue('19', '>', '20')).toBe(false);
    expect(comparePredicateValue('19', '<', '20')).toBe(true);
    expect(comparePredicateValue('20', '<=', '20')).toBe(true);
    expect(comparePredicateValue('latest', '>=', '1')).toBeNull();
    expect(comparePredicateValue('1', '~' as never, '1')).toBeNull();
  });

  it('combines checks: broken wins, then holds', () => {
    expect(combinePredicateChecks([])).toEqual({ status: 'unknown', checks: [] });
    expect(combinePredicateChecks([{ kind: 'valid_until', status: 'unknown', reason: 'invalid_valid_until' }]).reason).toBe('invalid_valid_until');
    const holds = { kind: 'valid_until' as const, status: 'holds' as const, reason: 'valid_until_holds' };
    const broken = { kind: 'package_version' as const, status: 'broken' as const, reason: 'package_version_mismatch' };
    expect(combinePredicateChecks([holds]).status).toBe('holds');
    expect(combinePredicateChecks([holds, broken])).toMatchObject({ status: 'broken', reason: 'package_version_mismatch' });
  });
});

describe('assessDecisionFamily: recoil verdict order', () => {
  const evaluate = () => unknownReport();

  it('says no_decision for an empty family', () => {
    const result = assessDecisionFamily({ claimKey: 'x', targetKind: 'claim_key', family: [], evaluate });
    expect(result).toMatchObject({ verdict: 'no_decision', recommendation: 'proceed_without_memory', reason: 'empty_family' });
    expect(noDecisionResult('do a thing')).toMatchObject({ verdict: 'no_decision', reason: 'no_claim_key_match', query: 'do a thing' });
  });

  it('reviews a family with two current decisions first', () => {
    const family = [decision('decision-1', { claimKey: 'x' }), decision('decision-2', { claimKey: 'x' })];
    const result = assessDecisionFamily({ claimKey: 'x', targetKind: 'claim_key', family, evaluate: () => ({ status: 'broken', reason: 'valid_until_expired', checks: [] }) });
    expect(result).toMatchObject({ verdict: 'review', recommendation: 'ask_operator', reason: 'multiple_current_decisions' });
  });

  it('asks to revalidate when a predicate broke, with the recheck', () => {
    const family = [decision('decision-1', { claimKey: 'x', recheck: 'Is the vendor still alive?' })];
    const result = assessDecisionFamily({
      query: 'use the vendor sdk',
      claimKey: 'x',
      targetKind: 'query',
      matched: family[0],
      family,
      evaluate: () => ({ status: 'broken', reason: 'valid_until_expired', checks: [{ kind: 'valid_until', status: 'broken', reason: 'valid_until_expired' }] }),
    });
    expect(result).toMatchObject({ verdict: 'review', recommendation: 'revalidate', reason: 'valid_until_expired', recheck: 'Is the vendor still alive?', predicateStatus: 'broken' });
  });

  it('points at the replacement when the action matched history', () => {
    const old = decision('decision-1', { claimKey: 'x', status: 'superseded', supersededBy: 'decision-2' });
    const current = decision('decision-2', { claimKey: 'x', holdsWhile: 'we ship on Node' });
    const result = assessDecisionFamily({ query: 'old way', claimKey: 'x', targetKind: 'query', matched: old, family: [old, current], evaluate });
    expect(result).toMatchObject({ verdict: 'use_replacement', recommendation: 'use_current_decision', reason: 'matched_historical_decision', advisory: 'we ship on Node' });
    expect(result.replacement?.id).toBe('decision-2');
    expect(result.family.map((d) => d.id)).toEqual(['decision-2', 'decision-1']);
  });

  it('reviews history with no replacement: by ID it says ignore, by words ask', () => {
    const old = decision('decision-1', { claimKey: 'x', status: 'rejected' });
    expect(assessDecisionFamily({ claimKey: 'x', targetKind: 'decision', matched: old, family: [old], evaluate }))
      .toMatchObject({ verdict: 'review', recommendation: 'ignore_decision', reason: 'decision_is_historical' });
    expect(assessDecisionFamily({ query: 'q', claimKey: 'x', targetKind: 'query', matched: old, family: [old], evaluate }))
      .toMatchObject({ verdict: 'review', recommendation: 'ask_operator', reason: 'matched_historical_decision' });
  });

  it('applies the stance rule to the current decision', () => {
    const forbids = decision('decision-1', { claimKey: 'dep.http', stance: 'forbids', subject: 'axios' });
    const blocked = assessDecisionFamily({ query: 'add axios for retries', claimKey: 'dep.http', targetKind: 'query', matched: forbids, family: [forbids], evaluate });
    expect(blocked).toMatchObject({ verdict: 'review', recommendation: 'block_action', reason: 'request_contradicts_decision', stance: 'forbids', subject: 'axios', requestedAction: 'adopt_subject' });

    const prefers = decision('decision-2', { claimKey: 'dep.http', stance: 'prefers', subject: 'undici' });
    expect(assessDecisionFamily({ query: 'drop undici', claimKey: 'dep.http', targetKind: 'query', family: [prefers], evaluate }))
      .toMatchObject({ verdict: 'review', recommendation: 'ask_operator', reason: 'request_contradicts_decision' });
    expect(assessDecisionFamily({ query: 'use undici for the fetcher', claimKey: 'dep.http', targetKind: 'query', family: [prefers], evaluate }))
      .toMatchObject({ verdict: 'use', reason: 'request_consistent_with_decision' });
    expect(assessDecisionFamily({ query: 'the fetcher needs retries', claimKey: 'dep.http', targetKind: 'query', family: [prefers], evaluate }))
      .toMatchObject({ verdict: 'use', reason: 'single_current_decision', requestedAction: 'unknown' });
  });

  it('uses a plain current decision, and reviews a family with none', () => {
    const current = decision('decision-1', { claimKey: 'x' });
    expect(assessDecisionFamily({ claimKey: 'x', targetKind: 'claim_key', family: [current], evaluate }))
      .toMatchObject({ verdict: 'use', recommendation: 'use_current_decision', reason: 'single_current_decision', current: { id: 'decision-1' } });
    const stale = decision('decision-2', { claimKey: 'x', status: 'stale', recheck: 'ask again' });
    expect(assessDecisionFamily({ claimKey: 'x', targetKind: 'claim_key', family: [stale], evaluate }))
      .toMatchObject({ verdict: 'review', recommendation: 'ask_operator', reason: 'no_current_decision', recheck: 'ask again' });
  });

  it('ranks verdicts worst first', () => {
    expect(checkVerdictSeverity('review')).toBeLessThan(checkVerdictSeverity('use_replacement'));
    expect(checkVerdictSeverity('use_replacement')).toBeLessThan(checkVerdictSeverity('use'));
    expect(checkVerdictSeverity('use')).toBeLessThan(checkVerdictSeverity('no_decision'));
    expect(checkVerdictSeverity('other' as never)).toBe(4);
    expect(worstCheckResult([{ verdict: 'use' as const }, { verdict: 'review' as const }, { verdict: 'use_replacement' as const }])).toEqual({ verdict: 'review' });
    expect(worstCheckResult([])).toBeUndefined();
  });
});

describe('decisionTitleFromText', () => {
  it('takes the first line, cut at a sentence or a word', () => {
    expect(decisionTitleFromText('Use undici for HTTP\n\nBecause it ships with Node.')).toBe('Use undici for HTTP');
    expect(decisionTitleFromText('# Heading line')).toBe('Heading line');
    expect(decisionTitleFromText('Use undici for HTTP, never axios. It ships with Node.')).toBe('Use undici for HTTP, never axios.');
    expect(decisionTitleFromText('Prefer small libraries, e.g. zod over joi')).toBe('Prefer small libraries, e.g. zod over joi');
    expect(decisionTitleFromText('Short. Then more')).toBe('Short. Then more');
    const long = `Use undici for every outbound HTTP request in the CLI and the desktop app. It ships with Node, so there is nothing to install and nothing to rebuild.`;
    expect(decisionTitleFromText(long)).toBe('Use undici for every outbound HTTP request in the CLI and the desktop app.');
    const noSentence = 'word '.repeat(40).trim();
    const title = decisionTitleFromText(noSentence);
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(100);
  });
});
