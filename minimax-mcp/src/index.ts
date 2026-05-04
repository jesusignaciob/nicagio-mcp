#!/usr/bin/env node

/**
 * MiniMax MCP Server — Entry Point
 *
 * Wraps the mmx CLI as MCP tools for AI agent integration.
 * Discover the mmx binary and start the server.
 */

import { MinimaxMcpServer } from './server.js';
import { resolve } from 'path';
import { execSync } from 'child_process';

/** Resolve mmx binary path from common locations */
function resolveMmxPath(): string {
  const home = process.env.HOME ?? '/home/prometeo';

  const candidates = [
    '/usr/local/bin/mmx',
    '/usr/lib/node_modules/mmx-cli/bin/mmx.js',
    resolve(home, '.npm-global/bin/mmx'),
    'mmx', // trust PATH as final fallback
  ];

  for (const candidate of candidates) {
    try {
      execSync(`${candidate} --version`, { stdio: 'ignore', timeout: 3000 });
      return candidate;
    } catch {
      continue;
    }
  }

  return 'mmx';
}

async function main(): Promise<void> {
  const mmxPath = resolveMmxPath();

  console.error(`[minimax-mcp] Using mmx binary: ${mmxPath}`);

  const server = new MinimaxMcpServer({
    mmxPath,
    serverName: 'minimax-mcp',
    serverVersion: '1.0.0',
    defaultTimeout: 180,
  });

  await server.start();
}

main().catch((error) => {
  console.error('[minimax-mcp] Fatal error:', error);
  process.exit(1);
});
