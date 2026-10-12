/**
 * `@brainfile/core/memory` — the local index and what reads it (spec-11):
 * one search, the session-start brief, and `check`. Node only, and the only
 * part of core that touches `node:sqlite`, loaded lazily so that a Node
 * without it falls back to the plain scan and nothing fails. Not re-exported
 * from the main or browser entry points.
 *
 * @packageDocumentation
 */
export * from './sqlite';
export * from './chunk';
export * from './mine';
export * from './memoryIndex';
export * from './search';
export * from './brief';
export * from './check';
