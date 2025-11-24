import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { render, Box, Text, useInput, useApp, useStdout } from 'ink';
import { Brainfile, Board, Task, hashBoardContent } from '@brainfile/core';
import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';

type BoardColumn = Board['columns'][number];

// Unified palette matching VSCode extension priority colors
// VSCode uses: critical=#d64933, high=#867530, medium=#37505C, low=#bac1b8
const PALETTE = {
  bg: '#000000',
  panel: '#1e1e1e',
  text: 'white',
  textMuted: 'gray',
  border: 'gray',

  // Priority colors (terminal equivalents)
  critical: 'red',        // #d64933
  giga: 'magenta',        // Custom high priority
  high: 'yellow',         // #867530
  medium: 'cyan',         // #37505C
  low: 'gray',            // #bac1b8

  // UI accents
  progress: 'blue',
  success: 'green',
  selected: 'white',
} as const;

// Box drawing characters
const BOX = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  teeRight: '├',
  teeLeft: '┤',
} as const;

interface TUIProps {
  filePath: string;
}

type ViewMode = 'browse' | 'search' | 'help';

interface AppState {
  board: Board | null;
  error: string | null;
  lastUpdated: Date;

  // Navigation
  activeColumnIndex: number;
  selectedTaskIndex: number;

  // Modes
  mode: ViewMode;
  searchQuery: string;

  // UI
  expandedTaskIds: Set<string>;
  reloadFlash: boolean;

  // Realtime sync
  lastContentHash: string | null;
}

const HEADER_ROWS = 7; // title(1) + progress(3: padTop+content+padBottom) + tabs(2: marginTop+content) + separator(1)
const FOOTER_ROWS = 3; // separator + status bar (2 rows: content + bottom padding)

function BrainfileTUI({ filePath }: TUIProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? process.stdout.columns ?? 80;
  const termHeight = stdout?.rows ?? process.stdout.rows ?? 24;

  const [state, setState] = useState<AppState>({
    board: null,
    error: null,
    lastUpdated: new Date(),
    activeColumnIndex: 0,
    selectedTaskIndex: 0,
    mode: 'browse',
    searchQuery: '',
    expandedTaskIds: new Set(),
    reloadFlash: false,
    lastContentHash: null,
  });

  const viewportHeight = Math.max(termHeight - HEADER_ROWS - FOOTER_ROWS, 5);

  const loadBrainfile = useCallback((forceRefresh = false) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Skip redundant refreshes using content hash (like VSCode extension)
      const contentHash = hashBoardContent(content);
      if (!forceRefresh && state.lastContentHash === contentHash) {
        return; // Content unchanged, skip re-render
      }

      const result = Brainfile.parseWithErrors(content);

      if (result.board) {
        setState(prev => {
          // Preserve selection by task ID if possible
          const prevTaskId = prev.board?.columns[prev.activeColumnIndex]?.tasks[prev.selectedTaskIndex]?.id;
          let newSelectedIndex = 0;

          if (prevTaskId && result.board) {
            const col = result.board.columns[prev.activeColumnIndex];
            if (col) {
              const idx = col.tasks.findIndex(t => t.id === prevTaskId);
              if (idx >= 0) newSelectedIndex = idx;
            }
          }

          return {
            ...prev,
            board: result.board!,
            error: null,
            lastUpdated: new Date(),
            selectedTaskIndex: newSelectedIndex,
            reloadFlash: true,
            lastContentHash: contentHash,
          };
        });

        // Clear reload flash after 1 second
        setTimeout(() => {
          setState(prev => ({ ...prev, reloadFlash: false }));
        }, 1000);
      } else {
        // Distinguish between different error cases
        let errorMessage: string;

        if (result.data && result.type) {
          // Valid brainfile but not a board type
          errorMessage = `This is a '${result.type}' brainfile. The TUI currently only supports 'board' type files.`;
        } else if (result.error) {
          // Parse error with specific message
          errorMessage = result.error;
        } else {
          // Unknown failure
          errorMessage = 'Not a valid brainfile';
        }

        setState(prev => ({
          ...prev,
          error: errorMessage,
          lastContentHash: contentHash,
        }));
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [filePath, state.lastContentHash]);

  useEffect(() => {
    loadBrainfile();
  }, [loadBrainfile]);

  useEffect(() => {
    const watcher = chokidar.watch(filePath, {
      persistent: true,
      ignoreInitial: true,
      usePolling: true,
      interval: 750,
      awaitWriteFinish: {
        stabilityThreshold: 250,
        pollInterval: 100,
      },
      depth: 0,
    });

    watcher.on('change', () => loadBrainfile());
    watcher.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setState(prev => ({
        ...prev,
        error: `File watcher error: ${message}`,
      }));
    });

    return () => {
      watcher.close();
    };
  }, [filePath, loadBrainfile]);

  // Sort columns by order property (like VSCode extension)
  const orderedColumns = useMemo(() => {
    if (!state.board) return [];
    return [...state.board.columns].sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }, [state.board]);

  // Filtered columns based on search
  const filteredColumns = useMemo(() => {
    if (!orderedColumns.length) return [];
    if (!state.searchQuery.trim()) return orderedColumns;

    const query = state.searchQuery.toLowerCase();
    return orderedColumns.map(col => ({
      ...col,
      tasks: col.tasks.filter(task =>
        task.title.toLowerCase().includes(query) ||
        task.id.toLowerCase().includes(query) ||
        task.tags?.some(t => t.toLowerCase().includes(query)) ||
        task.priority?.toLowerCase().includes(query)
      ),
    })).filter(col => col.tasks.length > 0);
  }, [orderedColumns, state.searchQuery]);

  // Current column and its tasks
  const currentColumn = filteredColumns[state.activeColumnIndex];
  const currentTasks = currentColumn?.tasks || [];
  const maxTaskIndex = Math.max(0, currentTasks.length - 1);

  // Keep selection in bounds
  useEffect(() => {
    setState(prev => ({
      ...prev,
      activeColumnIndex: Math.min(prev.activeColumnIndex, Math.max(0, filteredColumns.length - 1)),
      selectedTaskIndex: Math.min(prev.selectedTaskIndex, maxTaskIndex),
    }));
  }, [filteredColumns.length, maxTaskIndex]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!state.board) return { total: 0, done: 0, percentage: 0 };

    const total = state.board.columns.reduce((sum, col) => sum + col.tasks.length, 0);
    const doneCol = state.board.columns.find(col => col.id === 'done' || col.title.toLowerCase() === 'done');
    const done = doneCol?.tasks.length || 0;
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

    return { total, done, percentage };
  }, [state.board]);

  useInput((input, key) => {
    // Help mode - any key closes
    if (state.mode === 'help') {
      setState(prev => ({ ...prev, mode: 'browse' }));
      return;
    }

    // Search mode handling
    if (state.mode === 'search') {
      if (key.escape) {
        setState(prev => ({ ...prev, mode: 'browse', searchQuery: '' }));
        return;
      }
      if (key.return) {
        setState(prev => ({ ...prev, mode: 'browse' }));
        return;
      }
      if (key.backspace || key.delete) {
        setState(prev => ({ ...prev, searchQuery: prev.searchQuery.slice(0, -1) }));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setState(prev => ({ ...prev, searchQuery: prev.searchQuery + input }));
        return;
      }
      return;
    }

    // Browse mode
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    if (input === '?') {
      setState(prev => ({ ...prev, mode: 'help' }));
      return;
    }

    if (input === '/') {
      setState(prev => ({ ...prev, mode: 'search', searchQuery: '' }));
      return;
    }

    // Refresh (force refresh bypasses hash check)
    if (input === 'r') {
      loadBrainfile(true);
      return;
    }

    // Navigation: up/down through tasks
    if (key.downArrow || input === 'j') {
      setState(prev => ({
        ...prev,
        selectedTaskIndex: Math.min(prev.selectedTaskIndex + 1, maxTaskIndex),
      }));
      return;
    }

    if (key.upArrow || input === 'k') {
      setState(prev => ({
        ...prev,
        selectedTaskIndex: Math.max(prev.selectedTaskIndex - 1, 0),
      }));
      return;
    }

    // Page scrolling
    if (key.ctrl && input === 'd') {
      setState(prev => ({
        ...prev,
        selectedTaskIndex: Math.min(prev.selectedTaskIndex + Math.floor(viewportHeight / 2), maxTaskIndex),
      }));
      return;
    }

    if (key.ctrl && input === 'u') {
      setState(prev => ({
        ...prev,
        selectedTaskIndex: Math.max(prev.selectedTaskIndex - Math.floor(viewportHeight / 2), 0),
      }));
      return;
    }

    // Column switching: TAB / left/right
    if (key.tab || key.rightArrow || input === 'l') {
      setState(prev => ({
        ...prev,
        activeColumnIndex: (prev.activeColumnIndex + 1) % filteredColumns.length,
        selectedTaskIndex: 0,
      }));
      return;
    }

    if ((key.shift && key.tab) || key.leftArrow || input === 'h') {
      setState(prev => ({
        ...prev,
        activeColumnIndex: prev.activeColumnIndex === 0
          ? filteredColumns.length - 1
          : prev.activeColumnIndex - 1,
        selectedTaskIndex: 0,
      }));
      return;
    }

    // Jump to column headers with { and }
    if (input === '{') {
      setState(prev => ({
        ...prev,
        activeColumnIndex: Math.max(0, prev.activeColumnIndex - 1),
        selectedTaskIndex: 0,
      }));
      return;
    }

    if (input === '}') {
      setState(prev => ({
        ...prev,
        activeColumnIndex: Math.min(filteredColumns.length - 1, prev.activeColumnIndex + 1),
        selectedTaskIndex: 0,
      }));
      return;
    }

    // Home/End
    if (input === 'g') {
      setState(prev => ({ ...prev, selectedTaskIndex: 0 }));
      return;
    }
    if (input === 'G') {
      setState(prev => ({ ...prev, selectedTaskIndex: maxTaskIndex }));
      return;
    }

    // Expand/collapse task
    if (key.return) {
      const task = currentTasks[state.selectedTaskIndex];
      if (task) {
        setState(prev => {
          const newExpanded = new Set(prev.expandedTaskIds);
          if (newExpanded.has(task.id)) {
            newExpanded.delete(task.id);
          } else {
            newExpanded.add(task.id);
          }
          return { ...prev, expandedTaskIds: newExpanded };
        });
      }
      return;
    }

    // Escape: collapse all or clear search
    if (key.escape) {
      setState(prev => ({
        ...prev,
        expandedTaskIds: new Set(),
        searchQuery: '',
      }));
      return;
    }
  });

  // Error state
  if (state.error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={PALETTE.high} bold>Error</Text>
        <Box marginTop={1}>
          <Text color={PALETTE.textMuted}>{state.error}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={PALETTE.textMuted} dimColor>Press q to quit, r to retry</Text>
        </Box>
      </Box>
    );
  }

  // Loading state
  if (!state.board) {
    return (
      <Box padding={1}>
        <Text color={PALETTE.textMuted}>Loading...</Text>
      </Box>
    );
  }

  // Help overlay
  if (state.mode === 'help') {
    return <HelpOverlay termWidth={termWidth} />;
  }

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* Header */}
      <Header
        title={state.board.title || 'Brainfile'}
        stats={stats}
        reloadFlash={state.reloadFlash}
      />

      {/* Progress Bar */}
      <ProgressBar done={stats.done} total={stats.total} width={termWidth - 4} />

      {/* Search bar (if active) */}
      {state.mode === 'search' && (
        <SearchBar query={state.searchQuery} width={termWidth - 2} />
      )}

      {/* Column tabs */}
      <ColumnTabs
        columns={filteredColumns}
        activeIndex={state.activeColumnIndex}
        termWidth={termWidth}
      />

      {/* Separator */}
      <Box paddingLeft={1}>
        <Text color={PALETTE.border}>{BOX.horizontal.repeat(termWidth - 2)}</Text>
      </Box>

      {/* Task list for active column - takes remaining space */}
      <Box flexGrow={1} flexDirection="column">
        <TaskList
          tasks={currentTasks}
          selectedIndex={state.selectedTaskIndex}
          expandedIds={state.expandedTaskIds}
          viewportHeight={viewportHeight - (state.mode === 'search' ? 1 : 0)}
          termWidth={termWidth}
        />
      </Box>

      {/* Footer separator */}
      <Box paddingLeft={1}>
        <Text color={PALETTE.border}>{BOX.horizontal.repeat(termWidth - 2)}</Text>
      </Box>

      {/* Status bar */}
      <StatusBar
        mode={state.mode}
        columnName={currentColumn?.title || ''}
        taskIndex={state.selectedTaskIndex + 1}
        taskCount={currentTasks.length}
        termWidth={termWidth}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface HeaderProps {
  title: string;
  stats: { total: number; done: number; percentage: number };
  reloadFlash: boolean;
}

function Header({ title, reloadFlash }: HeaderProps) {
  return (
    <Box paddingLeft={1} paddingRight={1}>
      <Text color={PALETTE.text} bold>{BOX.topLeft}{BOX.horizontal} {title} </Text>
      {reloadFlash ? (
        <Text color={PALETTE.success}> {String.fromCharCode(0x21BB)} reloaded</Text>
      ) : null}
    </Box>
  );
}

interface ProgressBarProps {
  done: number;
  total: number;
  width: number;
}

function ProgressBar({ done, total, width }: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
  // Reserve space for: padding + "XX% " + " X of Y complete"
  const textWidth = 20 + String(done).length + String(total).length;
  const barWidth = Math.max(width - textWidth, 20);
  const filled = Math.round((percentage / 100) * barWidth);
  const empty = barWidth - filled;

  return (
    <Box paddingLeft={2} paddingTop={1} paddingBottom={1}>
      <Text color={PALETTE.textMuted}>{percentage}% </Text>
      <Text color={PALETTE.progress}>{'█'.repeat(filled)}</Text>
      <Text color={PALETTE.border}>{'░'.repeat(empty)}</Text>
      <Text color={PALETTE.textMuted}> {done} of {total} complete</Text>
    </Box>
  );
}

interface SearchBarProps {
  query: string;
  width: number;
}

function SearchBar({ query, width }: SearchBarProps) {
  const inputWidth = Math.min(width - 6, 60);
  const displayQuery = query.padEnd(inputWidth, ' ').slice(0, inputWidth);

  return (
    <Box paddingLeft={1} marginTop={0}>
      <Text color={PALETTE.textMuted}>{String.fromCharCode(0x1F50D)} </Text>
      <Text color={PALETTE.text} inverse>[{displayQuery}]</Text>
    </Box>
  );
}

interface ColumnTabsProps {
  columns: BoardColumn[];
  activeIndex: number;
  termWidth: number;
}

function ColumnTabs({ columns, activeIndex, termWidth }: ColumnTabsProps) {
  const maxTabWidth = Math.floor((termWidth - 4) / Math.max(columns.length, 1)) - 2;

  return (
    <Box paddingLeft={1} paddingRight={1} marginTop={1}>
      {columns.map((col, idx) => {
        const isActive = idx === activeIndex;
        const label = truncate(col.title.toUpperCase(), maxTabWidth - 4);
        const count = col.tasks.length;

        return (
          <Box key={col.id} marginRight={1}>
            {isActive ? (
              <Text color={PALETTE.text} bold inverse> {label} {count} </Text>
            ) : (
              <Text color={PALETTE.textMuted}> {label} {count} </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

interface TaskListProps {
  tasks: Task[];
  selectedIndex: number;
  expandedIds: Set<string>;
  viewportHeight: number;
  termWidth: number;
}

function TaskList({ tasks, selectedIndex, expandedIds, viewportHeight, termWidth }: TaskListProps) {
  // Calculate scroll offset to keep selection visible
  const scrollOffset = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(viewportHeight / 3),
      Math.max(0, tasks.length - Math.floor(viewportHeight / 2))
    )
  );

  const cardWidth = termWidth - 4;

  // Build visible items with expansion
  const visibleItems: { task: Task; isSelected: boolean; isExpanded: boolean }[] = [];
  let linesUsed = 0;

  for (let i = scrollOffset; i < tasks.length && linesUsed < viewportHeight; i++) {
    const task = tasks[i];
    const isSelected = i === selectedIndex;
    const isExpanded = expandedIds.has(task.id);

    // Calculate how many lines this task will take (2 lines base + expanded content)
    const subtaskLines = isExpanded ? Math.min((task.subtasks?.length || 0), 4) : 0;
    const expandedLines = isExpanded ? 2 + subtaskLines + (task.relatedFiles?.length ? 1 : 0) : 0;
    const taskLines = 3 + expandedLines; // title + metadata + margin + expanded

    if (linesUsed + taskLines <= viewportHeight) {
      visibleItems.push({ task, isSelected, isExpanded });
      linesUsed += taskLines;
    } else if (visibleItems.length === 0) {
      // Always show at least one item
      visibleItems.push({ task, isSelected, isExpanded });
      linesUsed += taskLines;
      break;
    } else {
      break;
    }
  }

  // Calculate remaining empty lines to fill viewport
  const emptyLines = Math.max(0, viewportHeight - linesUsed);

  if (tasks.length === 0) {
    return (
      <Box flexGrow={1} flexDirection="column" paddingLeft={2}>
        <Text color={PALETTE.textMuted} dimColor>No tasks in this column</Text>
        {/* Fill remaining space */}
        {Array.from({ length: viewportHeight - 1 }).map((_, i) => (
          <Box key={`empty-${i}`}><Text>{' '}</Text></Box>
        ))}
      </Box>
    );
  }

  return (
    <Box flexGrow={1} flexDirection="column" paddingLeft={1}>
      {visibleItems.map(({ task, isSelected, isExpanded }) => (
        <TaskCard
          key={task.id}
          task={task}
          isSelected={isSelected}
          isExpanded={isExpanded}
          width={cardWidth}
        />
      ))}
      {/* Fill remaining viewport space with empty lines */}
      {Array.from({ length: emptyLines }).map((_, i) => (
        <Box key={`empty-${i}`}><Text>{' '}</Text></Box>
      ))}
    </Box>
  );
}

interface TaskCardProps {
  task: Task;
  isSelected: boolean;
  isExpanded: boolean;
  width: number;
}

function TaskCard({ task, isSelected, isExpanded, width }: TaskCardProps) {
  const priorityColor = getPriorityColor(task.priority);
  const priorityLabel = task.priority?.toUpperCase() || '';
  const tags = task.tags || [];
  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter(s => s.completed).length;

  // Arrow indicator: colored when selected
  const arrow = isExpanded ? '▼' : '▶';
  const arrowColor = isSelected ? PALETTE.progress : PALETTE.textMuted;
  const titleWidth = width - task.id.length - 10;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Title row - inverse when selected */}
      <Box>
        <Text color={arrowColor} bold={isSelected}>{arrow}</Text>
        <Text>  </Text>
        <Text color={isSelected ? PALETTE.text : PALETTE.textMuted} inverse={isSelected} bold={isSelected}>
          {' '}{truncate(task.title, titleWidth)}{' '}
        </Text>
        <Text>  </Text>
        <Text color={PALETTE.textMuted} dimColor>{task.id}</Text>
      </Box>

      {/* Metadata row */}
      <Box paddingLeft={3}>
        <Text color={priorityColor}>{priorityLabel || '    '}</Text>
        {tags.length > 0 ? (
          <Text color={PALETTE.textMuted} dimColor>
            {' '}{String.fromCharCode(0xB7)} {tags.slice(0, 4).join(` ${String.fromCharCode(0xB7)} `)}
          </Text>
        ) : null}
      </Box>

      {/* Expanded content */}
      {isExpanded && (
        <ExpandedTaskContent
          task={task}
          priorityColor={priorityColor}
          completedSubtasks={completedSubtasks}
          totalSubtasks={subtasks.length}
          width={width}
        />
      )}
    </Box>
  );
}

interface ExpandedTaskContentProps {
  task: Task;
  priorityColor: string;
  completedSubtasks: number;
  totalSubtasks: number;
  width: number;
}

function ExpandedTaskContent({ task, priorityColor, completedSubtasks, totalSubtasks, width }: ExpandedTaskContentProps) {
  const subtasks = task.subtasks || [];
  const innerWidth = width - 6;

  // Build content lines - all with consistent left border
  const lines: React.ReactNode[] = [];

  // Empty line for spacing
  lines.push(<Text color={PALETTE.textMuted}>{' '}</Text>);

  if (task.description) {
    lines.push(
      <Text color={PALETTE.textMuted}>{truncate(task.description.split('\n')[0], innerWidth)}</Text>
    );
  }

  if (totalSubtasks > 0) {
    // Empty line before subtasks if there was a description
    if (task.description) {
      lines.push(<Text>{' '}</Text>);
    }
    lines.push(
      <>
        <Text color={PALETTE.textMuted}>Subtasks: </Text>
        <Text color={PALETTE.success}>{'●'.repeat(Math.min(completedSubtasks, 10))}</Text>
        <Text color={PALETTE.border}>{'○'.repeat(Math.min(totalSubtasks - completedSubtasks, 10))}</Text>
        <Text color={PALETTE.textMuted}> {completedSubtasks}/{totalSubtasks}</Text>
      </>
    );
    subtasks.slice(0, 4).forEach((st) => {
      lines.push(
        <Text color={st.completed ? PALETTE.success : PALETTE.textMuted}>
          {st.completed ? '✓' : '○'} {truncate(st.title, innerWidth - 2)}
        </Text>
      );
    });
  }

  if (task.relatedFiles && task.relatedFiles.length > 0) {
    // Empty line before files
    lines.push(<Text>{' '}</Text>);
    lines.push(
      <Text color={PALETTE.medium}>Files: {truncate(task.relatedFiles.slice(0, 2).join(', '), innerWidth - 7)}</Text>
    );
  }

  if (lines.length === 0) return null;

  return (
    <Box flexDirection="column">
      {lines.map((content, idx) => (
        <Box key={idx} paddingLeft={3}>
          <Text color={priorityColor}>{BOX.vertical}</Text>
          <Text>  </Text>
          {content}
        </Box>
      ))}
    </Box>
  );
}

interface StatusBarProps {
  mode: ViewMode;
  columnName: string;
  taskIndex: number;
  taskCount: number;
  termWidth: number;
  isWatching?: boolean;
}

function StatusBar({ mode, columnName, taskIndex, taskCount, termWidth, isWatching = true }: StatusBarProps) {
  // Left section: essential commands
  const leftSection = mode === 'search' ? 'ESC:cancel' : '?:help  TAB:column  q:quit';

  // Middle section: column and position
  const position = taskCount > 0 ? `${taskIndex}/${taskCount}` : '';
  const middleSection = columnName ? `${columnName.toUpperCase()} ${position}` : '';

  // Right section: status
  const rightSection = isWatching ? '● live' : '';

  return (
    <Box flexDirection="column" width={termWidth}>
      {/* Main status row */}
      <Box width={termWidth - 2} paddingLeft={1} paddingRight={1}>
        {/* Left: Essential commands */}
        <Text color={PALETTE.textMuted} dimColor>{leftSection}</Text>

        {/* Flexible spacer */}
        <Box flexGrow={1} />

        {/* Center: Column and position */}
        {middleSection ? (
          <Text color={PALETTE.progress}>{middleSection}</Text>
        ) : null}

        {/* Flexible spacer */}
        <Box flexGrow={1} />

        {/* Right: Status indicator */}
        {rightSection ? (
          <Text color={PALETTE.success} dimColor>{rightSection}</Text>
        ) : null}
      </Box>

      {/* Bottom padding row */}
      <Box paddingLeft={1}>
        <Text>{' '}</Text>
      </Box>
    </Box>
  );
}

interface HelpOverlayProps {
  termWidth: number;
}

function HelpOverlay({ termWidth }: HelpOverlayProps) {
  const boxWidth = Math.min(termWidth - 4, 56);
  const hr = BOX.horizontal.repeat(boxWidth - 2);

  return (
    <Box flexDirection="column" padding={2}>
      <Text color={PALETTE.text} bold>{BOX.topLeft}{BOX.horizontal} KEYBOARD SHORTCUTS {BOX.horizontal.repeat(boxWidth - 22)}{BOX.topRight}</Text>
      <Text color={PALETTE.border}>{BOX.vertical}{' '.repeat(boxWidth - 2)}{BOX.vertical}</Text>

      <Text color={PALETTE.text} bold>{BOX.vertical}  Navigation{' '.repeat(boxWidth - 14)}{BOX.vertical}</Text>
      <Text color={PALETTE.border}>{BOX.vertical}  {BOX.horizontal.repeat(boxWidth - 6)}  {BOX.vertical}</Text>
      <HelpRow label="j/k or ↓/↑" desc="Move up/down" width={boxWidth} />
      <HelpRow label="h/l or ←/→" desc="Switch columns" width={boxWidth} />
      <HelpRow label="TAB" desc="Next column" width={boxWidth} />
      <HelpRow label="g / G" desc="Top / Bottom" width={boxWidth} />
      <HelpRow label="Ctrl+d/u" desc="Page down/up" width={boxWidth} />
      <HelpRow label="{ / }" desc="Prev/next column" width={boxWidth} />

      <Text color={PALETTE.border}>{BOX.vertical}{' '.repeat(boxWidth - 2)}{BOX.vertical}</Text>
      <Text color={PALETTE.text} bold>{BOX.vertical}  Actions{' '.repeat(boxWidth - 11)}{BOX.vertical}</Text>
      <Text color={PALETTE.border}>{BOX.vertical}  {BOX.horizontal.repeat(boxWidth - 6)}  {BOX.vertical}</Text>
      <HelpRow label="ENTER" desc="Expand/collapse task" width={boxWidth} />
      <HelpRow label="/" desc="Search/filter" width={boxWidth} />
      <HelpRow label="r" desc="Refresh from file" width={boxWidth} />
      <HelpRow label="ESC" desc="Clear/collapse" width={boxWidth} />

      <Text color={PALETTE.border}>{BOX.vertical}{' '.repeat(boxWidth - 2)}{BOX.vertical}</Text>
      <Text color={PALETTE.text} bold>{BOX.vertical}  Indicators{' '.repeat(boxWidth - 14)}{BOX.vertical}</Text>
      <Text color={PALETTE.border}>{BOX.vertical}  {BOX.horizontal.repeat(boxWidth - 6)}  {BOX.vertical}</Text>
      <HelpRow label="▶" desc="Collapsed task" width={boxWidth} />
      <HelpRow label="▼" desc="Expanded task" width={boxWidth} />
      <HelpRow label="[inverse]" desc="Selected task" width={boxWidth} />

      <Text color={PALETTE.border}>{BOX.vertical}{' '.repeat(boxWidth - 2)}{BOX.vertical}</Text>
      <Text color={PALETTE.text} bold>{BOX.vertical}  Quit{' '.repeat(boxWidth - 7)}{BOX.vertical}</Text>
      <Text color={PALETTE.border}>{BOX.vertical}  {BOX.horizontal.repeat(boxWidth - 6)}  {BOX.vertical}</Text>
      <HelpRow label="q / Ctrl+C" desc="Exit" width={boxWidth} />

      <Text color={PALETTE.border}>{BOX.vertical}{' '.repeat(boxWidth - 2)}{BOX.vertical}</Text>
      <Text color={PALETTE.text} bold>{BOX.bottomLeft}{hr}{BOX.bottomRight}</Text>

      <Box marginTop={1}>
        <Text color={PALETTE.textMuted} dimColor>Press any key to close</Text>
      </Box>
    </Box>
  );
}

function HelpRow({ label, desc, width }: { label: string; desc: string; width: number }) {
  const padding = width - 6 - label.length - desc.length;
  return (
    <Text color={PALETTE.border}>
      {BOX.vertical}  <Text color={PALETTE.text}>{label}</Text>
      {' '.repeat(Math.max(padding, 2))}
      <Text color={PALETTE.textMuted}>{desc}</Text>  {BOX.vertical}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function truncate(value: string, maxLength: number): string {
  if (!value) return '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function getPriorityColor(priority?: string): string {
  switch (priority?.toLowerCase()) {
    case 'critical':
      return PALETTE.critical;
    case 'giga':
      return PALETTE.giga;
    case 'high':
      return PALETTE.high;
    case 'medium':
      return PALETTE.medium;
    case 'low':
      return PALETTE.low;
    default:
      return PALETTE.border;
  }
}

// ---------------------------------------------------------------------------
// Command Entry Point
// ---------------------------------------------------------------------------

interface TuiOptions {
  file: string;
}

export function tuiCommand(options: TuiOptions) {
  const filePath = path.resolve(options.file);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    console.log('');
    console.log('To create a new brainfile, run:');
    console.log('  brainfile init');
    process.exit(1);
  }

  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    console.error('Error: Terminal UI requires an interactive terminal');
    console.log('');
    console.log('The TUI cannot run in non-interactive environments.');
    console.log('Please run this command in a standard terminal (not piped or in a non-TTY context).');
    process.exit(1);
  }

  render(<BrainfileTUI filePath={filePath} />);
}
