/**
 * Tests for type and renderer inference
 */

import { inferType, inferRenderer } from '../inference';
import { BrainfileType, RendererType } from '../types/enums';
import { parseSchemaHints } from '../schemaHints';

describe('inferType', () => {
  it('should detect explicit type field', () => {
    const data = { type: 'journal', title: 'My Journal', entries: [] };
    expect(inferType(data)).toBe('journal');
  });

  it('should infer type from schema URL', () => {
    const data = { schema: 'https://brainfile.md/v1/journal.json', title: 'My Journal' };
    expect(inferType(data)).toBe('journal');
  });

  it('should infer type from filename suffix', () => {
    const data = { title: 'My Journal' };
    const filename = 'brainfile.journal.md';
    expect(inferType(data, filename)).toBe('journal');
  });

  it('should detect board from columns structure', () => {
    const data = { title: 'My Board', columns: [] };
    expect(inferType(data)).toBe(BrainfileType.BOARD);
  });

  it('should detect journal from entries structure', () => {
    const data = { title: 'My Journal', entries: [] };
    expect(inferType(data)).toBe(BrainfileType.JOURNAL);
  });

  it('should detect collection from categories structure', () => {
    const data = { title: 'My Collection', categories: [] };
    expect(inferType(data)).toBe(BrainfileType.COLLECTION);
  });

  it('should detect checklist from items with completed', () => {
    const data = {
      title: 'My Checklist',
      items: [
        { id: '1', title: 'Item 1', completed: false },
        { id: '2', title: 'Item 2', completed: true }
      ]
    };
    expect(inferType(data)).toBe(BrainfileType.CHECKLIST);
  });

  it('should detect document from sections structure', () => {
    const data = { title: 'My Document', sections: [] };
    expect(inferType(data)).toBe(BrainfileType.DOCUMENT);
  });

  it('should default to board if no indicators found', () => {
    const data = { title: 'Unknown' };
    expect(inferType(data)).toBe(BrainfileType.BOARD);
  });

  it('should prioritize explicit type over structure', () => {
    const data = { type: 'journal', title: 'My Board', columns: [] };
    expect(inferType(data)).toBe('journal');
  });
});

describe('inferRenderer', () => {
  it('should use schema hint if provided', () => {
    const data = { type: 'board', columns: [] };
    const schemaHints = { renderer: 'timeline' };
    expect(inferRenderer('board', data, schemaHints)).toBe(RendererType.TIMELINE);
  });

  it('should map official board type to kanban renderer', () => {
    const data = { columns: [] };
    expect(inferRenderer(BrainfileType.BOARD, data)).toBe(RendererType.KANBAN);
  });

  it('should map official journal type to timeline renderer', () => {
    const data = { entries: [] };
    expect(inferRenderer(BrainfileType.JOURNAL, data)).toBe(RendererType.TIMELINE);
  });

  it('should map official collection type to grouped-list renderer', () => {
    const data = { categories: [] };
    expect(inferRenderer(BrainfileType.COLLECTION, data)).toBe(RendererType.GROUPED_LIST);
  });

  it('should map official checklist type to checklist renderer', () => {
    const data = { items: [] };
    expect(inferRenderer(BrainfileType.CHECKLIST, data)).toBe(RendererType.CHECKLIST);
  });

  it('should map official document type to document renderer', () => {
    const data = { sections: [] };
    expect(inferRenderer(BrainfileType.DOCUMENT, data)).toBe(RendererType.DOCUMENT);
  });

  it('should infer kanban from columns structure', () => {
    const data = { columns: [] };
    expect(inferRenderer('custom-board', data)).toBe(RendererType.KANBAN);
  });

  it('should infer timeline from entries with timestamps', () => {
    const data = {
      entries: [{ id: '1', createdAt: '2024-01-01T00:00:00Z' }]
    };
    expect(inferRenderer('custom-journal', data)).toBe(RendererType.TIMELINE);
  });

  it('should infer checklist from items with completed', () => {
    const data = {
      items: [{ id: '1', completed: false }]
    };
    expect(inferRenderer('custom-checklist', data)).toBe(RendererType.CHECKLIST);
  });

  it('should default to tree view for unknown types', () => {
    const data = { customField: 'value' };
    expect(inferRenderer('unknown-type', data)).toBe(RendererType.TREE);
  });
});

describe('parseSchemaHints', () => {
  it('should parse x-brainfile-renderer', () => {
    const schema = {
      'x-brainfile-renderer': 'kanban'
    };
    const hints = parseSchemaHints(schema);
    expect(hints.renderer).toBe('kanban');
  });

  it('should parse x-brainfile-columns-path', () => {
    const schema = {
      'x-brainfile-columns-path': '$.columns'
    };
    const hints = parseSchemaHints(schema);
    expect(hints.columnsPath).toBe('$.columns');
  });

  it('should parse x-brainfile-items-path', () => {
    const schema = {
      'x-brainfile-items-path': '$.columns[*].tasks'
    };
    const hints = parseSchemaHints(schema);
    expect(hints.itemsPath).toBe('$.columns[*].tasks');
  });

  it('should parse x-brainfile-title-field', () => {
    const schema = {
      'x-brainfile-title-field': 'title'
    };
    const hints = parseSchemaHints(schema);
    expect(hints.titleField).toBe('title');
  });

  it('should parse x-brainfile-status-field', () => {
    const schema = {
      'x-brainfile-status-field': 'priority'
    };
    const hints = parseSchemaHints(schema);
    expect(hints.statusField).toBe('priority');
  });

  it('should parse x-brainfile-timestamp-field', () => {
    const schema = {
      'x-brainfile-timestamp-field': 'createdAt'
    };
    const hints = parseSchemaHints(schema);
    expect(hints.timestampField).toBe('createdAt');
  });

  it('should parse multiple hints', () => {
    const schema = {
      'x-brainfile-renderer': 'kanban',
      'x-brainfile-columns-path': '$.columns',
      'x-brainfile-items-path': '$.columns[*].tasks',
      'x-brainfile-title-field': 'title',
      'x-brainfile-status-field': 'priority'
    };
    const hints = parseSchemaHints(schema);
    expect(hints).toEqual({
      renderer: 'kanban',
      columnsPath: '$.columns',
      itemsPath: '$.columns[*].tasks',
      titleField: 'title',
      statusField: 'priority'
    });
  });

  it('should return empty hints for null schema', () => {
    const hints = parseSchemaHints(null);
    expect(hints).toEqual({});
  });

  it('should return empty hints for non-object schema', () => {
    const hints = parseSchemaHints('not an object');
    expect(hints).toEqual({});
  });

  it('should ignore non-string hint values', () => {
    const schema = {
      'x-brainfile-renderer': 123,  // wrong type
      'x-brainfile-columns-path': '$.columns'  // correct type
    };
    const hints = parseSchemaHints(schema);
    expect(hints).toEqual({
      columnsPath: '$.columns'
    });
  });
});
