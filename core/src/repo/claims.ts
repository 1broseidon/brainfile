/**
 * A runner's claim on a task and where a hand-off waits for the person
 * (task-80): the board writes the shared runner (`@brainfile/core/dispatch`
 * Runner) makes, here so a host that commits them (the desktop's) needs no
 * part of dispatch to make them.
 */
import { readBoardConfig } from '../boardFile';
import { changeLeadFile, claimDispatchFile, releaseDispatchFile, type ClaimInput, type LeadAction } from '../dispatchRecord';
import { moveTaskFileToColumn } from '../taskOperations';
import type { ColumnConfig, DispatchClaim, DispatchOutcome, DispatchRequest } from '../types';
import { findV2Task, getV2Dirs } from '../workspace';
import { isClaimLost } from './runFiles';

/** How a claim is taken: `takeOwn` also takes one this runner holds for a run that ended; `request` is written with it; `count` makes it one more try. */
export interface TakeOptions {
  takeOwn?: boolean;
  request?: DispatchRequest;
  count?: boolean;
}

/** A claim refused: `held` when another runner holds the task, else the write itself failed. */
export type ClaimTaken = { ok: true } | { ok: false; held: boolean; error: string };

/** The board's review column: by id or title, as the brief's finish line finds it. */
export function reviewColumn<C extends Pick<ColumnConfig, 'id' | 'title'>>(columns: C[]): C | undefined {
  return columns.find((c) => /review/i.test(c.id) || /review/i.test(c.title ?? ''));
}

/**
 * The runner's claim on the task file (claimDispatchFile), for a board's
 * `claim`: a lost claim is taken (isClaimLost), and with `takeOwn` one this
 * same runner holds for a run that has ended.
 */
export function takeClaim(dotDir: string, filePath: string, claim: ClaimInput, options: TakeOptions = {}): ClaimTaken {
  const isLost = (held: DispatchClaim) => (!!options.takeOwn && held.host === claim.host && held.pid === claim.pid) || isClaimLost(dotDir, held);
  const taken = claimDispatchFile(filePath, claim, { isLost, ...(options.request ? { request: options.request } : {}), ...(options.count ? { count: true } : {}) });
  return taken.ok ? { ok: true } : { ok: false, held: taken.reason === 'claimed' || taken.reason === 'other-host', error: taken.error };
}

/** An epic's lead paused, resumed or ended on its file (changeLeadFile); throws when it could not be written. */
export function markLead(filePath: string, action: LeadAction): void {
  const changed = changeLeadFile(filePath, action);
  if (!changed.ok) throw new Error(changed.error);
}

/** The claim given back on the task file, kept with how its run ended; throws when it is not this runner's. */
export function giveBackClaim(filePath: string, holder: Pick<DispatchClaim, 'host' | 'pid'>, outcome: DispatchOutcome): void {
  const released = releaseDispatchFile(filePath, holder, { outcome });
  if (!released.ok) throw new Error(released.error);
}

/** The open task into the board's review column, when it has one and the task is not there. */
export function parkInReview(brainfilePath: string, taskId: string): void {
  const config = readBoardConfig(brainfilePath)?.config;
  const review = reviewColumn(config?.columns ?? []);
  const dirs = getV2Dirs(brainfilePath);
  const found = findV2Task(dirs, taskId);
  if (!config || !review || !found || found.doc.task.column === review.id) return;
  const moved = moveTaskFileToColumn(dirs, config, taskId, review.id, { skipAutoComplete: true });
  if (!moved.success) throw new Error(moved.error ?? `${taskId} was not moved to ${review.title ?? review.id}`);
}

