/**
 * Logger interface for CLI output.
 * Allows dependency injection for testability.
 */
export interface Logger {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    log(...args: unknown[]): void;
}

/**
 * Default logger implementation wrapping console.
 */
export const defaultLogger: Logger = {
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    log: (...args) => console.log(...args),
};

/**
 * Memory logger for testing - captures all output.
 */
export class MemoryLogger implements Logger {
    readonly infos: unknown[][] = [];
    readonly warns: unknown[][] = [];
    readonly errors: unknown[][] = [];
    readonly logs: unknown[][] = [];

    info(...args: unknown[]): void {
        this.infos.push(args);
    }

    warn(...args: unknown[]): void {
        this.warns.push(args);
    }

    error(...args: unknown[]): void {
        this.errors.push(args);
    }

    log(...args: unknown[]): void {
        this.logs.push(args);
    }

    /** Get all output as a single string (for assertions) */
    getOutput(): string {
        return [...this.logs, ...this.infos, ...this.warns]
            .map(args => args.map(String).join(' '))
            .join('\n');
    }

    /** Get all error output as a single string */
    getErrorOutput(): string {
        return this.errors
            .map(args => args.map(String).join(' '))
            .join('\n');
    }

    /** Clear all captured output */
    clear(): void {
        this.infos.length = 0;
        this.warns.length = 0;
        this.errors.length = 0;
        this.logs.length = 0;
    }
}
