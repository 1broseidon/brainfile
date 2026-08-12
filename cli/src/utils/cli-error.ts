import chalk from 'chalk';
import { ExitCode, type ExitCodeType } from './errorHandler';

/**
 * Custom error class for CLI errors.
 * Thrown by commands to signal failure without calling process.exit directly.
 * The CLI entry point catches this and handles exit codes.
 */
export class CLIError extends Error {
    readonly exitCode: ExitCodeType;
    readonly details?: string;

    constructor(message: string, exitCode: ExitCodeType = ExitCode.USER_ERROR, details?: string) {
        super(message);
        this.name = 'CLIError';
        this.exitCode = exitCode;
        this.details = details;
    }
}

/**
 * Create a CLIError for file not found.
 */
export function fileNotFound(filePath: string): CLIError {
    return new CLIError(
        `File not found: ${filePath}`,
        ExitCode.USER_ERROR,
        'To create a new brainfile, run: brainfile init'
    );
}

/**
 * Create a CLIError for parse errors.
 */
export function parseFailure(error?: string): CLIError {
    const msg = error ? `Failed to parse brainfile: ${error}` : 'Failed to parse brainfile';
    return new CLIError(
        msg,
        ExitCode.USER_ERROR,
        'To validate and fix syntax issues, run: brainfile lint --fix'
    );
}

/**
 * Create a CLIError for missing required options.
 */
export function missingRequired(option: string, usage: string): CLIError {
    return new CLIError(
        `${option} is required`,
        ExitCode.USER_ERROR,
        `Usage: ${usage}`
    );
}

/**
 * Create a CLIError from a core operation failure.
 */
export function operationFailed(error: string): CLIError {
    return new CLIError(error, ExitCode.USER_ERROR);
}

/**
 * Create a CLIError for column not found.
 */
export function columnNotFound(columnId: string, availableColumns: string[]): CLIError {
    const listStr = availableColumns.join(', ');
    return new CLIError(
        `Column not found: ${columnId}`,
        ExitCode.USER_ERROR,
        `Available columns: ${listStr}`
    );
}
/**
 * Create a CLIError for task not found.
 */
export function taskNotFound(taskId: string, availableTasks: string[] = []): CLIError {
    let details: string | undefined;
    if (availableTasks.length > 0) {
        details = `Available tasks:\n${availableTasks.map(t => `  - ${t}`).join('\n')}`;
    }
    return new CLIError(`Task not found: ${taskId}`, ExitCode.USER_ERROR, details);
}

/**
 * Create a CLIError for subtask not found.
 */
export function subtaskNotFound(subtaskId: string, availableSubtasks: string[] = []): CLIError {
    let details: string | undefined;
    if (availableSubtasks.length > 0) {
        details = `Available subtasks:\n${availableSubtasks.map(t => `  - ${t}`).join('\n')}`;
    }
    return new CLIError(`Subtask not found: ${subtaskId}`, ExitCode.USER_ERROR, details);
}

/**
 * Create a CLIError for validation errors.
 */
export function validationError(message: string): CLIError {
    return new CLIError(`Validation error: ${message}`, ExitCode.USER_ERROR);
}

/**
 * Renders a failure that escaped a command and exits.
 *
 * This is the CLI's outermost error boundary, wired to `program.parseAsync()`
 * in cli.ts. Commands throw `CLIError` rather than exiting themselves, and
 * nothing used to catch those throws — so a missing `--task` surfaced as
 * Node's raw uncaught-exception stack trace instead of the message and usage
 * hint the error already carried.
 *
 * Two branches, deliberately:
 *
 * - `CLIError` is an expected, user-facing failure: print the message and its
 *   usage `details`, exit with the code the error carries, and show no stack
 *   (a stack tells the user nothing about a missing flag).
 * - Anything else is a genuine bug: print the real stack, unmodified, and
 *   exit 1. This is what Node already printed, just under our control so the
 *   exit code is deterministic rather than depending on Node's
 *   version-specific unhandled-rejection default.
 */
export function renderCliError(error: unknown): never {
    if (error instanceof CLIError) {
        console.error(chalk.red(`Error: ${error.message}`));
        if (error.details) {
            console.error('');
            console.error(chalk.gray(error.details));
        }
        process.exit(error.exitCode);
    }

    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(ExitCode.USER_ERROR);
}
