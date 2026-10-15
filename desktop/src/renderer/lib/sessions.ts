/**
 * The dock's sessions and the palette's recent documents (decision-8). A
 * session is an agent at work with you on a board: a chat thread (a
 * discussion is a thread about one task) or a hand-off of a task. The dock
 * shows the sessions of the board in front; documents you open are only
 * remembered, for the palette. Pure functions; `npm test` in desktop/.
 */
import type { AgentRun, LeadView, ReadyView } from '../../shared/api';

/** A chat thread, by its ID, or a hand-off, by its task's. */
export interface Session {
  projectId: string;
  kind: 'chat' | 'handoff';
  id: string;
}

/** A document opened in the pane. */
export interface Doc {
  projectId: string;
  id: string;
}

/** The most sessions the dock keeps for one board; the oldest go first. */
export const SESSIONS_KEPT = 12;
/** The most documents the palette remembers, across boards. */
export const RECENT_KEPT = 12;

export const sameSession = (a: Session, b: Session): boolean => a.projectId === b.projectId && a.kind === b.kind && a.id === b.id;

/** Keeps a session at hand: added at the newest end, unless it is there already; a board keeps its newest few. */
export function keepSession(list: Session[], session: Session, kept = SESSIONS_KEPT): Session[] {
  if (list.some((s) => sameSession(s, session))) return list;
  const next = [...list, session];
  const mine = next.filter((s) => s.projectId === session.projectId);
  if (mine.length <= kept) return next;
  const gone = new Set(mine.slice(0, mine.length - kept));
  return next.filter((s) => !gone.has(s));
}

export function dropSession(list: Session[], session: Session): Session[] {
  return list.filter((s) => !sameSession(s, session));
}

/** A document opened goes to the front; it is there once. */
export function keepRecent(list: Doc[], doc: Doc, kept = RECENT_KEPT): Doc[] {
  return [doc, ...list.filter((d) => !(d.projectId === doc.projectId && d.id === doc.id))].slice(0, kept);
}

/** The run a hand-off's tab speaks for: the live one, else the latest. An epic's tab speaks for its lead's turns. */
export function handoffRun(runs: AgentRun[], projectId: string, taskId: string): AgentRun | undefined {
  const mine = runs.filter((r) => (r.kind === 'dispatch' || r.kind === 'lead') && r.projectId === projectId && r.taskId === taskId);
  return mine.find((r) => r.state === 'starting' || r.state === 'working' || r.state === 'waiting') ?? mine.sort((a, b) => b.startedAt - a.startedAt)[0];
}

/**
 * What a tab says after its agent, when no turn is at work (that one is the
 * Working line): a reply you have not read, or how a hand-off ended and
 * whether its branch can merge. Null says only the agent.
 */
export function restingWord(
  session: Session,
  { unread, run, ready, lead }: { unread?: string; run?: AgentRun; ready?: ReadyView; lead?: LeadView }
): { word: string; tone?: 'warn' } | null {
  if (session.kind === 'chat') return unread === session.id ? { word: 'Reply waiting' } : null;
  // An epic's lead says where it stands, not how its last turn ended (decision-15).
  if (lead) {
    if (lead.state === 'paused') return { word: 'Paused', tone: 'warn' };
    if (lead.state === 'done') return { word: 'Done' };
    if (lead.state === 'stopped') return { word: 'Stopped' };
    return { word: lead.waitingForYou.length ? 'Needs you' : 'Leading' };
  }
  if (ready) return ready.conflicts ? { word: 'Conflicts', tone: 'warn' } : { word: 'Ready to merge' };
  if (!run) return null;
  if (run.state === 'done') return { word: 'Done' };
  if (run.state === 'stopped') return { word: 'Stopped' };
  if (run.state === 'failed') return { word: 'Failed', tone: 'warn' };
  return null;
}
