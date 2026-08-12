import { describe, test, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const mcpEntry = path.join(__dirname, '..', 'commands', 'mcp.ts');
const toolsDir = path.join(__dirname, '..', 'mcp', 'tools');

const entrySource = fs.readFileSync(mcpEntry, 'utf-8');
const toolSources: Record<string, string> = {};
for (const file of fs.readdirSync(toolsDir)) {
  if (!file.endsWith('.ts')) continue;
  toolSources[file] = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
}
const allToolSource = Object.values(toolSources).join('\n');

describe('mcp consolidated tools contract', () => {
  test('registers only the consolidated 10 tools', () => {
    const names = [...allToolSource.matchAll(/server\.registerTool\(\s*'([^']+)'/g)].map(match => match[1]);

    expect(names.sort()).toEqual([
      'contract',
      'get_task',
      'list_tasks',
      'search',
      'subtask',
      'task_add',
      'task_complete',
      'task_delete',
      'task_move',
      'task_patch',
    ]);
  });

  test('removes legacy mcp tools from registration surface', () => {
    const legacy = [
      'search_tasks',
      'add_task',
      'move_task',
      'patch_task',
      'delete_task',
      'complete_task',
      'archive_task',
      'restore_task',
      'add_subtask',
      'delete_subtask',
      'toggle_subtask',
      'update_subtask',
      'bulk_set_subtasks',
      'complete_all_subtasks',
      'bulk_move_tasks',
      'bulk_patch_tasks',
      'bulk_delete_tasks',
      'bulk_archive_tasks',
      'attach_contract',
      'contract_pickup',
      'contract_deliver',
      'contract_validate',
      'list_types',
      'list_rules',
      'add_rule',
      'delete_rule',
      'append_log',
      'search_logs',
    ];

    for (const tool of legacy) {
      const pattern = new RegExp(`registerTool\\(\\s*'${tool}'`);
      expect(allToolSource).not.toMatch(pattern);
      expect(entrySource).not.toMatch(pattern);
    }
  });

  test('subtask tool is unified and supports single/array/all targeting', () => {
    const src = toolSources['subtask_tool.ts'];
    expect(src).toBeDefined();
    expect(src).toContain("server.registerTool(\n    'subtask'");
    expect(src).toContain("action: z.enum(['add', 'toggle', 'delete', 'update'])");
    expect(src).toContain('subtask: z.string().optional()');
    expect(src).toContain('subtasks: z.array(z.string()).optional()');
    expect(src).toContain('all: z.boolean().optional()');
  });

  test('contract tool stays unified with action parameter', () => {
    const src = toolSources['contract_tool.ts'];
    expect(src).toBeDefined();
    expect(src).toContain("server.registerTool(\n    'contract'");
    expect(src).toContain("action: z.enum(['attach', 'pickup', 'deliver', 'validate', 'graph', 'activate'])");
    expect(src).toContain("tasks: z.array(z.object({");
    expect(src).toContain("activate: z.boolean().optional().describe('graph only: when true, attached contracts start in ready instead of draft')");
  });

  test('task_move and task_patch support taskId as string or string[]', () => {
    const unionSnippet = "z.union([z.string(), z.array(z.string())]).optional().describe('Task ID or array of task IDs";
    expect(toolSources['task_move_tool.ts']).toContain(`taskId: ${unionSnippet} to move')`);
    expect(toolSources['task_patch_tool.ts']).toContain(`taskId: ${unionSnippet} to update')`);
  });

  test('task_complete absorbs archive behavior via destination param', () => {
    const src = toolSources['task_complete_tool.ts'];
    expect(src).toBeDefined();
    expect(src).toContain("server.registerTool(\n    'task_complete'");
    expect(src).toContain("destination: z.enum(['local', 'github', 'linear']).optional()");
  });

  /**
   * Every tool declares an outputSchema, and every tool file that declares one
   * must return structuredContent — the SDK turns a missing structuredContent
   * on a non-error result into an "Output validation error". Locked here the
   * same way this file already locks the tool count and consolidation shape;
   * the behavioural checks live in mcp-structured-output.test.ts.
   */
  test('all 10 tools declare an outputSchema and return structuredContent', () => {
    const toolFiles = Object.keys(toolSources).filter(f => f.endsWith('_tool.ts'));
    expect(toolFiles).toHaveLength(10);

    for (const file of toolFiles) {
      const src = toolSources[file];
      expect(`${file}: ${src.includes('outputSchema:')}`).toBe(`${file}: true`);
      expect(`${file}: ${src.includes('structuredContent:')}`).toBe(`${file}: true`);
    }
  });

  /**
   * Output schemas live in one module so the root shape stays reviewable:
   * a non-object schema root makes the 2025-era codec re-wrap
   * structuredContent as `{result: …}` while the 2026-era codec does not,
   * silently splitting the two eras apart.
   */
  test('output schemas are defined in the shared schemas module', () => {
    const schemaSource = fs.readFileSync(
      path.join(__dirname, '..', 'mcp', 'schemas.ts'),
      'utf-8',
    );
    for (const exported of [
      'listTasksOutputSchema',
      'getTaskOutputSchema',
      'searchOutputSchema',
      'taskAddOutputSchema',
      'taskMoveOutputSchema',
      'taskPatchOutputSchema',
      'taskDeleteOutputSchema',
      'subtaskOutputSchema',
      'contractOutputSchema',
      'taskCompleteOutputSchema',
    ]) {
      expect(schemaSource).toContain(`export const ${exported}`);
    }
  });
});
