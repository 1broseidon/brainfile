/**
 * Type system enums for brainfile discrimination and rendering
 * @packageDocumentation
 */

/**
 * Example brainfile type names
 *
 * IMPORTANT: The type system is OPEN - any string value is valid.
 * These are just reference examples from official schemas at brainfile.md/v1/*.json
 *
 * Custom types work identically:
 * - 'sprint-board' with columns[] → kanban renderer (same as 'board')
 * - 'dev-log' with entries[] → timeline renderer (same as 'journal')
 *
 * Type names are metadata only. Structure determines behavior.
 */
export enum BrainfileType {
  BOARD = 'board',
  JOURNAL = 'journal',
  COLLECTION = 'collection',
  CHECKLIST = 'checklist',
  DOCUMENT = 'document'
}

/**
 * Renderer types for displaying brainfiles
 *
 * Renderers are selected by:
 * 1. Schema hints (x-brainfile-renderer) - explicit override
 * 2. Structural patterns - detect from data shape
 * 3. Fallback to tree view
 *
 * No special treatment for official types - everyone uses structural inference.
 */
export enum RendererType {
  /** Kanban board with columns and draggable cards */
  KANBAN = 'kanban',
  /** Timeline/chronological view with timestamps */
  TIMELINE = 'timeline',
  /** Simple flat checklist with completion tracking */
  CHECKLIST = 'checklist',
  /** Grouped list with categories */
  GROUPED_LIST = 'grouped-list',
  /** Document viewer for structured content */
  DOCUMENT = 'document',
  /** Generic tree view (fallback for unknown types) */
  TREE = 'tree'
}
