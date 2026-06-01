/**
 * Parse hook input JSON and extract relevant information
 * Handles different input formats from different tools
 */
export function parseHookInput(input: any): {
  filePath?: string;
  command?: string;
  prompt?: string;
  tool?: 'claude-code' | 'cursor' | 'cline' | 'unknown';
} {
  // Handle null or undefined input
  if (!input) {
    return {
      tool: 'unknown'
    };
  }

  // Cline format - check for clineVersion and hookName
  if (input.clineVersion && input.hookName) {
    // Extract file path from postToolUse parameters if available
    let filePath: string | undefined;
    
    if (input.postToolUse?.parameters?.target_file) {
      filePath = input.postToolUse.parameters.target_file;
    } else if (input.postToolUse?.parameters?.file_path) {
      filePath = input.postToolUse.parameters.file_path;
    }

    return {
      filePath,
      prompt: input.userPromptSubmit?.prompt,
      tool: 'cline'
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
 * Determine if we should output JSON for Cursor's beforeSubmitPrompt or Cline hooks
 */
export function shouldOutputJSON(input: any): boolean {
  // Cline always expects JSON output
  if (input && input.clineVersion && input.hookName) {
    return true;
  }
  
  // Cursor's beforeSubmitPrompt expects JSON
  return input.hook_event_name === 'beforeSubmitPrompt';
}
