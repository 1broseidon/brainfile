/**
 * Board references in an agent's reply: `task-12`, `decision-2`, any ID the
 * board in front knows, turned into a small key that opens it. Only text is
 * touched, never code, a link or a key already made, so a reply that quotes
 * an ID in backticks keeps it as code.
 */
import type { BoardSnapshot } from '../../shared/api';

export interface RefInfo {
  /** Work has a status box; a decision has the TUI's mark. */
  kind: 'work' | 'decision';
  done: boolean;
  retired: boolean;
  title: string;
}

const ID = /\b([a-z][a-z0-9_]*-\d+)\b/gi;
const SKIP = new Set(['CODE', 'PRE', 'A', 'BUTTON']);

/** Every ID the board in front can open, with what its key should show. */
export function refsOf(board: BoardSnapshot | null): Map<string, RefInfo> {
  const known = new Map<string, RefInfo>();
  if (!board) return known;
  for (const t of board.tasks) known.set(t.id, { kind: 'work', done: false, retired: false, title: t.title });
  for (const t of board.completed) known.set(t.id, { kind: 'work', done: true, retired: false, title: t.title });
  for (const d of board.decisions) {
    known.set(d.id, { kind: 'decision', done: false, retired: d.status !== 'current' && d.status !== 'proposed', title: d.title });
  }
  return known;
}

/** The reply's HTML with each known ID made a key: `<button class="ref" data-ref="task-12">`. */
export function linkRefs(html: string, known: Map<string, RefInfo>): string {
  if (known.size === 0) return html;
  const root = document.createElement('template');
  root.innerHTML = html;
  const walker = document.createTreeWalker(root.content, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let inside: Node | null = node.parentNode;
    let skip = false;
    while (inside && inside !== root.content) {
      if (SKIP.has((inside as Element).nodeName)) skip = true;
      inside = inside.parentNode;
    }
    if (!skip) texts.push(node as Text);
  }
  for (const text of texts) {
    const value = text.nodeValue ?? '';
    if (!ID.test(value)) continue;
    ID.lastIndex = 0;
    const out = document.createDocumentFragment();
    let at = 0;
    for (const match of value.matchAll(ID)) {
      const id = match[1].toLowerCase();
      const info = known.get(id);
      if (!info) continue;
      out.append(value.slice(at, match.index));
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'ref';
      key.dataset.ref = id;
      const mark = document.createElement('span');
      mark.className = 'ref-mark';
      mark.dataset.kind = info.kind;
      if (info.done) mark.dataset.done = '';
      if (info.retired) mark.dataset.retired = '';
      mark.setAttribute('aria-hidden', 'true');
      key.append(mark, id);
      out.append(key);
      at = match.index! + match[0].length;
    }
    if (at === 0) continue;
    out.append(value.slice(at));
    text.replaceWith(out);
  }
  return root.innerHTML;
}
