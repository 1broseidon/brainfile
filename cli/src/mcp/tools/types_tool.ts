import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { typesAddCommand, typesListCommand } from '../../commands/types';
import { MemoryLogger } from '../../utils/logger';
import { mcpErrorFrom, mcpResult, requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { typesOutputSchema } from '../schemas';

/** `types`: every type and its place in the graph; add one, like `brainfile types add`. */
export function registerTypesTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'types',
    {
      title: 'Document Types',
      description: 'Every document type the board has, with its place in the graph: role, ID prefix, what it goes under (parents) and holds (children), whether it completes; the five built-ins (epic, spec, plan, task, decision) and the board\'s own. action=add saves a type under types: (name; like takes a built-in\'s place, e.g. bug like task; idPrefix; completable; schema). An alias name (adr, issue) cannot be added.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        action: z.enum(['list', 'add']).optional().describe('Default list'),
        name: z.string().optional().describe('add: the type name'),
        like: z.string().optional().describe('add: the type whose place it takes: epic, spec, plan, task, decision, or one on the board'),
        idPrefix: z.string().optional().describe('add: ID prefix (default: the name)'),
        completable: z.boolean().optional().describe('add: whether it can be completed (default true, or its like: type\'s rule)'),
        schema: z.string().optional().describe('add: a schema URL or path for the type'),
      }),
      outputSchema: typesOutputSchema,
    },
    withBoardCommit('types', defaultFile, async (input) => {
      const filePath = input.file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      const resolved = resolveBrainfile(filePath);
      const action = input.action ?? 'list';
      try {
        let added: { name: string; entry: Record<string, unknown> & { idPrefix: string } } | undefined;
        if (action === 'add') {
          const saved = typesAddCommand({
            file: resolved,
            name: input.name,
            ...(input.idPrefix !== undefined ? { idPrefix: input.idPrefix } : {}),
            ...(input.completable !== undefined ? { completable: input.completable } : {}),
            ...(input.schema !== undefined ? { schema: input.schema } : {}),
            ...(input.like !== undefined ? { like: input.like } : {}),
          }, new MemoryLogger());
          added = { name: saved.typeName, entry: { ...saved.entry } };
        }
        const listed = typesListCommand({ file: resolved }, new MemoryLogger());
        const output = {
          action,
          strict: listed.strict,
          types: listed.types,
          graph: listed.graph,
          aliasEntries: listed.aliasEntries,
          ...(added ? { added } : {}),
        };
        const head = added ? `Saved type '${added.name}'` : `${listed.graph.length} types`;
        return mcpResult(`${head}\n\n${JSON.stringify(output, null, 2)}`, output);
      } catch (error) {
        return mcpErrorFrom(error);
      }
    }),
  );
}
