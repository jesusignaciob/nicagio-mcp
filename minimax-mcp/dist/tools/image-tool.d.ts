/**
 * Image Generation Tool — wraps `mmx image generate`.
 *
 * Single Responsibility: Only handles image generation.
 */
import type { ToolDefinition } from './base-tool.js';
import type { CliExecutor } from '../cli/executor.js';
export declare function createImageTool(executor: CliExecutor): ToolDefinition;
//# sourceMappingURL=image-tool.d.ts.map