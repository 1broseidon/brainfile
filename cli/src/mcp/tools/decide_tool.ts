import type { McpServer } from "@modelcontextprotocol/server";
import * as path from 'path';
import { z } from 'zod';
import { decideFile, readBoardConfig, summarizeDecision, validateDecideInput, type DecideResult } from '@brainfile/core';
import { ensureV2Dirs } from '../../utils/v2-detect';
import { detectAgent } from '../../utils/actor';
import { requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { decideOutputSchema } from '../schemas';

/** The decide/supersede input fields both tools share. */
export const decisionInputShape = {
  file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
  text: z.string().describe('The decision and why. The first line becomes the title unless title is given'),
  title: z.string().optional().describe('Title (default: the first line of text)'),
  kind: z.enum(['decision', 'preference', 'constraint', 'rule']).optional().describe('How firmly it binds (default decision)'),
  stance: z.enum(['prefers', 'rejects', 'requires', 'forbids']).optional().describe('What it says about subject; give both or neither. check reads them'),
  subject: z.string().optional().describe('What the stance is about: a package, a pattern, a tool'),
  holdsWhile: z.string().optional().describe('The condition under which it holds'),
  recheck: z.string().optional().describe('When or why to look at it again'),
  validUntil: z.string().optional().describe('Date after which it needs a look (YYYY-MM-DD)'),
  source: z.string().optional().describe('A file it rests on, relative to the project root; its sha256 is recorded'),
  package: z.string().optional().describe('A package version it rests on: name<op>version, e.g. zod>=4.3 or engines.node>=20'),
  forWork: z.array(z.string()).optional().describe('IDs of work that rests on it (each gets it in decisions:)'),
  tags: z.array(z.string()).optional().describe('Tags'),
};

export interface DecisionToolInput {
  file?: string;
  text: string;
  title?: string;
  kind?: string;
  stance?: string;
  subject?: string;
  holdsWhile?: string;
  recheck?: string;
  validUntil?: string;
  source?: string;
  package?: string;
  forWork?: string[];
  tags?: string[];
  claimKey?: string;
}

/** Tool input → core input. A relative `source` is relative to the project root. */
export function decideInputFrom(input: DecisionToolInput, projectRoot: string) {
  return {
    text: input.text,
    ...(input.claimKey !== undefined ? { claimKey: input.claimKey } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.stance ? { stance: input.stance } : {}),
    ...(input.subject ? { subject: input.subject } : {}),
    ...(input.holdsWhile ? { holdsWhile: input.holdsWhile } : {}),
    ...(input.recheck ? { recheck: input.recheck } : {}),
    ...(input.validUntil ? { validUntil: input.validUntil } : {}),
    ...(input.source ? { sourcePath: path.resolve(projectRoot, input.source) } : {}),
    ...(input.package ? { packageVersion: input.package } : {}),
    ...(input.forWork ? { forWork: input.forWork } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
  };
}

/** A core decide result as the tool's text and structured content. */
export function decideToolResult(result: DecideResult, verb: string) {
  if (!result.success || !result.decision) {
    return { content: [{ type: 'text' as const, text: `Error: ${result.error ?? 'the decision was not written'}` }], isError: true as const };
  }
  const output = {
    decision: summarizeDecision(result.decision),
    duplicate: result.duplicate === true,
    superseded: result.superseded.map((t) => t.id),
    familyWasEmpty: result.familyWasEmpty,
    related: result.related,
    linked: result.linked,
    notFound: result.notFound,
  };
  const lines = [
    result.duplicate
      ? `Already current: ${output.decision.id} (${output.decision.title})`
      : `${verb} ${output.decision.id}${output.decision.claimKey ? ` [${output.decision.claimKey}]` : ''}: ${output.decision.title}`,
    ...output.superseded.map((id) => `Superseded ${id} (moved to logs/)`),
    ...output.related.map((r) => `Related family: ${r.claimKey} (${r.id}) ${r.title}`),
  ];
  return {
    content: [{ type: 'text' as const, text: `${lines.join('\n')}\n\n${JSON.stringify(output, null, 2)}` }],
    structuredContent: output,
  };
}

/**
 * `decide`: record a decision in its claim family. The family's current
 * decision is superseded (status, links both ways, moved to logs/).
 */
export function registerDecideTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'decide',
    {
      title: 'Decide',
      description: 'Record a decision (a standing choice) in its claim family. A family has one current decision: when it already has one, that one is superseded (status, supersedes/supersededBy both ways, moved to logs/). Re-deciding the same words changes nothing (duplicate). When the family was empty, related families that may say the same thing are returned. stance+subject let check catch actions that contradict it; validUntil, source and package are predicates check evaluates.',
      inputSchema: z.object({
        claimKey: z.string().describe('Dotted claim family, e.g. dependency.http-client'),
        ...decisionInputShape,
        noSupersede: z.boolean().optional().describe('Keep the family\'s current decision current too (check will say review)'),
      }),
      outputSchema: decideOutputSchema,
    },
    withBoardCommit('decide', defaultFile, async (input) => {
      const filePath = input.file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      const resolved = resolveBrainfile(filePath);
      const projectRoot = path.dirname(path.dirname(resolved));
      const coreInput = decideInputFrom(input, projectRoot);
      const invalid = validateDecideInput(coreInput, { requireClaimKey: true });
      if (invalid) return { content: [{ type: 'text' as const, text: `Error: ${invalid}` }], isError: true as const };
      const agent = detectAgent()?.name;
      const result = decideFile(ensureV2Dirs(resolved), coreInput, {
        types: readBoardConfig(resolved)?.config.types,
        noSupersede: input.noSupersede === true,
        ...(agent ? { agent } : {}),
      });
      return decideToolResult(result, 'Decided');
    }),
  );
}
