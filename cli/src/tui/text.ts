/**
 * Pure text helpers shared by the list and detail views.
 *
 * v2 had two near-identical truncators (`utils.truncate` and
 * `TaskCardMeasure.safeTruncate`) with subtly different edge-case behaviour;
 * this is the single implementation. The card *measurement* functions that
 * used to live alongside them are gone — v3 rows are a fixed one line each, so
 * there is nothing to measure.
 */

/**
 * Truncate to `maxWidth`, appending `…` when it does not fit.
 *
 * Always returns a non-empty string: ink throws on empty text nodes.
 */
export function truncate(text: string | undefined, maxWidth: number): string {
  if (!text) return ' ';
  if (maxWidth <= 0) return ' ';
  if (maxWidth <= 3) return text.slice(0, maxWidth) || ' ';
  if (text.length <= maxWidth) return text;
  return `${text.slice(0, maxWidth - 1)}…`;
}

/** Back-compat alias — several call sites still use the v2 name. */
export const safeTruncate = truncate;

/**
 * Truncate to `maxWidth` from the START, prefixing `…` — used for the detail
 * breadcrumb (v3.1 §B1), where the document you're looking at (the tail) is
 * more useful to keep on screen than where you came from.
 */
export function truncateStart(text: string | undefined, maxWidth: number): string {
  if (!text) return ' ';
  if (maxWidth <= 0) return ' ';
  if (maxWidth <= 1) return text.slice(-1) || ' ';
  if (text.length <= maxWidth) return text;
  return `…${text.slice(text.length - (maxWidth - 1))}`;
}

/**
 * Wrap text to `maxWidth`, breaking over-long words. Used for detail bodies.
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (!text || maxWidth <= 0) return [];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (word.length > maxWidth) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      for (let i = 0; i < word.length; i += maxWidth) {
        lines.push(word.slice(i, i + maxWidth));
      }
    } else if (currentLine.length + 1 + word.length <= maxWidth) {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

/** `n` spaces (never negative). Used for explicit column gaps in row layouts. */
export function pad(n: number): string {
  return ' '.repeat(Math.max(0, n));
}
