/**
 * Tool Registry — manages tool registration and discovery.
 *
 * Open/Closed: New tools are added by registering them, not by modifying this class.
 * Single Responsibility: Only manages the collection of tools.
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { CliExecutor } from '../cli/executor.js';
import type { CliResult } from '../types.js';
export declare class ToolRegistry {
    private readonly definitions;
    constructor(executor: CliExecutor);
    /** Returns MCP tool specs for the server capabilities */
    getSpecs(): Tool[];
    /** Finds and executes a tool by name */
    execute(name: string, params: Record<string, unknown>): Promise<CliResult>;
}
//# sourceMappingURL=registry.d.ts.map