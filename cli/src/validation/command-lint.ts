import * as path from 'path';
import { workspaceRootFromBrainfilePath } from '../utils/workspace-format';

export interface ValidationCommandLintWarning {
  command: string;
  matchedPrefix: string;
  workspacePath: string;
  suggestion: string;
  message: string;
}

export function getWorkspaceRelativePath(brainfilePath: string): string {
  const workspaceRoot = workspaceRootFromBrainfilePath(brainfilePath);
  const relativePath = path.relative(process.cwd(), workspaceRoot);

  if (!relativePath || relativePath === '.') {
    return '.';
  }

  return relativePath.split(path.sep).join('/');
}

function normalizeShellPath(input: string): string {
  const trimmed = input.trim().replace(/\\/g, '/');
  const withoutLeadingDotSlash = trimmed.replace(/^\.\//, '');
  const normalized = path.posix.normalize(withoutLeadingDotSlash);
  return normalized === '.' ? '' : normalized;
}

function escapeForRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function lintValidationCommand(command: string, brainfilePath: string): ValidationCommandLintWarning | null {
  const workspacePath = getWorkspaceRelativePath(brainfilePath);
  if (workspacePath === '.') {
    return null;
  }

  const normalizedWorkspacePath = normalizeShellPath(workspacePath);
  if (!normalizedWorkspacePath) {
    return null;
  }

  const pattern = new RegExp(
    `^\\s*cd\\s+((?:\\./)?${escapeForRegex(normalizedWorkspacePath)})\\s*&&\\s*(.+)$`
  );
  const match = command.match(pattern);
  if (!match) {
    return null;
  }

  const [, matchedPrefixPath, remainder] = match;
  const suggestion = remainder.trim();
  const matchedPrefix = `cd ${matchedPrefixPath} &&`;

  return {
    command,
    matchedPrefix,
    workspacePath,
    suggestion,
    message: `Validation command contains '${matchedPrefix}' — agents are dispatched into the workspace root, consider using '${suggestion}' instead`,
  };
}

export function lintValidationCommands(commands: string[] | undefined, brainfilePath: string): ValidationCommandLintWarning[] {
  return (commands ?? [])
    .map((command) => lintValidationCommand(command, brainfilePath))
    .filter((warning): warning is ValidationCommandLintWarning => warning !== null);
}
