import { useCallback, useEffect, useRef } from 'react';
import * as fs from 'fs';
import * as chokidar from 'chokidar';
import { Brainfile, hashBoardContent } from '@brainfile/core';
import type { AppState } from '../types.js';

export function useBrainfileLoader(
  filePath: string,
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>
) {
  // Track flash timeout for cleanup
  const flashTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadBrainfile = useCallback((forceRefresh = false) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = hashBoardContent(content);
      const result = Brainfile.parseWithErrors(content);

      setState(prev => {
        // Skip redundant refreshes using content hash
        if (!forceRefresh && prev.lastContentHash === contentHash) {
          return prev; // No state change
        }

        if (result.board) {
          // Preserve selection by task ID and column ID if possible
          const prevColumn = prev.board?.columns[prev.activeColumnIndex];
          const prevTaskId = prevColumn?.tasks[prev.selectedTaskIndex]?.id;

          let newColumnIndex = prev.activeColumnIndex;
          let newTaskIndex = 0;

          // Try to find the same column by ID
          if (prevColumn && result.board) {
            const colIdx = result.board.columns.findIndex(c => c.id === prevColumn.id);
            if (colIdx >= 0) {
              newColumnIndex = colIdx;
              // Try to find the same task
              if (prevTaskId) {
                const taskIdx = result.board.columns[colIdx].tasks.findIndex(t => t.id === prevTaskId);
                if (taskIdx >= 0) newTaskIndex = taskIdx;
              }
            }
          }

          // Bounds check
          newColumnIndex = Math.min(newColumnIndex, Math.max(0, result.board.columns.length - 1));
          const col = result.board.columns[newColumnIndex];
          newTaskIndex = Math.min(newTaskIndex, Math.max(0, (col?.tasks.length || 1) - 1));

          return {
            ...prev,
            board: result.board,
            error: null,
            lastUpdated: new Date(),
            activeColumnIndex: newColumnIndex,
            selectedTaskIndex: newTaskIndex,
            reloadFlash: true,
            lastContentHash: contentHash,
          };
        } else {
          // Distinguish between different error cases
          let errorMessage: string;

          if (result.data && result.type) {
            errorMessage = `This is a '${result.type}' brainfile. The TUI currently only supports 'board' type files.`;
          } else if (result.error) {
            errorMessage = result.error;
          } else {
            errorMessage = 'Not a valid brainfile';
          }

          return {
            ...prev,
            error: errorMessage,
            lastContentHash: contentHash,
          };
        }
      });

      // Clear reload flash after 1 second (cleanup previous timeout)
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => {
        setState(prev => ({ ...prev, reloadFlash: false }));
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

      setState(prev => ({
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
  }, [filePath, loadBrainfile, setState]);

  return { loadBrainfile };
}
