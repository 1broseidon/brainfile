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

const RAW_PALETTE = {
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

} as const;

/**
 * `NO_COLOR` (https://no-color.org): any non-empty value disables colour. The
 * empty string is falsy in JS, which happens to be exactly the spec's rule.
 *
 * Gating happens HERE, at the prop layer, rather than by forcing `chalk.level`
 * to 0 globally. Ink still applies `inverse` through `chalk.inverse`, and chalk
 * level 0 (NO_COLOR / FORCE_COLOR=0) is a no-op — so selection also puts a
 * cursor glyph in column 1 of `DocumentRow`. The palette gate keeps colour
 * props `undefined`; the glyph is what a no-colour terminal can actually see.
 *
 * The Proxy means all ~107 `PALETTE.x` call sites need no change, and the check
 * is a plain runtime read at module init, so it survives the esbuild bundle
 * without depending on import order the way a `FORCE_COLOR` shim would.
 */
export function isNoColor(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.NO_COLOR);
}

/**
 * The palette the views see. Exported as a factory so the gate is testable
 * without module-cache gymnastics — `PALETTE` itself is the one-shot
 * application of it to the real environment.
 */
export function makePalette(noColor: boolean): typeof RAW_PALETTE {
  if (!noColor) return RAW_PALETTE;
  return new Proxy(RAW_PALETTE, { get: () => undefined }) as unknown as typeof RAW_PALETTE;
}

export const NO_COLOR = isNoColor();

export const PALETTE: typeof RAW_PALETTE = makePalette(NO_COLOR);

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
  /** Board-list row glyph for a parent-with-children that is expanded (§A1). */
  parentExpanded: '▾',
  /** Board-list row glyph for a parent-with-children that is collapsed (§A1). */
  parentCollapsed: '▸',
  /** Detail body scroll indicator (§B2), e.g. `↕ 2/9`. */
  scroll: '↕',
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
