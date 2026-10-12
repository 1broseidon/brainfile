/**
 * `check` (spec-11): is a decision on the board still safe to act on?
 *
 * Finds the claim family an action touches (by decision ID, by claim key, or
 * by words: the local index when there is one, a word-overlap scan over the
 * decisions when there is not) and gives recoil's verdict: `use`, `review`,
 * `use_replacement` or `no_decision`, with the stance rule and the
 * predicates (`validUntil`, a source file unchanged, a package version).
 *
 * @packageDocumentation
 */

import * as path from 'path';
import type { Task } from '../types/base';
import type { TypesConfig } from '../types/board';
import { readBoardConfig } from '../boardFile';
import { getV2Dirs } from '../workspace';
import {
  ACTION_CUE_WORDS,
  assessDecisionFamily,
  claimKeyMatchesPrefix,
  claimKeyOf,
  decisionFamilyKey,
  decisionSearchText,
  groupDecisionFamilies,
  noDecisionResult,
  normalizeClaimKey,
  significantTokens,
  tokenCoverage,
  worstCheckResult,
  type CheckRecommendation,
  type CheckResult,
  type CheckVerdict,
} from '../decisions';
import { evaluateDecisionPredicates, readDecisionDocs, type DecisionDocument } from '../decisionOperations';
import { MemoryIndex } from './memoryIndex';

export interface CheckOptions {
  /** An action in words ("switch the HTTP client to axios"), or a decision ID. */
  query?: string;
  /** Check one claim family exactly. */
  claimKey?: string;
  /** Check every family under a prefix; the verdict is the worst of them. */
  claimKeyPrefix?: string;
  /** Leave the index alone and match words by scanning the decisions. */
  scan?: boolean;
  /** Injectable clock (epoch ms) for `validUntil`. */
  now?: number;
  /** Project root for the file predicates. Defaults to the folder holding `.brainfile/`. */
  projectRoot?: string;
}

export interface CheckPrefixResult {
  claimKeyPrefix: string;
  verdict: CheckVerdict;
  recommendation: CheckRecommendation;
  reason: string;
  /** The family that decided the verdict. */
  decidingClaimKey?: string;
  familyCount: number;
  families: CheckResult[];
}

export interface CheckOutcome {
  /** How the family was found: by ID, by key, the index, the scan, or not at all. */
  matchedBy: 'decision' | 'claim_key' | 'index' | 'scan' | 'none';
  result: CheckResult;
}

/** Exit codes for scripts: 0 use or no_decision, 2 review, 3 use_replacement. */
export function checkExitCode(verdict: CheckVerdict): number {
  if (verdict === 'review') return 2;
  if (verdict === 'use_replacement') return 3;
  return 0;
}

interface Loaded {
  docs: DecisionDocument[];
  tasks: Task[];
  types?: TypesConfig;
  projectRoot: string;
}

function load(brainfilePath: string, options: CheckOptions): Loaded {
  const dirs = getV2Dirs(brainfilePath);
  const types = readBoardConfig(dirs.brainfilePath)?.config.types;
  const docs = readDecisionDocs(dirs, types);
  return { docs, tasks: docs.map((d) => d.task), types, projectRoot: options.projectRoot ?? path.dirname(dirs.dotDir) };
}

function familyTasks(loaded: Loaded, key: string): Task[] {
  return loaded.tasks.filter((task) => decisionFamilyKey(task) === key);
}

function assess(loaded: Loaded, options: CheckOptions, key: string, targetKind: 'query' | 'decision' | 'claim_key', matched?: Task): CheckResult {
  const now = options.now ?? Date.now();
  return assessDecisionFamily({
    ...(options.query ? { query: options.query } : {}),
    claimKey: key,
    targetKind,
    ...(matched ? { matched } : {}),
    family: familyTasks(loaded, key),
    evaluate: (task) => evaluateDecisionPredicates(task, { projectRoot: loaded.projectRoot, now }),
  });
}

/** Decisions ranked by how much of the action's words they share (the scan; decisions are few). */
function scanCandidates(loaded: Loaded, query: string): Task[] {
  const tokens = significantTokens(query, ACTION_CUE_WORDS);
  if (tokens.length === 0) return [];
  return loaded.docs
    .map((doc) => ({ task: doc.task, coverage: tokenCoverage(tokens, decisionSearchText(doc.task, doc.body)) }))
    .filter((c) => c.coverage > 0)
    .sort((a, b) => b.coverage - a.coverage)
    .map((c) => c.task);
}

/**
 * Check one action, decision or claim family. With `claimKeyPrefix`, use
 * `checkClaimKeyPrefix` instead.
 */
export function checkDecision(brainfilePath: string, options: CheckOptions): CheckOutcome {
  const loaded = load(brainfilePath, options);
  const query = options.query?.trim() ?? '';

  if (options.claimKey?.trim()) {
    const key = normalizeClaimKey(options.claimKey);
    const byId = loaded.tasks.find((t) => t.id === options.claimKey!.trim());
    const familyKey = familyTasks(loaded, key).length > 0 ? key : byId ? decisionFamilyKey(byId) : key;
    return { matchedBy: 'claim_key', result: assess(loaded, { ...options, query }, familyKey, 'claim_key') };
  }
  if (!query) return { matchedBy: 'none', result: noDecisionResult() };

  // A decision named by ID.
  if (!/\s/.test(query)) {
    const named = loaded.tasks.find((t) => t.id === query);
    if (named) return { matchedBy: 'decision', result: assess(loaded, options, decisionFamilyKey(named), 'decision', named) };
    const key = normalizeClaimKey(query);
    if (loaded.tasks.some((t) => claimKeyOf(t) === key)) {
      return { matchedBy: 'claim_key', result: assess(loaded, { ...options, query: '' }, key, 'claim_key') };
    }
  }

  // Words: the index when it is there, else the scan.
  let candidates: Task[] = [];
  let matchedBy: CheckOutcome['matchedBy'] = 'none';
  if (!options.scan) {
    const index = MemoryIndex.open(brainfilePath);
    if (index) {
      try {
        index.refresh();
        const ids = index.decisionCandidates(query, { ignoreWords: ACTION_CUE_WORDS });
        candidates = ids.map((id) => loaded.tasks.find((t) => t.id === id)).filter((t): t is Task => Boolean(t));
        matchedBy = 'index';
      } catch {
        candidates = [];
      } finally {
        index.close();
      }
    }
  }
  if (matchedBy === 'none') {
    candidates = scanCandidates(loaded, query);
    matchedBy = 'scan';
  }
  const matched = candidates[0];
  if (!matched) return { matchedBy, result: noDecisionResult(query) };
  return { matchedBy, result: assess(loaded, options, decisionFamilyKey(matched), 'query', matched) };
}

/** Check every claim family under a prefix; the verdict is the worst family's. */
export function checkClaimKeyPrefix(brainfilePath: string, prefix: string, options: Omit<CheckOptions, 'claimKeyPrefix'> = {}): CheckPrefixResult {
  const loaded = load(brainfilePath, options);
  const families = groupDecisionFamilies(loaded.tasks, loaded.types)
    .filter((family) => family.claimKey && claimKeyMatchesPrefix(family.claimKey, prefix));
  const results = families.map((family) => assess(loaded, { ...options, query: options.query ?? '' }, family.key, 'claim_key'));
  const worst = worstCheckResult(results);
  return {
    claimKeyPrefix: normalizeClaimKey(prefix),
    verdict: worst?.verdict ?? 'no_decision',
    recommendation: worst?.recommendation ?? 'proceed_without_memory',
    reason: worst?.reason ?? 'no_claim_key_match',
    ...(worst?.claimKey ? { decidingClaimKey: worst.claimKey } : {}),
    familyCount: results.length,
    families: results,
  };
}
