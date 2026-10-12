/**
 * Chunking for the local index: heading-aware for markdown, line-packed for
 * plain text, at most ~3,000 characters a chunk, every chunk with its line
 * range in the file.
 *
 * @packageDocumentation
 */

export const DEFAULT_MAX_CHUNK_CHARS = 3000;

export interface TextChunk {
  text: string;
  /** 1-based, inclusive, in the file (after `lineOffset`). */
  startLine: number;
  endLine: number;
  /** The heading the chunk starts under, when it has one. */
  heading?: string;
}

export interface ChunkOptions {
  maxChars?: number;
  /** Lines before the text in its file (a document's frontmatter). */
  lineOffset?: number;
  /** Split at headings (default true). */
  markdown?: boolean;
}

interface Section {
  start: number;
  lines: string[];
  heading?: string;
}

const HEADING = /^(#{1,6})\s+(\S.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

function sectionsOf(lines: string[], markdown: boolean): Section[] {
  const sections: Section[] = [];
  let current: Section = { start: 0, lines: [] };
  let fence: string | null = null;
  lines.forEach((line, index) => {
    const fenceMatch = FENCE.exec(line);
    const heading = markdown && fence === null && !fenceMatch ? HEADING.exec(line) : null;
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1];
      else if (fenceMatch[1] === fence) fence = null;
    }
    if (heading) {
      if (current.lines.length > 0) sections.push(current);
      current = { start: index, lines: [], heading: heading[2] };
    }
    current.lines.push(line);
  });
  if (current.lines.length > 0) sections.push(current);
  return sections;
}

/**
 * Split a text into chunks of at most `maxChars` (a single longer line stays
 * whole). Markdown sections are kept together and packed while they fit; a
 * section too big on its own is cut between lines.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const maxChars = options.maxChars && options.maxChars > 0 ? options.maxChars : DEFAULT_MAX_CHUNK_CHARS;
  const offset = options.lineOffset ?? 0;
  const normalized = text.replace(/\r\n?/g, '\n');
  if (!normalized.trim()) return [];
  const lines = normalized.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();

  const chunks: TextChunk[] = [];
  let buffer: string[] = [];
  let bufferStart = 0;
  let bufferLength = 0;
  let bufferHeading: string | undefined;

  const flush = () => {
    if (buffer.length === 0) return;
    // Trim blank lines at either end, keeping the line numbers honest.
    let first = 0;
    let last = buffer.length - 1;
    while (first <= last && !buffer[first].trim()) first++;
    while (last >= first && !buffer[last].trim()) last--;
    if (first <= last) {
      chunks.push({
        text: buffer.slice(first, last + 1).join('\n'),
        startLine: offset + bufferStart + first + 1,
        endLine: offset + bufferStart + last + 1,
        ...(bufferHeading ? { heading: bufferHeading } : {}),
      });
    }
    buffer = [];
    bufferLength = 0;
    bufferHeading = undefined;
  };

  const push = (line: string, index: number, heading: string | undefined) => {
    if (buffer.length === 0) {
      bufferStart = index;
      bufferHeading = heading;
    }
    buffer.push(line);
    bufferLength += line.length + 1;
  };

  for (const section of sectionsOf(lines, options.markdown !== false)) {
    const size = section.lines.reduce((n, l) => n + l.length + 1, 0);
    if (buffer.length > 0 && bufferLength + size > maxChars) flush();
    if (size <= maxChars) {
      section.lines.forEach((line, i) => push(line, section.start + i, section.heading));
      continue;
    }
    // Too big on its own: cut it between lines.
    section.lines.forEach((line, i) => {
      if (buffer.length > 0 && bufferLength + line.length + 1 > maxChars) flush();
      push(line, section.start + i, section.heading);
    });
  }
  flush();
  return chunks;
}

/** The first `#` heading of a markdown text, or undefined. */
export function firstHeading(text: string): string | undefined {
  let fence = false;
  for (const line of text.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const match = HEADING.exec(line);
    if (match) return match[2];
  }
  return undefined;
}
