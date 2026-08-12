// Main component
export { BrainfileTUI } from './BrainfileTUI.js';

// Design system
export { PALETTE, RULE, GLYPHS, TYPE_GLYPHS, getTypeGlyph, getContractStateColor } from './theme.js';

// Types
export type {
  AppState,
  ViewMode,
  BoardColumn,
  TUIProps,
  MainPanel,
  RuleType,
  LayoutMode,
  CompleteConfirmTarget,
} from './types.js';
export { HEADER_ROWS, FOOTER_ROWS, LAYOUT } from './types.js';

// Row model
export { buildRows, windowRows } from './rows.js';
export type { DocRow } from './rows.js';

// Utils
export {
  truncate,
  safeTruncate,
  wrapText,
  getPriorityColor,
  parseSearchQuery,
  taskMatchesFilter,
  searchTasksRanked,
  isCompletable,
  getDocType,
  getSubtaskProgress,
  getContractState,
} from './utils.js';
export type { ParsedSearch } from './utils.js';

// Hooks
export { useBrainfileLoader } from './hooks/useBrainfileLoader.js';
export { useKeyboardNavigation } from './hooks/useKeyboardNavigation.js';

// Components
export {
  HeaderBar,
  FooterBar,
  browseActions,
  detailActions,
  DocumentRow,
  DocumentList,
  DetailView,
  HelpOverlay,
} from './components/index.js';
