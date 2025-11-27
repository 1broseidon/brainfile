/**
 * Brainfile TUI Theme
 *
 * Design principles (aligned with VSCode extension aesthetic):
 * 1. True black background (#000) for maximum contrast
 * 2. Muted grays for secondary content
 * 3. Vibrant accent colors used sparingly
 * 4. Rounded borders for modern feel
 * 5. Generous spacing for readability
 *
 * VSCode extension colors reference:
 * - critical: #d64933, high: #867530, medium: #37505C, low: #bac1b8
 */

// Main color palette with hex values for True Color terminals
export const PALETTE = {
  // Backgrounds
  bg: '#000000',
  bgSubtle: '#0a0a0a',
  bgMuted: '#1a1a1a',
  bgHighlight: '#2a2a2a',
  panel: '#1e1e1e',

  // Text hierarchy
  text: '#ffffff',
  textSecondary: '#a0a0a0',
  textMuted: '#606060',
  textDim: '#404040',

  // Borders
  border: '#333333',
  borderFocus: '#505050',
  borderAccent: '#7c3aed',

  // Priority colors (TUI-optimized, inspired by VSCode extension)
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#6b7280',
  giga: '#a855f7', // Purple for custom priority

  // Semantic colors
  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
  info: '#3b82f6',

  // UI accents
  progress: '#3b82f6',
  accent: '#7c3aed',
  accentAlt: '#06b6d4',
  selected: '#ffffff',
} as const;

// Box drawing characters - default to rounded for modern feel
export const BOX = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  teeRight: '├',
  teeLeft: '┤',
} as const;

// Alternative border styles
export const BORDERS = {
  round: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
  },
  single: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
  },
  double: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
  },
  bold: {
    topLeft: '┏',
    topRight: '┓',
    bottomLeft: '┗',
    bottomRight: '┛',
    horizontal: '━',
    vertical: '┃',
  },
} as const;

// Spacing scale
export const SPACING = {
  none: 0,
  xs: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 6,
} as const;

// Icons/glyphs for consistent visual language
export const ICONS = {
  // Status
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',

  // Navigation
  expanded: '▼',
  collapsed: '▶',
  bullet: '•',
  arrow: '→',

  // Objects
  file: '📄',
  folder: '📁',
  task: '☐',
  taskDone: '☑',

  // Progress
  progressFilled: '█',
  progressEmpty: '░',
  progressPartial: '▓',

  // Misc
  reload: '↻',
  live: '●',
  search: '🔍',
} as const;
