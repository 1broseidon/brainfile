/**
 * Schema hints parser for x-brainfile-* extensions in JSON Schema
 * @packageDocumentation
 */

import { SchemaHints } from './inference';

/**
 * Parse x-brainfile-* extensions from a JSON Schema object
 *
 * Supported extensions:
 * - x-brainfile-renderer: Force specific renderer (kanban, timeline, checklist, tree)
 * - x-brainfile-columns-path: JSONPath to column-like array
 * - x-brainfile-items-path: JSONPath to item arrays
 * - x-brainfile-title-field: Field to use as item title
 * - x-brainfile-status-field: Field for status/completion
 * - x-brainfile-timestamp-field: Field for timestamps
 *
 * @param schema - JSON Schema object (can be loaded from URL or inline)
 * @returns Parsed schema hints
 */
export function parseSchemaHints(schema: any): SchemaHints {
  const hints: SchemaHints = {};

  if (!schema || typeof schema !== 'object') {
    return hints;
  }

  // Parse x-brainfile-renderer
  if (schema['x-brainfile-renderer'] && typeof schema['x-brainfile-renderer'] === 'string') {
    hints.renderer = schema['x-brainfile-renderer'];
  }

  // Parse x-brainfile-columns-path
  if (schema['x-brainfile-columns-path'] && typeof schema['x-brainfile-columns-path'] === 'string') {
    hints.columnsPath = schema['x-brainfile-columns-path'];
  }

  // Parse x-brainfile-items-path
  if (schema['x-brainfile-items-path'] && typeof schema['x-brainfile-items-path'] === 'string') {
    hints.itemsPath = schema['x-brainfile-items-path'];
  }

  // Parse x-brainfile-title-field
  if (schema['x-brainfile-title-field'] && typeof schema['x-brainfile-title-field'] === 'string') {
    hints.titleField = schema['x-brainfile-title-field'];
  }

  // Parse x-brainfile-status-field
  if (schema['x-brainfile-status-field'] && typeof schema['x-brainfile-status-field'] === 'string') {
    hints.statusField = schema['x-brainfile-status-field'];
  }

  // Parse x-brainfile-timestamp-field
  if (schema['x-brainfile-timestamp-field'] && typeof schema['x-brainfile-timestamp-field'] === 'string') {
    hints.timestampField = schema['x-brainfile-timestamp-field'];
  }

  return hints;
}

/**
 * Load and parse schema hints from a schema URL
 *
 * @param schemaUrl - URL to JSON Schema
 * @returns Parsed schema hints or null on error
 */
export async function loadSchemaHints(schemaUrl: string): Promise<SchemaHints | null> {
  try {
    const response = await fetch(schemaUrl);
    if (!response.ok) {
      console.warn(`Failed to load schema from ${schemaUrl}: ${response.statusText}`);
      return null;
    }

    const schema = await response.json();
    return parseSchemaHints(schema);
  } catch (error) {
    console.warn(`Error loading schema from ${schemaUrl}:`, error);
    return null;
  }
}
