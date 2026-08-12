/**
 * Brainfile TUI v3 design system.
 *
 * Two rules drive everything here:
 *
 * 1. **Colour is signal only.** Priority, contract state and selection get
 *    colour; nothing else does. IDs and metadata are dim, titles are default
 *    foreground. There are no decorative accents and no theme colours for
 *    "chrome", because v3 has no chrome.
 * 2. **Structure comes from typography.** A document's kind is a single glyph
 *    in column 1; hierarchy is two spaces of indent; separation is whitespace.
 *    The only box-drawing character that survives is the horizontal rule used
 *    for the header and footer boundaries.
 */

export const PALETTE = {
  // Text hierarchy
  text: '#ffffff',
  textSecondary: '#a0a0a0',
  textMuted: '#606060',
  textDim: '#404040',

  // Priority signal
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#6b7280',
  giga: '#a855f7',

  // Contract-state signal (design §3: draft dim · ready cyan · in_progress
  // yellow · delivered magenta · done green · failed/blocked red)
  contractDraft: '#606060',
  contractReady: '#06b6d4',
  contractInProgress: '#eab308',
  contractDelivered: '#c026d3',
  contractDone: '#22c55e',
  contractFailed: '#ef4444',

  // Feedback
  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
  info: '#3b82f6',
  accent: '#7c3aed',

  // Carried over for the rules and logs panels, which keep their v2
  // presentation this round. The v3 board and detail views use neither: they
  // have no borders, and selection is an inverse bar rather than a background.
  border: '#333333',
  bgHighlight: '#2a2a2a',
} as const;

/** The only box-drawing character v3 uses: header and footer rules. */
export const RULE = '─';

/**
 * Document-type glyphs (column 1). A plain task deliberately renders *no*
 * glyph — the blank column is what makes typed documents stand out.
 */
export const TYPE_GLYPHS: Record<string, string> = {
  epic: '▸',
  spec: '◆',
  adr: '●',
  plan: '⎘',
  task: '',
};

export function getTypeGlyph(type?: string): string {
  if (!type) return '';
  return TYPE_GLYPHS[type.toLowerCase()] ?? '';
}

/**
 * Plain (non-emoji) glyphs used by the chrome-free views. The v2 emoji set
 * (📄 📁 🔍 📦 📋 🗑 …) is gone: emoji have unreliable terminal widths and
 * broke column alignment, which is the whole point of the v3 list.
 */
export const GLYPHS = {
  pointer: '▸',
  cursor: '▌',
  collapsed: '▶',
  success: '✓',
  error: '✗',
  warning: '⚠',
  live: '●',
  subtaskOpen: '◻',
  subtaskDone: '☑',
  orphanParent: '←',
} as const;

export type ContractState =
  | 'draft'
  | 'ready'
  | 'in_progress'
  | 'delivered'
  | 'done'
  | 'failed'
  | 'blocked';

/**
 * Contract state → colour. Unlike v2 (which had two divergent, both-incomplete
 * switch statements in TaskCard and TaskDetail) this is the single mapping, and
 * it covers all six states the schema can produce.
 */
export function getContractStateColor(state?: string): string {
  switch (state?.toLowerCase()) {
    case 'ready':
      return PALETTE.contractReady;
    case 'in_progress':
      return PALETTE.contractInProgress;
    case 'delivered':
      return PALETTE.contractDelivered;
    case 'done':
      return PALETTE.contractDone;
    case 'failed':
    case 'blocked':
      return PALETTE.contractFailed;
    case 'draft':
    default:
      return PALETTE.contractDraft;
  }
}
