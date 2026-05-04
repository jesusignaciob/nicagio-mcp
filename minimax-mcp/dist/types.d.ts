/**
 * Shared types for the MiniMax MCP server.
 * Following Interface Segregation — small, focused contracts.
 */
/** Result of executing a CLI command */
export interface CliResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
}
/** Abstract output from any mmx command (when --output json is used) */
export interface MmxJsonOutput {
    saved?: string[];
    urls?: string[];
    taskId?: string;
    status?: string;
    message?: string;
    content?: string;
    [key: string]: unknown;
}
/** Parameters for a tool handler */
export interface ToolParams {
    [key: string]: string | number | boolean | undefined | null;
}
/** Configuration for the CLI executor */
export interface CliExecutorConfig {
    /** Path to the mmx binary */
    mmxPath: string;
    /** Default timeout in seconds */
    defaultTimeout: number;
}
/** Media file reference returned by tools */
export interface MediaResult {
    type: 'image' | 'video' | 'audio' | 'text';
    path?: string;
    url?: string;
    content?: string;
    taskId?: string;
}
//# sourceMappingURL=types.d.ts.map