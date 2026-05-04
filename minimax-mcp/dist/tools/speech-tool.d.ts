/**
 * Speech Synthesis Tool — wraps `mmx speech synthesize`.
 *
 * Single Responsibility: Only handles text-to-speech.
 */
import type { ToolDefinition } from './base-tool.js';
import type { CliExecutor } from '../cli/executor.js';
export declare function createSpeechTool(executor: CliExecutor): ToolDefinition;
//# sourceMappingURL=speech-tool.d.ts.map