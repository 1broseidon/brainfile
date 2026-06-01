// Main component
export { BrainfileTUI } from './BrainfileTUI.js';

// Theme
export { PALETTE, BOX, BORDERS, SPACING, ICONS } from './theme.js';

// Types
export type { AppState, ViewMode, BoardColumn, TUIProps, MainPanel, RuleType } from './types.js';
export { HEADER_ROWS, FOOTER_ROWS } from './types.js';

// Utils
export { truncate, getPriorityColor, parseSearchQuery, taskMatchesFilter } from './utils.js';
export type { ParsedSearch } from './utils.js';

// Hooks
export { useBrainfileLoader } from './hooks/useBrainfileLoader.js';
export { useKeyboardNavigation } from './hooks/useKeyboardNavigation.js';

// Components
export {
  Header,
  ProgressBar,
  SearchBar,
  ColumnTabs,
  TaskCard,
  TaskList,
  StatusBar,
  HelpOverlay,
} from './components/index.js';
