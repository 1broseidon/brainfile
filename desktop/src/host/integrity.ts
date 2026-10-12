/**
 * Where a board lives, in words for the window (spec-15): the two-boards
 * line for the band, and for health a few words, one plain sentence and
 * what was found, as plain lines an agent can read. Pure, so `node --test`
 * covers it; the host feeds it a survey from core and adds the fix.
 */
import type { BoardSighting, BoardSurvey } from '@brainfile/core/repo';
import type { IntegrityView, SettleChoice } from '../shared/api';

const capital = (text: string): string => `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;

function useLabel(kind: string, remote: string | undefined): string {
  if (kind === 'remote') return `Use ${remote ?? 'the remote'}'s`;
  if (kind === 'folder') return 'Use the folder';
  return 'Use the branch';
}

/** The code branch a code-branch copy rides on: `the copy on main` → `main`. */
const codeBranchOf = (copy: BoardSighting): string => copy.label.replace(/^the copy on /, '');

/** `this folder (7)`. */
const counted = (b: BoardSighting): string => `${b.label} (${b.docs})`;

function day(stamp: string | null): string {
  return stamp ? stamp.slice(0, 10) : 'never';
}

/** One copy of the board as `brainfile where` says it, in a line. */
function copyLine(b: BoardSighting): string {
  let at: string;
  if (b.kind === 'folder') {
    const extra = [b.storage === 'standalone' ? 'its own git repository' : '', b.trackedBy ? `tracked by ${b.trackedBy}` : ''].filter(Boolean);
    at = ` at ${b.path}${extra.length ? ` (${extra.join(', ')})` : ''}`;
  } else if (b.kind === 'branch') {
    at = ` (${b.ref}${b.path ? `, checked out at ${b.path}` : ''})`;
  } else {
    at = ` (${b.ref})`;
  }
  return `${capital(b.label)}: ${b.docs} docs, last change ${day(b.lastChange)}${at}.`;
}

/**
 * Every copy of the board and anything else about where it lives, as plain
 * lines: the `where` survey, for an agent's brief.
 */
export function surveyLines(survey: BoardSurvey, unfinished: string[] = []): string[] {
  const lines = survey.boards.map(copyLine);
  const conflict = survey.conflict;
  if (conflict) lines.push(`${conflict.message} ${relationSentence(conflict.relation, conflict.current, conflict.other)}`);
  const lineage = survey.lineage;
  if (lineage && lineage.unrelated) lines.push(`The local board branch and ${lineage.remote}'s share no history.`);
  else if (lineage && (lineage.ahead || lineage.behind)) {
    lines.push(`The board branch is ${lineage.ahead ?? 0} ahead of and ${lineage.behind ?? 0} behind ${lineage.remote}'s copy.`);
  }
  if (survey.outsideHome) lines.push(`This checkout of the board is outside ${survey.outsideHome}, where it belongs.`);
  for (const stray of survey.strayWorktrees) {
    lines.push(stray.missing ? `A checkout of the board branch at ${stray.path} is registered, but its folder is gone.` : `The board branch is also checked out at ${stray.path}.`);
  }
  if (survey.trackedTwice) lines.push(`The code branch ${codeBranchOf(survey.trackedTwice)} still tracks an old copy of .brainfile/.`);
  if (unfinished.length > 0) lines.push(`A merge stopped with conflicts in ${unfinished.join(', ')}.`);
  return lines;
}

function relationSentence(relation: string, current: BoardSighting, other: BoardSighting): string {
  if (relation === 'contained') return `${capital(other.label)} already has everything ${current.label} has.`;
  if (relation === 'contains') return `${capital(current.label)} already has everything ${other.label} has.`;
  if (relation === 'unrelated') return 'They share no history.';
  return 'Each has changes the other lacks.';
}

/** `board/task-3.md`, `board/task-3.md and 2 more`. */
function firstOf(files: string[]): string {
  return files.length > 1 ? `${files[0]} and ${files.length - 1} more` : files[0];
}

/**
 * `survey` is core's `surveyBoards`; `unfinished` the files a merge left
 * with conflict markers. With nothing to say, everything is empty.
 */
export function integrityView(survey: BoardSurvey, unfinished: string[] = []): IntegrityView {
  const notes: string[] = [];
  /** Each problem: its few words for the list, and its one plain sentence under them. Worst first. */
  const problems: { short: string; line: string }[] = [];
  let twoBoards: IntegrityView['twoBoards'] = null;

  const conflict = survey.conflict;
  if (conflict) {
    const { current, other, relation } = conflict;
    const detail = relationSentence(relation, current, other);
    const lossless: SettleChoice | null =
      relation === 'contained' ? 'theirs' : relation === 'contains' || relation === 'same' ? 'keep' : 'merge';
    twoBoards = { message: conflict.message, detail, useOther: useLabel(other.kind, other.remote), lossless };
    const line =
      relation === 'contained'
        ? `${capital(counted(other))} already has everything ${counted(current)} has.`
        : relation === 'contains'
          ? `${capital(counted(current))} already has everything ${counted(other)} has.`
          : relation === 'unrelated'
            ? `${capital(counted(current))} and ${counted(other)} share no history.`
            : `${capital(counted(current))} and ${counted(other)} each have changes the other lacks.`;
    problems.push({ short: 'two copies', line });
  }
  if (unfinished.length > 0) {
    notes.push(`A merge stopped with conflicts in ${unfinished.join(', ')}. Keep the right version in each, then sync.`);
    problems.push({ short: 'merge unfinished', line: `A merge stopped with conflicts in ${firstOf(unfinished)}.` });
  }
  if (survey.outsideHome) {
    notes.push(`This board is checked out outside ${survey.outsideHome}, where it belongs. brainfile adopt refs/heads/brainfile moves it home.`);
    problems.push({ short: 'open elsewhere', line: 'This board is checked out outside .brainfile/, where it belongs.' });
  }
  const elsewhere = survey.strayWorktrees.filter((w) => !w.missing);
  for (const stray of elsewhere) {
    notes.push(`The board branch is also checked out at ${stray.path}. It belongs at .brainfile/ only.`);
  }
  if (elsewhere.length > 0) {
    problems.push({
      short: 'open twice',
      line: elsewhere.length === 1 ? `Also checked out at ${elsewhere[0].path}.` : `Also checked out in ${elsewhere.length} other folders.`,
    });
  }
  if (survey.trackedTwice) {
    const branch = codeBranchOf(survey.trackedTwice);
    notes.push(`${branch} still tracks an old copy of .brainfile/ (${survey.trackedTwice.docs} docs). brainfile migrate --to-branch removes it in one commit.`);
    problems.push({ short: `old copy in ${branch}`, line: `An old copy of .brainfile/ (${survey.trackedTwice.docs} docs) is still tracked on ${branch}.` });
  }
  const first = problems[0] ?? null;
  return {
    twoBoards,
    notes,
    short: first?.short ?? null,
    line: first?.line ?? null,
    fix: null,
    found: first ? surveyLines(survey, unfinished) : [],
  };
}
