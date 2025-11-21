import { parseHookInput, shouldOutputJSON } from '../utils/hook-parser';

describe('hook-parser', () => {
  describe('parseHookInput', () => {
    it('should parse Claude Code format', () => {
      const input = {
        tool_input: {
          file_path: 'src/main.ts',
          description: 'Added new function'
        }
      };

      const result = parseHookInput(input);

      expect(result.filePath).toBe('src/main.ts');
      expect(result.tool).toBe('claude-code');
    });

    it('should parse Cursor format', () => {
      const input = {
        file_path: '/absolute/path/to/file.ts',
        edits: [
          {
            old_string: 'const x = 1',
            new_string: 'const x = 2'
          }
        ],
        conversation_id: 'abc123',
        generation_id: 'xyz789',
        hook_event_name: 'afterFileEdit',
        workspace_roots: ['/path/to/workspace']
      };

      const result = parseHookInput(input);

      expect(result.filePath).toBe('/absolute/path/to/file.ts');
      expect(result.tool).toBe('cursor');
    });

    it('should parse Claude Code prompt format', () => {
      const input = {
        prompt: 'user prompt text',
        attachments: []
      };

      const result = parseHookInput(input);

      expect(result.prompt).toBe('user prompt text');
      expect(result.tool).toBe('claude-code');
    });

    it('should parse Cursor prompt format', () => {
      const input = {
        prompt: 'user prompt text',
        attachments: [
          {
            type: 'file',
            filePath: '/path/to/file.ts'
          }
        ],
        conversation_id: 'abc123',
        generation_id: 'xyz789',
        hook_event_name: 'beforeSubmitPrompt',
        workspace_roots: ['/path/to/workspace']
      };

      const result = parseHookInput(input);

      expect(result.prompt).toBe('user prompt text');
      expect(result.tool).toBe('cursor');
    });

    it('should parse Cline PostToolUse format', () => {
      const input = {
        clineVersion: '3.0.0',
        hookName: 'PostToolUse',
        timestamp: '2024-01-01T00:00:00Z',
        taskId: 'task-123',
        workspaceRoots: ['/path/to/workspace'],
        userId: 'user-123',
        postToolUse: {
          toolName: 'write_to_file',
          parameters: {
            target_file: 'src/main.ts',
            content: 'console.log("hello");'
          },
          result: 'success',
          success: true,
          executionTimeMs: 100
        }
      };

      const result = parseHookInput(input);

      expect(result.filePath).toBe('src/main.ts');
      expect(result.tool).toBe('cline');
    });

    it('should parse Cline UserPromptSubmit format', () => {
      const input = {
        clineVersion: '3.0.0',
        hookName: 'UserPromptSubmit',
        timestamp: '2024-01-01T00:00:00Z',
        taskId: 'task-123',
        workspaceRoots: ['/path/to/workspace'],
        userId: 'user-123',
        userPromptSubmit: {
          prompt: 'Fix the bug in main.ts',
          attachments: ['file1.ts']
        }
      };

      const result = parseHookInput(input);

      expect(result.prompt).toBe('Fix the bug in main.ts');
      expect(result.tool).toBe('cline');
    });

    it('should parse Cline TaskStart format', () => {
      const input = {
        clineVersion: '3.0.0',
        hookName: 'TaskStart',
        timestamp: '2024-01-01T00:00:00Z',
        taskId: 'task-123',
        workspaceRoots: ['/path/to/workspace'],
        userId: 'user-123',
        taskStart: {
          taskMetadata: {
            taskId: 'task-123',
            ulid: 'ulid-123',
            initialTask: 'Start new feature'
          }
        }
      };

      const result = parseHookInput(input);

      expect(result.tool).toBe('cline');
    });

    it('should handle malformed JSON', () => {
      const input = {};

      const result = parseHookInput(input);

      expect(result.tool).toBe('unknown');
      expect(result.filePath).toBeUndefined();
      expect(result.prompt).toBeUndefined();
    });

    it('should handle null input', () => {
      const input = null;

      const result = parseHookInput(input);

      expect(result.tool).toBe('unknown');
    });
  });

  describe('shouldOutputJSON', () => {
    it('should return true for Cursor beforeSubmitPrompt', () => {
      const input = {
        prompt: 'test',
        hook_event_name: 'beforeSubmitPrompt'
      };

      expect(shouldOutputJSON(input)).toBe(true);
    });

    it('should return true for Cline hooks', () => {
      const input = {
        clineVersion: '3.0.0',
        hookName: 'PostToolUse',
        timestamp: '2024-01-01T00:00:00Z',
        taskId: 'task-123'
      };

      expect(shouldOutputJSON(input)).toBe(true);
    });

    it('should return false for Claude Code format', () => {
      const input = {
        prompt: 'test',
        attachments: []
      };

      expect(shouldOutputJSON(input)).toBe(false);
    });

    it('should return false for Cursor afterFileEdit', () => {
      const input = {
        file_path: '/path/to/file.ts',
        hook_event_name: 'afterFileEdit'
      };

      expect(shouldOutputJSON(input)).toBe(false);
    });

    it('should return false for empty input', () => {
      expect(shouldOutputJSON({})).toBe(false);
    });
  });
});
