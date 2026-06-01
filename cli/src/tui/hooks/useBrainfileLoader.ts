import { useCallback, useEffect, useRef } from 'react';
import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { Brainfile, hashBoardContent } from '@brainfile/core';
import { isV2, getV2Dirs, buildBoardFromV2 } from '../../utils/v2-detect.js';
import type { AppState } from '../types.js';

function getV2ChangeSignature(filePath: string): string {
  const dirs = getV2Dirs(filePath);
  const parts: string[] = [];

  try {
    const boardEntries = fs.existsSync(dirs.boardDir)
      ? fs.readdirSync(dirs.boardDir).filter((name) => name.endsWith('.md')).sort()
      : [];

    for (const name of boardEntries) {
      const fullPath = path.join(dirs.boardDir, name);
      try {
        const stat = fs.statSync(fullPath);
        parts.push(`board:${name}:${stat.mtimeMs}:${stat.size}`);
      } catch {
        // Ignore races with concurrent file operations
      }
    }
  } catch {
    // Ignore board directory read failures, hash will still include config content
  }

  try {
    const logsEntries = fs.existsSync(dirs.logsDir)
      ? fs.readdirSync(dirs.logsDir).filter((name) => name.endsWith('.md')).sort()
      : [];

    for (const name of logsEntries) {
      const fullPath = path.join(dirs.logsDir, name);
      try {
        const stat = fs.statSync(fullPath);
        parts.push(`logs:${name}:${stat.mtimeMs}:${stat.size}`);
      } catch {
        // Ignore races with concurrent file operations
      }
    }
  } catch {
    // Ignore logs directory read failures
  }

  return parts.join('|');
}

export function useBrainfileLoader(
  filePath: string,
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
) {
  // Track flash timeout for cleanup
  const flashTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadBrainfile = useCallback((forceRefresh = false) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const v2 = isV2(filePath);

      let board = null as ReturnType<typeof buildBoardFromV2> | null;
      let parseError: string | undefined;

      if (v2) {
        try {
          board = buildBoardFromV2(filePath);
        } catch (err) {
          parseError = err instanceof Error ? err.message : String(err);
        }
      } else {
        const result = Brainfile.parseWithErrors(content);
        if (result.board) {
          board = result.board;
        } else {
          parseError = result.error || 'Not a valid brainfile';
        }
      }

      const contentHash = v2
        ? hashBoardContent(`${content}\n${getV2ChangeSignature(filePath)}`)
        : hashBoardContent(content);

      setState((prev) => {
        // Skip redundant refreshes using content hash
        if (!forceRefresh && prev.lastContentHash === contentHash) {
          return prev; // No state change
        }

        if (board) {
          // Preserve selection by task ID and column ID if possible
          const prevColumn = prev.board?.columns[prev.activeColumnIndex];
          const prevTaskId = prevColumn?.tasks[prev.selectedTaskIndex]?.id;

          let newColumnIndex = prev.activeColumnIndex;
          let newTaskIndex = 0;

          // Try to find the same column by ID
          if (prevColumn) {
            const colIdx = board.columns.findIndex((c) => c.id === prevColumn.id);
            if (colIdx >= 0) {
              newColumnIndex = colIdx;
              // Try to find the same task
              if (prevTaskId) {
                const taskIdx = board.columns[colIdx].tasks.findIndex((t) => t.id === prevTaskId);
                if (taskIdx >= 0) newTaskIndex = taskIdx;
              }
            }
          }

          // Bounds check
          newColumnIndex = Math.min(newColumnIndex, Math.max(0, board.columns.length - 1));
          const col = board.columns[newColumnIndex];
          newTaskIndex = Math.min(newTaskIndex, Math.max(0, (col?.tasks.length || 1) - 1));

          return {
            ...prev,
            board,
            error: null,
            lastUpdated: new Date(),
            activeColumnIndex: newColumnIndex,
            selectedTaskIndex: newTaskIndex,
            reloadFlash: true,
            lastContentHash: contentHash,
          };
        }

        // Distinguish between different error cases
        let errorMessage: string;

        if (parseError) {
          errorMessage = parseError;
        } else {
          errorMessage = 'Not a valid brainfile';
        }

        return {
          ...prev,
          error: errorMessage,
          lastContentHash: contentHash,
        };
      });

      // Clear reload flash after 1 second (cleanup previous timeout)
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => {
        setState((prev) => ({ ...prev, reloadFlash: false }));
      }, 1000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Provide more specific error messages
      let userMessage = errorMsg;
      if (errorMsg.includes('ENOENT')) {
        userMessage = `File not found: ${filePath}`;
      } else if (errorMsg.includes('EACCES')) {
        userMessage = `Permission denied: ${filePath}`;
      } else if (errorMsg.includes('EISDIR')) {
        userMessage = `Path is a directory: ${filePath}`;
      }

      setState((prev) => ({
        ...prev,
        error: userMessage,
      }));
    }
  }, [filePath, setState]);

  // Initial load
  useEffect(() => {
    loadBrainfile();
  }, [loadBrainfile]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  // File watcher
  useEffect(() => {
    const v2 = isV2(filePath);
    const dirs = v2 ? getV2Dirs(filePath) : null;
    const watchPaths = v2 && dirs
      ? [filePath, dirs.boardDir, dirs.logsDir]
      : [filePath];

    const watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      usePolling: true,
      interval: 750,
      awaitWriteFinish: {
        stabilityThreshold: 250,
        pollInterval: 100,
      },
      depth: v2 ? 1 : 0,
    });

    watcher.on('add', () => loadBrainfile());
    watcher.on('change', () => loadBrainfile());
    watcher.on('unlink', () => loadBrainfile());
    watcher.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        error: `File watcher error: ${message}`,
      }));
    });

    return () => {
      watcher.close();
    };
  }, [filePath, loadBrainfile, setState]);

  return { loadBrainfile };
}
