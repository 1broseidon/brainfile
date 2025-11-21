/**
 * Parse hook input JSON and extract relevant information
 * Handles different input formats from different tools
 */
export function parseHookInput(input: any): {
  filePath?: string;
  command?: string;
  prompt?: string;
  tool?: 'claude-code' | 'cursor' | 'unknown';
} {
  // Handle null or undefined input
  if (!input) {
    return {
      tool: 'unknown'
    };
  }

  // Claude Code format
  if (input.tool_input) {
    return {
      filePath: input.tool_input.file_path,
      command: input.tool_input.command,
      tool: 'claude-code'
    };
  }

  // Cursor format
  if (input.file_path) {
    return {
      filePath: input.file_path,
      tool: 'cursor'
    };
  }

  // Prompt-related hooks
  if (input.prompt) {
    return {
      prompt: input.prompt,
      tool: input.hook_event_name ? 'cursor' : 'claude-code'
    };
  }

  return {
    tool: 'unknown'
  };
}

/**
 * Determine if we should output JSON for Cursor's beforeSubmitPrompt
 */
export function shouldOutputJSON(input: any): boolean {
  return input.hook_event_name === 'beforeSubmitPrompt';
}
