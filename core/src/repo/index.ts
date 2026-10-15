/**
 * `@brainfile/core/repo` — boards kept in git: the board branch worktree,
 * commits per mutation, sync through `refs/brainfile/*`, and the field-level
 * merge. Node only; shells out to `git`. Not re-exported from the main or
 * browser entry points, so importing `@brainfile/core` stays git-free.
 *
 * @packageDocumentation
 */
export * from './boardRepo';
export * from './boardSync';
export * from './merge';
export * from './autosync';
export * from './locate';
export * from './related';
export * from './boards';
export * from './consolidate';
export * from './worktree';
export * from './landingLock';
export * from './fix';
export * from './runFiles';
export * from './unpushed';
