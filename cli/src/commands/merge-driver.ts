/**
 * `brainfile merge-driver <base> <ours> <theirs>` — git merge driver for
 * board documents (spec-9). Registered by init/migrate/sync as
 * `merge.brainfile.driver`, selected by `.gitattributes` on the board branch.
 *
 * Frontmatter merges field by field: a field changed on one side takes that
 * side; changed on both, the later `updatedAt` wins and a tie goes to theirs,
 * so both machines converge on the same answer. The body goes through git's
 * own three-way text merge; a conflict whose two sides are both list items
 * (log entries, notes) resolves by union ordered by timestamp. Anything else
 * keeps git's markers and exits 1 so `sync` can name the file.
 */
import * as fs from 'fs';
import { mergeBoardDocuments } from '@brainfile/core/repo';

export {
  mergeBodies,
  mergeBoardDocuments,
  mergeFields,
  summarizeFieldChanges,
  type MergeOutcome,
} from '@brainfile/core/repo';

export interface MergeDriverOptions {
  base: string;
  ours: string;
  theirs: string;
}

/**
 * Entry point for git: reads the three files, writes the result over `ours`,
 * returns the exit code (0 clean, 1 conflicts remain, 2 usage).
 */
export function mergeDriverCommand(options: MergeDriverOptions): number {
  const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '');
  if (!options.ours || !options.theirs) return 2;
  const outcome = mergeBoardDocuments(read(options.base), read(options.ours), read(options.theirs));
  fs.writeFileSync(options.ours, outcome.content, 'utf-8');
  return outcome.clean ? 0 : 1;
}
