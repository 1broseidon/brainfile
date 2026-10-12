import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { BUILT_IN_TEMPLATES } from '@brainfile/core';
import { templateCommand } from '../../commands/template';
import { MemoryLogger } from '../../utils/logger';
import { mcpError, mcpErrorFrom, mcpResult, requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { templateOutputSchema } from '../schemas';

/** The templates as plain data. */
function listTemplates() {
  return BUILT_IN_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    ...(t.template.priority ? { priority: String(t.template.priority) } : {}),
    ...(t.template.tags && t.template.tags.length > 0 ? { tags: [...t.template.tags] } : {}),
    subtasks: (t.template.subtasks ?? []).map((s) => s.title),
  }));
}

/** `template`: list the task templates, or add a task from one, like `brainfile template`. */
export function registerTemplateTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'template',
    {
      title: 'Task Templates',
      description: 'Task templates (bug-report, feature-request, refactor), each with a priority, tags, a description outline and a subtask checklist. action=list shows them; action=use adds a task from one (template, title, optional description and column, default todo).',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        action: z.enum(['list', 'use']).optional().describe('Default list'),
        template: z.string().optional().describe('use: the template ID, e.g. bug-report'),
        title: z.string().optional().describe('use: the task title'),
        description: z.string().optional().describe('use: fills the template\'s description'),
        column: z.string().optional().describe('use: column ID or name (default todo)'),
      }),
      outputSchema: templateOutputSchema,
    },
    withBoardCommit('template', defaultFile, async (input) => {
      const action = input.action ?? 'list';
      if (action === 'list') {
        const output = { action, templates: listTemplates() };
        return mcpResult(JSON.stringify(output, null, 2), output);
      }

      const filePath = input.file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      if (!input.template?.trim()) return mcpError(`use needs a template: ${BUILT_IN_TEMPLATES.map((t) => t.id).join(', ')}`);
      if (!input.title?.trim()) return mcpError('use needs a title');
      try {
        const result = templateCommand({
          file: resolveBrainfile(filePath),
          use: input.template.trim(),
          title: input.title.trim(),
          ...(input.description ? { description: input.description } : {}),
          column: input.column?.trim() || 'todo',
        }, new MemoryLogger());
        if (!result.success || !result.taskId) return mcpError('the task was not created');
        const output = {
          action,
          task: { id: result.taskId, title: input.title.trim(), template: input.template.trim(), column: result.columnId ?? 'todo' },
        };
        return mcpResult(`Task added from ${output.task.template}: ${output.task.id} - ${output.task.title}`, output);
      } catch (error) {
        return mcpErrorFrom(error);
      }
    }),
  );
}
