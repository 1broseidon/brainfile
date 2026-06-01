/**
 * Type and renderer inference logic
 * @packageDocumentation
 */

import { BrainfileType, RendererType } from './types/enums';
import { Board } from './types/board';
import { Journal } from './types/journal';

/**
 * Infer brainfile type from various signals
 *
 * Priority order:
 * 1. Explicit type field in frontmatter
 * 2. Schema URL pattern (e.g., /v1/journal.json → journal)
 * 3. File name suffix (e.g., brainfile.journal.md → journal)
 * 4. Structure analysis (detect required fields)
 * 5. Default to 'board'
 *
 * @param data - Parsed frontmatter data
 * @param filename - Optional filename for suffix detection
 * @returns The inferred brainfile type
 */
export function inferType(data: any, filename?: string): string {
  // 1. Explicit type field
  if (data.type && typeof data.type === 'string') {
    return data.type;
  }

  // 2. Schema URL pattern
  if (data.schema && typeof data.schema === 'string') {
    const schemaMatch = data.schema.match(/\/v1\/(\w+)\.json$/);
    if (schemaMatch) {
      return schemaMatch[1];
    }
  }

  // 3. File name suffix (brainfile.TYPE.md)
  if (filename) {
    const filenameMatch = filename.match(/brainfile\.(\w+)\.md$/);
    if (filenameMatch) {
      return filenameMatch[1];
    }
  }

  // 4. Structure analysis
  const detectedType = detectTypeFromStructure(data);
  if (detectedType) {
    return detectedType;
  }

  // 5. Default
  return BrainfileType.BOARD;
}

/**
 * Detect brainfile type from data structure
 * Looks for type-specific required fields
 *
 * @param data - Parsed frontmatter data
 * @returns The detected type or null if unknown
 */
function detectTypeFromStructure(data: any): string | null {
  // Check for journal structure (entries array)
  if (Array.isArray(data.entries)) {
    return BrainfileType.JOURNAL;
  }

  // Check for board structure (columns array)
  if (Array.isArray(data.columns)) {
    return BrainfileType.BOARD;
  }

  // Check for collection structure (categories array)
  if (Array.isArray(data.categories)) {
    return BrainfileType.COLLECTION;
  }

  // Check for checklist structure (flat items array with completed)
  if (Array.isArray(data.items) && data.items.length > 0) {
    const hasCompleted = data.items.every((item: any) =>
      typeof item.completed === 'boolean'
    );
    if (hasCompleted) {
      return BrainfileType.CHECKLIST;
    }
  }

  // Check for document structure (sections array)
  if (Array.isArray(data.sections)) {
    return BrainfileType.DOCUMENT;
  }

  return null;
}

/**
 * Infer renderer type from brainfile data and schema hints
 *
 * Pure structural inference - no special treatment for official types.
 * Custom types with identical structure render identically.
 *
 * Priority order:
 * 1. Schema hint (x-brainfile-renderer in loaded schema) - explicit override
 * 2. Structural pattern matching - detect from data shape
 * 3. Fallback to tree view
 *
 * @param type - The brainfile type (informational only, not used for inference)
 * @param data - Parsed frontmatter data for structural analysis
 * @param schemaHints - Optional schema hints from loaded schema
 * @returns The inferred renderer type
 */
export function inferRenderer(
  type: string,
  data: any,
  schemaHints?: SchemaHints
): RendererType {
  // 1. Schema hint (explicit override)
  if (schemaHints?.renderer) {
    return schemaHints.renderer as RendererType;
  }

  // 2. Structural pattern matching (universal code path)
  const rendererFromStructure = detectRendererFromStructure(data);
  if (rendererFromStructure) {
    return rendererFromStructure;
  }

  // 3. Fallback
  return RendererType.TREE;
}

/**
 * Detect renderer from data structure patterns
 *
 * @param data - Parsed frontmatter data
 * @returns The detected renderer or null if unknown
 */
function detectRendererFromStructure(data: any): RendererType | null {
  // Columns with nested items → kanban
  if (Array.isArray(data.columns)) {
    return RendererType.KANBAN;
  }

  // Entries with timestamps → timeline
  if (Array.isArray(data.entries) && data.entries.length > 0) {
    const hasTimestamps = data.entries.some(
      (entry: any) => entry.createdAt || entry.timestamp
    );
    if (hasTimestamps) {
      return RendererType.TIMELINE;
    }
  }

  // Items with completed boolean → checklist
  if (Array.isArray(data.items) && data.items.length > 0) {
    const hasCompleted = data.items.every((item: any) =>
      typeof item.completed === 'boolean'
    );
    if (hasCompleted) {
      return RendererType.CHECKLIST;
    }
  }

  // Categories with nested items → grouped-list
  if (Array.isArray(data.categories)) {
    return RendererType.GROUPED_LIST;
  }

  // Sections array → document
  if (Array.isArray(data.sections)) {
    return RendererType.DOCUMENT;
  }

  return null;
}

/**
 * Schema hints extracted from JSON Schema x-brainfile-* extensions
 */
export interface SchemaHints {
  /** Preferred renderer */
  renderer?: string;
  /** JSONPath to columns array */
  columnsPath?: string;
  /** JSONPath to items arrays */
  itemsPath?: string;
  /** Field to use as item title */
  titleField?: string;
  /** Field to use for status/completion */
  statusField?: string;
  /** Field to use for timestamps */
  timestampField?: string;
}
