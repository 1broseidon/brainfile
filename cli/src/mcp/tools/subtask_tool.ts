import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import {
  writeTaskFile as coreWriteTaskFile,
} from '@brainfile/core';
import { getV2Dirs, findV2Task } from '../../utils/v2-detect';
import { requireV2 } from '../helpers';

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
            })
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

        const t = found.doc.task;
        if (!t.subtasks) t.subtasks = [];
        let nextIndex = t.subtasks.length > 0
          ? Math.max(...t.subtasks.map(st => parseInt(st.id.split('-').pop() || '0', 10))) + 1
          : 1;

        const added: Array<{ id: string; title: string }> = [];
        for (const value of titlesToAdd) {
          const id = `${task}-${nextIndex++}`;
          const newSubtask = { id, title: value, completed: false };
          t.subtasks.push(newSubtask);
          added.push({ id: newSubtask.id, title: newSubtask.title });
        }
        t.updatedAt = new Date().toISOString();
        coreWriteTaskFile(found.filePath, t, found.doc.body);

        if (added.length === 1) {
          return { content: [{ type: 'text' as const, text: `Subtask added: ${added[0].id} - ${added[0].title}` }] };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ added, count: added.length }, null, 2) }] };
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

        const targetIds = useAll ? t.subtasks.map(st => st.id) : listParam;
        if (targetIds.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: subtask or subtasks is required for action=delete (unless all=true)' }], isError: true };
        }

        const existing = new Set(t.subtasks.map(st => st.id));
        const deleted = targetIds.filter(id => existing.has(id));
        const missing = targetIds.filter(id => !existing.has(id));
        if (deleted.length === 0) {
          return { content: [{ type: 'text' as const, text: `Error: Subtask not found: ${targetIds.join(', ')}` }], isError: true };
        }

        const deleteSet = new Set(deleted);
        t.subtasks = t.subtasks.filter(st => !deleteSet.has(st.id));
        t.updatedAt = new Date().toISOString();
        coreWriteTaskFile(found.filePath, t, found.doc.body);

        if (!useAll && deleted.length === 1 && missing.length === 0) {
          return { content: [{ type: 'text' as const, text: `Subtask ${deleted[0]} deleted successfully` }] };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted, missing, count: deleted.length }, null, 2) }] };
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

        const targetIds = useAll ? t.subtasks.map(st => st.id) : listParam;
        if (targetIds.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: subtask or subtasks is required for action=toggle (unless all=true)' }], isError: true };
        }

        const targetSet = new Set(targetIds);
        const updated: Array<{ id: string; completed: boolean }> = [];
        for (const st of t.subtasks) {
          if (!targetSet.has(st.id)) continue;
          st.completed = completed !== undefined ? completed : !st.completed;
          updated.push({ id: st.id, completed: st.completed });
        }
        if (updated.length === 0) {
          return { content: [{ type: 'text' as const, text: `Error: Subtask not found: ${targetIds.join(', ')}` }], isError: true };
        }
        t.updatedAt = new Date().toISOString();
        coreWriteTaskFile(found.filePath, t, found.doc.body);

        if (!useAll && updated.length === 1) {
          const status = updated[0].completed ? 'completed' : 'incomplete';
          return { content: [{ type: 'text' as const, text: `Subtask ${updated[0].id} marked as ${status}` }] };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ updated, count: updated.length }, null, 2) }] };
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

        const updates = new Map<string, string>();
        targetIds.forEach((id, i) => updates.set(id, resolvedTitles.values[i]));
        const updated: Array<{ id: string; title: string }> = [];
        for (const st of t.subtasks) {
          const nextTitle = updates.get(st.id);
          if (nextTitle === undefined) continue;
          st.title = nextTitle;
          updated.push({ id: st.id, title: st.title });
        }
        if (updated.length === 0) {
          return { content: [{ type: 'text' as const, text: `Error: Subtask not found: ${targetIds.join(', ')}` }], isError: true };
        }
        t.updatedAt = new Date().toISOString();
        coreWriteTaskFile(found.filePath, t, found.doc.body);

        if (updated.length === 1) {
          return { content: [{ type: 'text' as const, text: `Subtask ${updated[0].id} updated to "${updated[0].title}"` }] };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ updated, count: updated.length }, null, 2) }] };
      }

      return { content: [{ type: 'text' as const, text: `Error: Unknown action: ${action}` }], isError: true };
    }
  );
}
