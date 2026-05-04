/**
 * Music Generation Tool — wraps `mmx music generate`.
 *
 * Single Responsibility: Only handles music generation.
 */
import type { ToolDefinition } from './base-tool.js';
import type { CliExecutor } from '../cli/executor.js';
export declare function createMusicTool(executor: CliExecutor): ToolDefinition;
//# sourceMappingURL=music-tool.d.ts.map