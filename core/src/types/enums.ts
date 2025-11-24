/**
 * Type system enums for brainfile discrimination and rendering
 * @packageDocumentation
 */

/**
 * Official brainfile types
 * Note: The type system is OPEN - any string value is valid for custom types.
 * This enum only defines the official types hosted at brainfile.md/v1/*.json
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
 * Tools use structural inference + schema hints to select the appropriate renderer
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

/**
 * Mapping of official types to their default renderers
 */
export const TYPE_TO_RENDERER: Record<BrainfileType, RendererType> = {
  [BrainfileType.BOARD]: RendererType.KANBAN,
  [BrainfileType.JOURNAL]: RendererType.TIMELINE,
  [BrainfileType.COLLECTION]: RendererType.GROUPED_LIST,
  [BrainfileType.CHECKLIST]: RendererType.CHECKLIST,
  [BrainfileType.DOCUMENT]: RendererType.DOCUMENT
};
