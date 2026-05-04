/**
 * MiniMax MCP Server — coordinates tool execution via the MCP protocol.
 *
 * Single Responsibility: MCP lifecycle management and request routing.
 * Dependency Inversion: Depends on ToolRegistry and CliExecutor abstractions.
 */
export interface MinimaxMcpConfig {
    mmxPath: string;
    defaultTimeout?: number;
    serverName?: string;
    serverVersion?: string;
}
export declare class MinimaxMcpServer {
    private readonly server;
    private readonly registry;
    constructor(config: MinimaxMcpConfig);
    private registerHandlers;
    /** Start the server using stdio transport */
    start(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map