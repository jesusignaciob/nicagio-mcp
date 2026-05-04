#!/usr/bin/env node
/**
 * ChromaDB MCP Server — memory vectorial persistente vía MCP.
 *
 * Proporciona herramientas para almacenar, buscar, listar y eliminar
 * memorias en ChromaDB con embeddings automáticos.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ChromaClient } from 'chromadb';
import type { Metadata, Where } from 'chromadb';
import { DefaultEmbeddingFunction } from '@chroma-core/default-embed';

// ─── Config ───────────────────────────────────────────────────────────────────

const CHROMA_HOST = process.env.CHROMA_HOST ?? '127.0.0.1';
const CHROMA_PORT = parseInt(process.env.CHROMA_PORT ?? '8000', 10);
const DEFAULT_COLLECTION = process.env.CHROMA_DEFAULT_COLLECTION ?? 'openclaw-memory';
const TENANT = process.env.CHROMA_TENANT;
const DATABASE = process.env.CHROMA_DATABASE;

// ─── Client ───────────────────────────────────────────────────────────────────

const client = new ChromaClient({
  host: CHROMA_HOST,
  port: CHROMA_PORT,
  tenant: TENANT,
  database: DATABASE,
});

async function ensureCollection(name: string) {
  try {
    return await client.getCollection({ name });
  } catch {
    return await client.createCollection({ name });
  }
}

// ─── Tools ────────────────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: 'store_memory',
    description: 'Store a text memory with optional metadata in ChromaDB',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text content to store' },
        id: {
          type: 'string',
          description: 'Optional unique ID (auto-generated if omitted)',
        },
        collection: {
          type: 'string',
          description: `Collection name (default: ${DEFAULT_COLLECTION})`,
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata key-value pairs',
          additionalProperties: true,
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'search_memory',
    description: 'Search memories by semantic similarity',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query text' },
        collection: {
          type: 'string',
          description: `Collection name (default: ${DEFAULT_COLLECTION})`,
        },
        n_results: {
          type: 'number',
          description: 'Number of results (default: 5)',
        },
        filter: {
          type: 'object',
          description: 'Optional metadata filter',
          additionalProperties: true,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_collections',
    description: 'List all ChromaDB collections',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_collection_info',
    description: 'Get info about a collection (count, metadata)',
    inputSchema: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          description: `Collection name (default: ${DEFAULT_COLLECTION})`,
        },
      },
    },
  },
  {
    name: 'delete_memory',
    description: 'Delete a memory by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the memory to delete' },
        collection: {
          type: 'string',
          description: `Collection name (default: ${DEFAULT_COLLECTION})`,
        },
      },
      required: ['id'],
    },
  },
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseMetadata(raw: unknown): Metadata | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const meta: Metadata = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      meta[key] = val;
    }
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

function parseWhere(raw: unknown): Where | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as Where;
}

async function handleStoreMemory(args: Record<string, unknown>) {
  const coll = await ensureCollection((args.collection as string) ?? DEFAULT_COLLECTION);
  const id = (args.id as string) ?? generateId();
  await coll.add({
    ids: [id],
    documents: [args.text as string],
    metadatas: [parseMetadata(args.metadata) ?? {}],
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify({ id, status: 'stored' }) }] };
}

interface QueryResultItem {
  id: string;
  text: string | null;
  metadata: Metadata | null;
  distance: number | null;
}

async function handleSearchMemory(args: Record<string, unknown>) {
  const coll = await ensureCollection((args.collection as string) ?? DEFAULT_COLLECTION);
  const results = await coll.query({
    queryTexts: [args.query as string],
    nResults: (args.n_results as number) ?? 5,
    where: parseWhere(args.filter),
  });

  const formatted: QueryResultItem[] = (results.documents?.[0] ?? []).map((doc, i) => ({
    id: (results.ids?.[0] ?? [])[i] ?? '',
    text: doc,
    metadata: (results.metadatas?.[0] ?? [])[i] ?? null,
    distance: (results.distances?.[0] ?? [])[i] ?? null,
  }));

  return { content: [{ type: 'text' as const, text: JSON.stringify(formatted, null, 2) }] };
}

async function handleListCollections() {
  const collections = await client.listCollections();
  const names = collections.map((c) => c.name);
  return { content: [{ type: 'text' as const, text: JSON.stringify(names, null, 2) }] };
}

async function handleGetCollectionInfo(args: Record<string, unknown>) {
  const coll = await ensureCollection((args.collection as string) ?? DEFAULT_COLLECTION);
  const count = await coll.count();
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ name: coll.name, count }, null, 2),
      },
    ],
  };
}

async function handleDeleteMemory(args: Record<string, unknown>) {
  const coll = await ensureCollection((args.collection as string) ?? DEFAULT_COLLECTION);
  await coll.delete({ ids: [args.id as string] });
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ id: args.id, status: 'deleted' }) }],
  };
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'chroma-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'store_memory':
        return await handleStoreMemory((args as Record<string, unknown>) ?? {});
      case 'search_memory':
        return await handleSearchMemory((args as Record<string, unknown>) ?? {});
      case 'list_collections':
        return await handleListCollections();
      case 'get_collection_info':
        return await handleGetCollectionInfo((args as Record<string, unknown>) ?? {});
      case 'delete_memory':
        return await handleDeleteMemory((args as Record<string, unknown>) ?? {});
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: unknown) {
    if (error instanceof McpError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

// ─── Warmup ───────────────────────────────────────────────────────────────────

(async () => {
  try {
    const ef = new DefaultEmbeddingFunction();
    console.error('Warming up embedding model (downloads model on first run)...');
    const start = Date.now();
    await ef.generate(['warmup']);
    console.error(`Embedding model ready (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Embedding model warmup:', message);
  }
})();

// ─── Transport ────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('ChromaDB MCP server running on stdio');
