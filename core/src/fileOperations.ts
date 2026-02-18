/**
 * Backward-compatible re-export of v2 file-based task operations.
 *
 * Note: Contract metrics now live on task files (`task.contract.metrics`).
 * Legacy `.brainfile/state.json` tracking is no longer used.
 *
 * @deprecated Prefer importing from ./taskOperations.
 */

export * from './taskOperations';
