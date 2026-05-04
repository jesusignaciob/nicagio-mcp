#!/usr/bin/env node
/**
 * ChromaDB MCP Server — memory vectorial persistente vía MCP.
 *
 * Proporciona herramientas para almacenar, buscar, listar y eliminar
 * memorias en ChromaDB con embeddings automáticos.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError, } from '@modelcontextprotocol/sdk/types.js';
import { ChromaClient } from 'chromadb';
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
async function ensureCollection(name) {
    try {
        return await client.getCollection({ name });
    }
    catch {
        return await client.createCollection({ name });
    }
}
// ─── Tools ────────────────────────────────────────────────────────────────────
const TOOLS = [
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
function generateId() {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function parseMetadata(raw) {
    if (!raw || typeof raw !== 'object')
        return undefined;
    const meta = {};
    for (const [key, val] of Object.entries(raw)) {
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
            meta[key] = val;
        }
    }
    return Object.keys(meta).length > 0 ? meta : undefined;
}
function parseWhere(raw) {
    if (!raw || typeof raw !== 'object')
        return undefined;
    return raw;
}
async function handleStoreMemory(args) {
    const coll = await ensureCollection(args.collection ?? DEFAULT_COLLECTION);
    const id = args.id ?? generateId();
    await coll.add({
        ids: [id],
        documents: [args.text],
        metadatas: [parseMetadata(args.metadata) ?? {}],
    });
    return { content: [{ type: 'text', text: JSON.stringify({ id, status: 'stored' }) }] };
}
async function handleSearchMemory(args) {
    const coll = await ensureCollection(args.collection ?? DEFAULT_COLLECTION);
    const results = await coll.query({
        queryTexts: [args.query],
        nResults: args.n_results ?? 5,
        where: parseWhere(args.filter),
    });
    const formatted = (results.documents?.[0] ?? []).map((doc, i) => ({
        id: (results.ids?.[0] ?? [])[i] ?? '',
        text: doc,
        metadata: (results.metadatas?.[0] ?? [])[i] ?? null,
        distance: (results.distances?.[0] ?? [])[i] ?? null,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
}
async function handleListCollections() {
    const collections = await client.listCollections();
    const names = collections.map((c) => c.name);
    return { content: [{ type: 'text', text: JSON.stringify(names, null, 2) }] };
}
async function handleGetCollectionInfo(args) {
    const coll = await ensureCollection(args.collection ?? DEFAULT_COLLECTION);
    const count = await coll.count();
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({ name: coll.name, count }, null, 2),
            },
        ],
    };
}
async function handleDeleteMemory(args) {
    const coll = await ensureCollection(args.collection ?? DEFAULT_COLLECTION);
    await coll.delete({ ids: [args.id] });
    return {
        content: [{ type: 'text', text: JSON.stringify({ id: args.id, status: 'deleted' }) }],
    };
}
// ─── Server ───────────────────────────────────────────────────────────────────
const server = new Server({ name: 'chroma-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case 'store_memory':
                return await handleStoreMemory(args ?? {});
            case 'search_memory':
                return await handleSearchMemory(args ?? {});
            case 'list_collections':
                return await handleListCollections();
            case 'get_collection_info':
                return await handleGetCollectionInfo(args ?? {});
            case 'delete_memory':
                return await handleDeleteMemory(args ?? {});
            default:
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
    }
    catch (error) {
        if (error instanceof McpError)
            throw error;
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
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('Embedding model warmup:', message);
    }
})();
// ─── Transport ────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('ChromaDB MCP server running on stdio');
//# sourceMappingURL=server.js.map