/**
 * Text Chat Tool — wraps `mmx text chat`.
 *
 * Single Responsibility: Only handles text generation/chat.
 */
import type { ToolDefinition } from './base-tool.js';
import type { CliExecutor } from '../cli/executor.js';
export declare function createTextTool(executor: CliExecutor): ToolDefinition;
//# sourceMappingURL=text-tool.d.ts.map