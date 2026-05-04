/**
 * CLI Executor — abstraction over shell execution of the mmx CLI.
 *
 * Single Responsibility: Execute CLI commands and return structured results.
 * Dependency Inversion: Consumers depend on this abstraction, not on child_process directly.
 */

import { execSync, ExecSyncOptions } from 'child_process';
import type { CliResult, CliExecutorConfig } from '../types.js';

export class CliExecutor {
  private readonly config: CliExecutorConfig;

  constructor(config: CliExecutorConfig) {
    this.config = config;
  }

  /**
   * Executes an mmx command with the given arguments.
   * Always appends --output json and --quiet for parseable output.
   */
  execute(args: string[], timeout?: number): CliResult {
    const cmd = [this.config.mmxPath, ...args, '--output', 'json', '--quiet'].join(' ');

    const options: ExecSyncOptions = {
      timeout: (timeout ?? this.config.defaultTimeout) * 1000,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB for video/audio
    };

    try {
      const stdout = execSync(cmd, options).toString().trim();
      return { success: true, stdout, stderr: '', exitCode: 0 };
    } catch (error: unknown) {
      const err = error as Error & { stderr?: string; stdout?: string; status?: number };
      return {
        success: false,
        stdout: err.stdout?.toString().trim() ?? '',
        stderr: err.stderr?.toString().trim() ?? err.message,
        exitCode: err.status ?? 1,
      };
    }
  }

  /**
   * Executes an mmx command and parses JSON output.
   */
  executeJson<T = Record<string, unknown>>(args: string[], timeout?: number): T | null {
    const result = this.execute(args, timeout);
    if (!result.success || !result.stdout) {
      return null;
    }
    try {
      return JSON.parse(result.stdout) as T;
    } catch {
      return null;
    }
  }

  /** Returns the path to the mmx binary */
  get binaryPath(): string {
    return this.config.mmxPath;
  }
}
