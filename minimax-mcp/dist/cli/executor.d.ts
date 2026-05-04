/**
 * CLI Executor — abstraction over shell execution of the mmx CLI.
 *
 * Single Responsibility: Execute CLI commands and return structured results.
 * Dependency Inversion: Consumers depend on this abstraction, not on child_process directly.
 */
import type { CliResult, CliExecutorConfig } from '../types.js';
export declare class CliExecutor {
    private readonly config;
    constructor(config: CliExecutorConfig);
    /**
     * Executes an mmx command with the given arguments.
     * Always appends --output json and --quiet for parseable output.
     */
    execute(args: string[], timeout?: number): CliResult;
    /**
     * Executes an mmx command and parses JSON output.
     */
    executeJson<T = Record<string, unknown>>(args: string[], timeout?: number): T | null;
    /** Returns the path to the mmx binary */
    get binaryPath(): string;
}
//# sourceMappingURL=executor.d.ts.map