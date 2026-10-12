/**
 * The first message of a chat that hands a board problem to an agent
 * (task-34): what Brainfile found, in plain text, and the one instruction
 * that matters, to ask before changing anything. Pure, so `node --test`
 * covers it.
 */
import type { IntegrityView } from '../../shared/api';

export function problemBrief(projectName: string, integrity: IntegrityView): string {
  const found = integrity.found.length ? integrity.found : [integrity.line ?? integrity.short ?? 'Something is off with where this board lives.'];
  const lines = [
    `Brainfile says the board for ${projectName} has a problem: ${integrity.short ?? 'see below'}.`,
    '',
    'What Brainfile found (as brainfile where reports it):',
    ...found.map((line) => `- ${line}`),
  ];
  if (integrity.notes.length) lines.push('', 'Notes:', ...integrity.notes.map((note) => `- ${note}`));
  if (integrity.fix) lines.push('', `Brainfile's own safe fix would: ${integrity.fix.words}.`);
  lines.push(
    '',
    'Look at every copy (brainfile where lists them; read each, not only the counts), explain the difference in a few lines, and ask me how to settle it.',
    'Change nothing until I choose: no adopt, merge-boards, migrate or backups restore, no git command that writes, no edits to board files.'
  );
  return lines.join('\n');
}
