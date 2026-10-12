/**
 * Where a board lives, in words for the window (spec-15): the two-boards
 * line for the band and the notes and short label for health. Pure, so
 * `node --test` covers it; the host feeds it a survey from core.
 */
import type { BoardSurvey } from '@brainfile/core/repo';
import type { IntegrityView, SettleChoice } from '../shared/api';

const capital = (text: string): string => `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;

function useLabel(kind: string, remote: string | undefined): string {
  if (kind === 'remote') return `Use ${remote ?? 'the remote'}'s`;
  if (kind === 'folder') return 'Use the folder';
  return 'Use the branch';
}

/**
 * `survey` is core's `surveyBoards`; `unfinished` the files a merge left
 * with conflict markers. With nothing to say, everything is empty.
 */
export function integrityView(survey: BoardSurvey, unfinished: string[] = []): IntegrityView {
  const notes: string[] = [];
  const shorts: string[] = [];
  let twoBoards: IntegrityView['twoBoards'] = null;

  const conflict = survey.conflict;
  if (conflict) {
    const { current, other, relation } = conflict;
    const detail =
      relation === 'contained'
        ? `${capital(other.label)} already has everything ${current.label} has.`
        : relation === 'contains'
          ? `${capital(current.label)} already has everything ${other.label} has.`
          : relation === 'unrelated'
            ? 'They share no history.'
            : 'Each has changes the other lacks.';
    const lossless: SettleChoice | null =
      relation === 'contained' ? 'theirs' : relation === 'contains' || relation === 'same' ? 'keep' : 'merge';
    twoBoards = { message: conflict.message, detail, useOther: useLabel(other.kind, other.remote), lossless };
    shorts.push('two copies of the board');
  }
  if (unfinished.length > 0) {
    notes.push(`A merge stopped with conflicts in ${unfinished.join(', ')}. Keep the right version in each, then sync.`);
    shorts.push('a merge is unfinished');
  }
  if (survey.outsideHome) {
    notes.push(`This board is checked out outside ${survey.outsideHome}, where it belongs. brainfile adopt refs/heads/brainfile moves it home.`);
    shorts.push('open in another folder');
  }
  const elsewhere = survey.strayWorktrees.filter((w) => !w.missing);
  for (const stray of elsewhere) {
    notes.push(`The board branch is also checked out at ${stray.path}. It belongs at .brainfile/ only.`);
  }
  if (elsewhere.length > 0) shorts.push('open in two places');
  if (survey.trackedTwice) {
    const branch = survey.trackedTwice.label.replace(/^the copy on /, '');
    notes.push(`${branch} still tracks an old copy of .brainfile/ (${survey.trackedTwice.docs} docs). brainfile migrate --to-branch removes it in one commit.`);
    shorts.push(`old copy still in ${branch}`);
  }
  return { twoBoards, notes, short: shorts[0] ?? null };
}
