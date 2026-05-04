/**
 * MiniMax MCP Server — coordinates tool execution via the MCP protocol.
 *
 * Single Responsibility: MCP lifecycle management and request routing.
 * Dependency Inversion: Depends on ToolRegistry and CliExecutor abstractions.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from './tools/registry.js';
import { CliExecutor } from './cli/executor.js';

export interface MinimaxMcpConfig {
  mmxPath: string;
  defaultTimeout?: number;
  serverName?: string;
  serverVersion?: string;
}

export class MinimaxMcpServer {
  private readonly server: Server;
  private readonly registry: ToolRegistry;

  constructor(config: MinimaxMcpConfig) {
    const executor = new CliExecutor({
      mmxPath: config.mmxPath,
      defaultTimeout: config.defaultTimeout ?? 120,
    });

    this.registry = new ToolRegistry(executor);

    this.server = new Server(
      {
        name: config.serverName ?? 'minimax-mcp',
        version: config.serverVersion ?? '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: this.registry.getSpecs(),
    }));

    // Handle tool execution
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest) => {
        const { name, arguments: args } = request.params;
        const result = await this.registry.execute(name, (args as Record<string, unknown>) ?? {});

        return {
          content: [
            {
              type: 'text',
              text: result.success
                ? result.stdout || 'Done (no output)'
                : `Error: ${result.stderr}`,
            },
          ],
          isError: !result.success,
        };
      },
    );
  }

  /** Start the server using stdio transport */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
