#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import { randomUUID } from 'node:crypto';
import { pipeline } from '@huggingface/transformers';
import { BranchIndexer, DocIndexer, KnowledgeSearch } from '@nicagio/knowledge-index';
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
    {
        name: 'count_memories',
        description: 'Count points matching a filter (faster than search — no vector computation)',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: `Collection name (default: ${DEFAULT_COLLECTION})` },
                tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
                from: { type: 'string', description: "Filter by 'from' field in metadata" },
                to: { type: 'string', description: "Filter by 'to' field in metadata" },
                priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Filter by priority' },
                since: { type: 'string', description: 'ISO date — filter by timestamp >= this' },
            },
        },
    },
    {
        name: 'delete_by_filter',
        description: 'Delete multiple points matching a filter (mass delete, not one-by-one)',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: `Collection name (default: ${DEFAULT_COLLECTION})` },
                tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
                from: { type: 'string', description: "Filter by 'from' field in metadata" },
                to: { type: 'string', description: "Filter by 'to' field in metadata" },
                priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Filter by priority' },
                before: { type: 'string', description: 'ISO date — delete points with created_at < this' },
            },
        },
    },
    {
        name: 'create_payload_index',
        description: 'Create an index on a payload field for faster filtering',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: `Collection name (default: ${DEFAULT_COLLECTION})` },
                field_name: { type: 'string', description: 'The payload field to index' },
                field_schema: { type: 'string', enum: ['keyword', 'integer', 'float', 'bool', 'text'], description: 'Payload field schema type (default: keyword)' },
            },
            required: ['field_name'],
        },
    },
    {
        name: 'snapshot_create',
        description: 'Create a backup snapshot of a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: `Collection name (default: ${DEFAULT_COLLECTION})` },
            },
        },
    },
    {
        name: 'snapshot_list',
        description: 'List available snapshots for a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: `Collection name (default: ${DEFAULT_COLLECTION})` },
            },
        },
    },
    {
        name: 'index_branch',
        description: 'Index a git branch into the knowledge base (diffs, summaries)',
        inputSchema: {
            type: 'object',
            properties: {
                repo_path: { type: 'string', description: 'Absolute path to the git repository' },
                branch: { type: 'string', description: 'Branch name to index' },
                incremental: { type: 'boolean', description: 'Only index new commits since last index (default: false)' },
            },
            required: ['repo_path', 'branch'],
        },
    },
    {
        name: 'search_knowledge',
        description: 'Semantic search across all knowledge base domains (code, infra-doc, project-doc)',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
                domain: { type: 'string', description: 'Filter by domain: code, infra-doc, or project-doc' },
                source: { type: 'string', description: 'Filter by source (repo name or infrastructure/project)' },
                branch: { type: 'string', description: 'Filter by git branch name' },
                doc_type: { type: 'string', description: 'Filter by doc type: hu, adr, dockerfile, guide, etc.' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
                limit: { type: 'number', description: 'Number of results (default: 10)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_branch_summary',
        description: 'Get the summary of an already-indexed git branch',
        inputSchema: {
            type: 'object',
            properties: {
                repo: { type: 'string', description: 'Repository name (e.g., nicagio-mcp)' },
                branch: { type: 'string', description: 'Branch name' },
            },
            required: ['repo', 'branch'],
        },
    },
    {
        name: 'index_doc',
        description: 'Index a documentation file into the knowledge base',
        inputSchema: {
            type: 'object',
            properties: {
                file_path: { type: 'string', description: 'Absolute path to the documentation file' },
                domain: { type: 'string', enum: ['infra-doc', 'project-doc'], description: 'Documentation domain' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
            },
            required: ['file_path', 'domain'],
        },
    },
    {
        name: 'list_knowledge',
        description: 'List knowledge base entries with filters (payload browsing, not semantic search)',
        inputSchema: {
            type: 'object',
            properties: {
                domain: { type: 'string', description: 'Filter by domain: code, infra-doc, or project-doc' },
                source: { type: 'string', description: 'Filter by source' },
                branch: { type: 'string', description: 'Filter by git branch' },
                doc_type: { type: 'string', description: 'Filter by doc type' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
                limit: { type: 'number', description: 'Number of results (default: 20)' },
            },
        },
    },
    {
        name: 'reindex',
        description: 'Delete all points in a domain (optionally filtered by source) so they can be re-indexed',
        inputSchema: {
            type: 'object',
            properties: {
                domain: { type: 'string', description: 'Domain to reindex: code, infra-doc, or project-doc' },
                source: { type: 'string', description: 'Optional source filter (repo name or doc source)' },
            },
            required: ['domain'],
        },
    },
    {
        name: 'snapshot_delete',
        description: 'Delete a specific snapshot',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: `Collection name (default: ${DEFAULT_COLLECTION})` },
                snapshot_name: { type: 'string', description: 'Name of the snapshot to delete' },
            },
            required: ['snapshot_name'],
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
function buildFilter(args) {
    const must = [];
    if (args.tags) {
        const tags = Array.isArray(args.tags) ? args.tags : [String(args.tags)];
        for (const tag of tags) {
            must.push({ key: 'tags', match: { value: tag } });
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
    if (args.before) {
        const beforeMs = new Date(args.before).getTime();
        if (!isNaN(beforeMs)) {
            must.push({ key: 'created_at', range: { lt: beforeMs } });
        }
    }
    return must.length > 0 ? { must } : undefined;
}
async function handleCountMemories(args) {
    const collection = args.collection ?? DEFAULT_COLLECTION;
    await ensureCollection(collection);
    const filter = buildFilter(args);
    const result = await client.count(collection, { filter, exact: true });
    return { content: [{ type: 'text', text: JSON.stringify({ count: result.count }) }] };
}
async function handleDeleteByFilter(args) {
    const collection = args.collection ?? DEFAULT_COLLECTION;
    const filter = buildFilter(args);
    if (!filter) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'At least one filter condition is required for mass delete' }) }], isError: true };
    }
    await client.delete(collection, { wait: true, filter });
    return { content: [{ type: 'text', text: JSON.stringify({ deleted: true, status: 'pending' }) }] };
}
async function handleCreatePayloadIndex(args) {
    const collection = args.collection ?? DEFAULT_COLLECTION;
    await ensureCollection(collection);
    const field_name = args.field_name;
    const field_schema = args.field_schema ?? 'keyword';
    await client.createPayloadIndex(collection, { field_name, field_schema: field_schema, wait: true });
    return { content: [{ type: 'text', text: JSON.stringify({ status: 'ok', field: field_name, schema: field_schema }) }] };
}
async function handleSnapshotCreate(args) {
    const collection = args.collection ?? DEFAULT_COLLECTION;
    await ensureCollection(collection);
    const snapshot = await client.createSnapshot(collection, { wait: true });
    return { content: [{ type: 'text', text: JSON.stringify({ snapshot_name: snapshot?.name ?? '', created_at: snapshot?.creation_time ?? '' }) }] };
}
async function handleSnapshotList(args) {
    const collection = args.collection ?? DEFAULT_COLLECTION;
    await ensureCollection(collection);
    const snapshots = await client.listSnapshots(collection);
    const formatted = snapshots.map((s) => ({
        name: s.name,
        created_at: s.creation_time ?? '',
        size: s.size,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(formatted) }] };
}
async function handleSnapshotDelete(args) {
    const collection = args.collection ?? DEFAULT_COLLECTION;
    const snapshot_name = args.snapshot_name;
    const result = await client.deleteSnapshot(collection, snapshot_name, { wait: true });
    return { content: [{ type: 'text', text: JSON.stringify({ deleted: result }) }] };
}
async function handleIndexBranch(args) {
    const branchIndexer = globalThis.__branchIndexer;
    const repoPath = args.repo_path;
    const branch = args.branch;
    const incremental = args.incremental ?? false;
    const result = incremental
        ? await branchIndexer.indexBranchIncremental(repoPath, branch)
        : await branchIndexer.indexBranch(repoPath, branch);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
async function handleSearchKnowledge(args) {
    const knowledgeSearch = globalThis.__knowledgeSearch;
    const query = args.query;
    const options = {
        domain: args.domain,
        source: args.source,
        branch: args.branch,
        docType: args.doc_type,
        tags: args.tags,
        limit: args.limit ?? 10,
    };
    const results = await knowledgeSearch.search(query, options);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
}
async function handleGetBranchSummary(args) {
    const branchIndexer = globalThis.__branchIndexer;
    const repo = args.repo;
    const branch = args.branch;
    const summary = await branchIndexer.getBranchSummary(repo, branch);
    if (!summary) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Branch summary not found. Index the branch first.' }) }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}
async function handleIndexDoc(args) {
    const docIndexer = globalThis.__docIndexer;
    const filePath = args.file_path;
    const domain = args.domain;
    const tags = args.tags;
    const result = await docIndexer.indexDoc(filePath, domain, tags);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
async function handleListKnowledge(args) {
    const knowledgeSearch = globalThis.__knowledgeSearch;
    const options = {
        domain: args.domain,
        source: args.source,
        branch: args.branch,
        docType: args.doc_type,
        tags: args.tags,
        limit: args.limit ?? 20,
    };
    const result = await knowledgeSearch.list(options);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
async function handleReindex(args) {
    const knowledgeSearch = globalThis.__knowledgeSearch;
    const domain = args.domain;
    const source = args.source;
    const result = await knowledgeSearch.reindex(domain, source);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
            case 'count_memories': return await handleCountMemories(args ?? {});
            case 'delete_by_filter': return await handleDeleteByFilter(args ?? {});
            case 'create_payload_index': return await handleCreatePayloadIndex(args ?? {});
            case 'snapshot_create': return await handleSnapshotCreate(args ?? {});
            case 'snapshot_list': return await handleSnapshotList(args ?? {});
            case 'snapshot_delete': return await handleSnapshotDelete(args ?? {});
            case 'index_branch': return await handleIndexBranch(args ?? {});
            case 'search_knowledge': return await handleSearchKnowledge(args ?? {});
            case 'get_branch_summary': return await handleGetBranchSummary(args ?? {});
            case 'index_doc': return await handleIndexDoc(args ?? {});
            case 'list_knowledge': return await handleListKnowledge(args ?? {});
            case 'reindex': return await handleReindex(args ?? {});
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
        const branchIndexer = new BranchIndexer(QDRANT_URL, embed);
        const docIndexer = new DocIndexer(QDRANT_URL, embed);
        const knowledgeSearch = new KnowledgeSearch(QDRANT_URL, embed);
        globalThis.__branchIndexer = branchIndexer;
        globalThis.__docIndexer = docIndexer;
        globalThis.__knowledgeSearch = knowledgeSearch;
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