#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import { randomUUID } from 'node:crypto';
import { pipeline } from '@huggingface/transformers';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const DEFAULT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'openclaw-memory';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'Xenova/all-MiniLM-L6-v2';
const client = new QdrantClient({ url: QDRANT_URL });
let embed;
async function ensureCollection(name) {
    const { exists } = await client.collectionExists(name);
    if (!exists) {
        try {
            await client.createCollection(name, {
                vectors: { size: 384, distance: 'Cosine' },
            });
        }
        catch (e) {
            const err = e;
            if (err.status !== 409 && !(err.message ?? '').includes('Conflict')) {
                throw e;
            }
        }
    }
}
const TOOLS = [
    {
        name: 'store_memory',
        description: 'Store a text memory with optional metadata in Qdrant',
        inputSchema: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'Text content to store' },
                id: { type: 'string', description: 'Optional unique ID (auto-generated if omitted)' },
                collection: { type: 'string', description: `Collection name (default: ${DEFAULT_COLLECTION})` },
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
                collection: { type: 'string', description: `Collection name (default: ${DEFAULT_COLLECTION})` },
                n_results: { type: 'number', description: 'Number of results (default: 5)' },
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
        description: 'List all Qdrant collections',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_collection_info',
        description: 'Get info about a collection (name, count)',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: `Collection name (default: ${DEFAULT_COLLECTION})` },
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
                collection: { type: 'string', description: `Collection name (default: ${DEFAULT_COLLECTION})` },
            },
            required: ['id'],
        },
    },
    {
        name: 'list_memories',
        description: 'List/search memories with payload filters (metadata browsing, not semantic search)',
        inputSchema: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'Optional text filter (partial match on payload.text)' },
                collection: { type: 'string', description: `Collection name (default: ${DEFAULT_COLLECTION})` },
                tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
                from: { type: 'string', description: "Filter by 'from' field in metadata" },
                to: { type: 'string', description: "Filter by 'to' field in metadata" },
                priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Filter by priority' },
                since: { type: 'string', description: 'ISO date — filter by timestamp >= this' },
                limit: { type: 'number', description: 'Number of results (default: 20)' },
                offset: { type: 'string', description: 'Cursor for pagination (from previous response next_offset)' },
            },
        },
    },
    {
        name: 'update_memory',
        description: 'Update metadata of an existing memory WITHOUT re-generating the vector embedding',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Point ID to update' },
                collection: { type: 'string', description: `Collection name (default: ${DEFAULT_COLLECTION})` },
                text: { type: 'string', description: 'New text content' },
                metadata: {
                    type: 'object',
                    description: 'New metadata to merge into existing payload',
                    additionalProperties: true,
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'hybrid_search',
        description: 'Combine dense vector search (semantic) with text keyword search using RRF fusion',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query text' },
                collection: { type: 'string', description: `Collection name (default: ${DEFAULT_COLLECTION})` },
                n_results: { type: 'number', description: 'Number of results (default: 5)' },
                filter: {
                    type: 'object',
                    description: 'Optional metadata filter (same as search_memory)',
                    additionalProperties: true,
                },
                sparse_weight: { type: 'number', description: 'Weight for sparse results in RRF (default: 1.0)' },
                dense_weight: { type: 'number', description: 'Weight for dense results in RRF (default: 1.0)' },
            },
            required: ['query'],
        },
    },
];
function generateId() {
    return randomUUID();
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
function parseFilter(raw) {
    if (!raw || typeof raw !== 'object')
        return undefined;
    const must = [];
    for (const [key, val] of Object.entries(raw)) {
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
            must.push({ key, match: { value: val } });
        }
    }
    return must.length > 0 ? { must } : undefined;
}
async function handleStoreMemory(args) {
    const collection = args.collection ?? DEFAULT_COLLECTION;
    await ensureCollection(collection);
    const id = args.id ?? generateId();
    const text = args.text;
    const vector = await embed(text);
    const payload = { text, created_at: Date.now() };
    const meta = parseMetadata(args.metadata);
    if (meta)
        Object.assign(payload, meta);
    await client.upsert(collection, {
        wait: true,
        points: [{ id, vector, payload }],
    });
    return { content: [{ type: 'text', text: JSON.stringify({ id, status: 'stored' }) }] };
}
async function handleSearchMemory(args) {
    const collection = args.collection ?? DEFAULT_COLLECTION;
    await ensureCollection(collection);
    const query = args.query;
    const n_results = args.n_results ?? 5;
    const vector = await embed(query);
    const results = await client.search(collection, {
        vector,
        limit: n_results,
        filter: parseFilter(args.filter),
    });
    const formatted = results.map((r) => ({
        id: r.id,
        text: r.payload?.text ?? '',
        metadata: (() => {
            if (!r.payload)
                return null;
            const { text: _, ...rest } = r.payload;
            return Object.keys(rest).length > 0 ? rest : null;
        })(),
        score: r.score,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
}
async function handleListCollections() {
    const { collections } = await client.getCollections();
    const names = collections.map((c) => c.name);
    return { content: [{ type: 'text', text: JSON.stringify(names, null, 2) }] };
}
async function handleGetCollectionInfo(args) {
    const name = args.collection ?? DEFAULT_COLLECTION;
    await ensureCollection(name);
    const info = await client.getCollection(name);
    return {
        content: [{ type: 'text', text: JSON.stringify({ name, count: info.points_count ?? 0 }, null, 2) }],
    };
}
async function handleDeleteMemory(args) {
    const collection = args.collection ?? DEFAULT_COLLECTION;
    const id = args.id;
    await client.delete(collection, { wait: true, points: [id] });
    return { content: [{ type: 'text', text: JSON.stringify({ id, status: 'deleted' }) }] };
}
async function handleListMemories(args) {
    const collection = args.collection ?? DEFAULT_COLLECTION;
    await ensureCollection(collection);
    const must = [];
    if (args.text) {
        must.push({ key: 'text', match: { text: args.text } });
    }
    if (args.tags) {
        const tags = Array.isArray(args.tags) ? args.tags : [String(args.tags)];
        for (const tag of tags) {
            must.push({ key: 'tags', match: { text: tag } });
        }
    }
    if (args.from) {
        must.push({ key: 'from', match: { value: args.from } });
    }
    if (args.to) {
        must.push({ key: 'to', match: { value: args.to } });
    }
    if (args.priority) {
        must.push({ key: 'priority', match: { value: args.priority } });
    }
    if (args.since) {
        const sinceMs = new Date(args.since).getTime();
        if (!isNaN(sinceMs)) {
            must.push({ key: 'created_at', range: { gte: sinceMs } });
        }
    }
    const filter = must.length > 0 ? { must } : undefined;
    const limit = args.limit ?? 20;
    const offset = args.offset;
    const result = await client.scroll(collection, { filter, limit, offset, with_payload: true, with_vector: false });
    const points = result.points.map((p) => {
        const payload = p.payload ?? {};
        return {
            id: p.id,
            text: payload.text ?? '',
            metadata: (() => {
                const { text: _, created_at: _c, ...rest } = payload;
                return Object.keys(rest).length > 0 ? rest : null;
            })(),
            created_at: payload.created_at ?? null,
        };
    });
    return { content: [{ type: 'text', text: JSON.stringify({ points, next_offset: result.next_page_offset ?? null }, null, 2) }] };
}
async function handleUpdateMemory(args) {
    const collection = args.collection ?? DEFAULT_COLLECTION;
    const id = args.id;
    const payload = {};
    const updatedFields = [];
    if (args.text) {
        payload.text = args.text;
        updatedFields.push('text');
    }
    if (args.metadata && typeof args.metadata === 'object') {
        for (const [key, val] of Object.entries(args.metadata)) {
            if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
                payload[key] = val;
                updatedFields.push(key);
            }
        }
    }
    if (updatedFields.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ id, status: 'no_changes', updated_fields: [] }) }] };
    }
    await client.setPayload(collection, { payload, points: [id], wait: true });
    return { content: [{ type: 'text', text: JSON.stringify({ id, status: 'updated', updated_fields: updatedFields }) }] };
}
async function handleHybridSearch(args) {
    const collection = args.collection ?? DEFAULT_COLLECTION;
    await ensureCollection(collection);
    const query = args.query;
    const n_results = args.n_results ?? 5;
    const denseWeight = args.dense_weight ?? 1.0;
    const sparseWeight = args.sparse_weight ?? 1.0;
    const k = 60;
    const limit = n_results * 2;
    const vector = await embed(query);
    const denseResults = await client.search(collection, {
        vector,
        limit,
        filter: parseFilter(args.filter),
    });
    const textMust = [{ key: 'text', match: { text: query } }];
    const existingFilter = parseFilter(args.filter);
    if (existingFilter) {
        const existingMust = existingFilter.must;
        textMust.push(...existingMust);
    }
    const scrollResults = await client.scroll(collection, {
        filter: { must: textMust },
        limit,
        with_payload: true,
        with_vector: false,
    });
    const idMap = {};
    denseResults.forEach((r, i) => {
        const id = String(r.id);
        const payload = r.payload ?? {};
        idMap[id] = idMap[id] ?? { denseRank: null, sparseRank: null, payload: {} };
        idMap[id].denseRank = i + 1;
        idMap[id].payload = { ...idMap[id].payload, ...payload };
    });
    scrollResults.points.forEach((p, i) => {
        const id = String(p.id);
        const payload = p.payload ?? {};
        idMap[id] = idMap[id] ?? { denseRank: null, sparseRank: null, payload: {} };
        idMap[id].sparseRank = i + 1;
        idMap[id].payload = { ...idMap[id].payload, ...payload };
    });
    const fused = Object.entries(idMap).map(([id, info]) => {
        let score = 0;
        if (info.denseRank !== null)
            score += denseWeight / (k + info.denseRank);
        if (info.sparseRank !== null)
            score += sparseWeight / (k + info.sparseRank);
        const { text: _, ...rest } = info.payload;
        return {
            id,
            text: info.payload.text ?? '',
            metadata: Object.keys(rest).length > 0 ? rest : null,
            score,
        };
    });
    fused.sort((a, b) => b.score - a.score);
    return { content: [{ type: 'text', text: JSON.stringify(fused.slice(0, n_results), null, 2) }] };
}
const server = new Server({ name: 'qdrant-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case 'store_memory': return await handleStoreMemory(args ?? {});
            case 'search_memory': return await handleSearchMemory(args ?? {});
            case 'list_collections': return await handleListCollections();
            case 'get_collection_info': return await handleGetCollectionInfo(args ?? {});
            case 'delete_memory': return await handleDeleteMemory(args ?? {});
            case 'list_memories': return await handleListMemories(args ?? {});
            case 'update_memory': return await handleUpdateMemory(args ?? {});
            case 'hybrid_search': return await handleHybridSearch(args ?? {});
            default: throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
    }
    catch (error) {
        if (error instanceof McpError)
            throw error;
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
});
(async () => {
    try {
        console.error('Loading embedding model...');
        const start = Date.now();
        const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL);
        embed = async (text) => {
            const result = await extractor(text, { pooling: 'cls' });
            return Array.from(result.data);
        };
        const warmup = await embed('warmup');
        console.error(`Embedding model ready (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('Embedding model warmup:', message);
        embed = async (_text) => {
            throw new Error('Embedding model failed to load');
        };
    }
})();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Qdrant MCP server running on stdio');
//# sourceMappingURL=server.js.map