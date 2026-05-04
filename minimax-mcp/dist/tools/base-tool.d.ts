/**
 * Base Tool — abstract contract for all MCP tools.
 *
 * Single Responsibility: Defines the tool interface contract.
 * Liskov Substitution: Any tool implementation can replace another.
 * Interface Segregation: Minimal surface — just name, schema, and handler.
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { CliResult } from '../types.js';
/** Tool definition and handler pair */
export interface ToolDefinition {
    /** MCP tool metadata (name, description, input schema) */
    spec: Tool;
    /** Handler that executes the tool logic */
    handler: (params: Record<string, unknown>) => Promise<CliResult>;
}
//# sourceMappingURL=base-tool.d.ts.map