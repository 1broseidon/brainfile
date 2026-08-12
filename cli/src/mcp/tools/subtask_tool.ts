import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import {
  addSubtasksToFile,
  deleteSubtasksFromFile,
  toggleSubtasksInFile,
  updateSubtasksInFile,
} from '@brainfile/core';
import { getV2Dirs, findV2Task } from '../../utils/v2-detect';
import { requireV2 } from '../helpers';
import { subtaskOutputSchema } from '../schemas';

export function registerSubtaskTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'subtask',
    {
      title: 'Subtask',
      description: 'Unified subtask tool for add/toggle/delete/update with single, array, or all targeting',
      inputSchema: z.object({
              action: z.enum(['add', 'toggle', 'delete', 'update']).describe('Subtask action'),
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              task: z.string().describe('Parent task ID'),
              subtask: z.string().optional().describe('Single subtask title/id depending on action'),
              subtasks: z.array(z.string()).optional().describe('Subtask titles/ids depending on action'),
              title: z.string().optional().describe('New title for update action'),
              titles: z.array(z.string()).optional().describe('Optional titles for batch update action'),
              completed: z.boolean().optional().describe('For toggle action: set explicit completed state (true/false) instead of flipping'),
              all: z.boolean().optional().describe('For toggle/delete action: target all subtasks in the task'),
            }),
      outputSchema: subtaskOutputSchema
    },
    async ({ action, file, task, subtask, subtasks, title, titles, completed, all }) => {
      const filePath = file || defaultFile;
      const listParam = subtasks ?? (subtask ? [subtask] : []);
      const useAll = all === true;

      const guard = requireV2(filePath);
      if (guard) return guard;

      const resolveUpdateTitles = (ids: string[]): { ok: true; values: string[] } | { ok: false; error: string } => {
        if (titles && titles.length > 0) {
          if (titles.length !== ids.length && titles.length !== 1) {
            return { ok: false, error: 'titles length must match subtasks length (or provide a single title to apply to all)' };
          }
          const values = titles.length === 1 ? ids.map(() => titles[0]) : titles;
          return { ok: true, values };
        }
        if (title !== undefined) {
          return { ok: true, values: ids.map(() => title) };
        }
        return { ok: false, error: 'title or titles is required for action=update' };
      };

      // ── add ────────────────────────────────────────────────────────────────
      if (action === 'add') {
        const titlesToAdd = listParam.map(value => value.trim()).filter(Boolean);
        if (titlesToAdd.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: subtask or subtasks is required for action=add' }], isError: true };
        }

        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }

        const result = addSubtasksToFile(found.filePath, titlesToAdd);
        if (!result.success || !result.affected) {
          return { content: [{ type: 'text' as const, text: `Error: ${result.error || 'Failed to add subtasks'}` }], isError: true };
        }
        const added = result.affected.map(st => ({ id: st.id, title: st.title }));
        // Plural shape regardless of count: item count must not change the
        // structure agents parse. Only the text keeps its singular phrasing.
        const output = { action: 'add' as const, added, count: added.length };

        if (added.length === 1) {
          return {
            content: [{ type: 'text' as const, text: `Subtask added: ${added[0].id} - ${added[0].title}` }],
            structuredContent: output,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }

      // ── delete ─────────────────────────────────────────────────────────────
      if (action === 'delete') {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }
        const t = found.doc.task;
        if (!t.subtasks || t.subtasks.length === 0) {
          return { content: [{ type: 'text' as const, text: `Error: Task has no subtasks` }], isError: true };
        }

        if (!useAll && listParam.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: subtask or subtasks is required for action=delete (unless all=true)' }], isError: true };
        }

        const result = deleteSubtasksFromFile(found.filePath, useAll ? 'all' : listParam);
        if (!result.success || !result.affected) {
          return { content: [{ type: 'text' as const, text: `Error: ${result.error || 'Failed to delete subtasks'}` }], isError: true };
        }
        const deleted = result.affected.map(st => st.id);
        const missing = result.missing ?? [];
        const output = { action: 'delete' as const, deleted, missing, count: deleted.length };

        if (!useAll && deleted.length === 1 && missing.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `Subtask ${deleted[0]} deleted successfully` }],
            structuredContent: output,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }

      // ── toggle ─────────────────────────────────────────────────────────────
      if (action === 'toggle') {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }
        const t = found.doc.task;
        if (!t.subtasks || t.subtasks.length === 0) {
          return { content: [{ type: 'text' as const, text: `Error: Task has no subtasks` }], isError: true };
        }

        if (!useAll && listParam.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: subtask or subtasks is required for action=toggle (unless all=true)' }], isError: true };
        }

        const result = toggleSubtasksInFile(found.filePath, useAll ? 'all' : listParam, completed);
        if (!result.success || !result.affected) {
          return { content: [{ type: 'text' as const, text: `Error: ${result.error || 'Failed to toggle subtasks'}` }], isError: true };
        }
        const updated = result.affected.map(st => ({ id: st.id, completed: st.completed }));
        // `toggle` and `update` both key their payload `updated` but carry
        // different item shapes, so the action tag is what tells them apart.
        const output = { action: 'toggle' as const, updated, count: updated.length };

        if (!useAll && updated.length === 1) {
          const status = updated[0].completed ? 'completed' : 'incomplete';
          return {
            content: [{ type: 'text' as const, text: `Subtask ${updated[0].id} marked as ${status}` }],
            structuredContent: output,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }

      // ── update ─────────────────────────────────────────────────────────────
      if (action === 'update') {
        const targetIds = listParam;
        if (targetIds.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: subtask or subtasks is required for action=update' }], isError: true };
        }
        const resolvedTitles = resolveUpdateTitles(targetIds);
        if (!resolvedTitles.ok) {
          return { content: [{ type: 'text' as const, text: `Error: ${resolvedTitles.error}` }], isError: true };
        }

        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }
        const t = found.doc.task;
        if (!t.subtasks || t.subtasks.length === 0) {
          return { content: [{ type: 'text' as const, text: `Error: Task has no subtasks` }], isError: true };
        }

        const result = updateSubtasksInFile(
          found.filePath,
          targetIds.map((id, i) => ({ id, title: resolvedTitles.values[i] })),
        );
        if (!result.success || !result.affected) {
          return { content: [{ type: 'text' as const, text: `Error: ${result.error || 'Failed to update subtasks'}` }], isError: true };
        }
        const updated = result.affected.map(st => ({ id: st.id, title: st.title }));
        const output = { action: 'update' as const, updated, count: updated.length };

        if (updated.length === 1) {
          return {
            content: [{ type: 'text' as const, text: `Subtask ${updated[0].id} updated to "${updated[0].title}"` }],
            structuredContent: output,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }

      return { content: [{ type: 'text' as const, text: `Error: Unknown action: ${action}` }], isError: true };
    }
  );
}
