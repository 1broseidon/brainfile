/**
 * `@brainfile/core/forge` — where a project's code is hosted and what that
 * host knows (task-26, task-77): which forge its origin points at, and
 * GitHub's open issues read with the credentials the CLI and the desktop find
 * in one order, and a hand-off's pull request: pushed, opened and followed
 * until it merges (decision-16). Node only; shells out to `git` and `gh`. Fetch and the saved
 * token are passed in. Not re-exported from the main or browser entry points.
 *
 * @packageDocumentation
 */
export * from './remote';
export * from './github';
export * from './handOffPullRequest';
