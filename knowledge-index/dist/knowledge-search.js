import { QdrantClient, buildFilter } from './qdrant-client.js';
export class KnowledgeSearch {
    qdrant;
    embedFn;
    constructor(qdrantUrl, embedFn) {
        this.qdrant = new QdrantClient(qdrantUrl);
        this.embedFn = embedFn;
    }
    async search(query, options) {
        const vector = await this.embedFn(query);
        const filter = buildFilter({
            domain: options?.domain,
            source: options?.source,
            branch: options?.branch,
            docType: options?.docType,
            tags: options?.tags,
        });
        const limit = options?.limit ?? 10;
        const results = await this.qdrant.searchWithFilter(vector, filter, limit);
        return results.map((r) => ({
            id: r.id,
            domain: r.payload.domain ?? '',
            source: r.payload.source ?? '',
            path: r.payload.path ?? '',
            title: r.payload.title ?? '',
            content: r.payload.content ?? '',
            score: r.score,
            meta: r.payload.meta ?? {},
        }));
    }
    async list(options) {
        const filter = buildFilter({
            domain: options?.domain,
            source: options?.source,
            branch: options?.branch,
            docType: options?.docType,
            tags: options?.tags,
        });
        const limit = options?.limit ?? 20;
        const result = await this.qdrant.scroll(filter, limit, options?.offset);
        const points = result.points.map((r) => ({
            id: r.id,
            domain: r.payload.domain ?? '',
            source: r.payload.source ?? '',
            path: r.payload.path ?? '',
            title: r.payload.title ?? '',
            content: r.payload.content ?? '',
            score: 0,
            meta: r.payload.meta ?? {},
        }));
        return { points, nextOffset: result.nextPageOffset };
    }
    async reindex(domain, source) {
        const result = { indexed: 0, errors: 0, details: [] };
        try {
            const filter = { must: [{ key: 'domain', match: { value: domain } }] };
            if (source) {
                filter.must.push({ key: 'source', match: { value: source } });
            }
            await this.qdrant.deletePoints(filter);
            result.details.push(`Deleted existing points for domain=${domain}${source ? `, source=${source}` : ''}`);
        }
        catch (e) {
            result.errors++;
            result.details.push(`Error deleting points: ${e instanceof Error ? e.message : String(e)}`);
        }
        return result;
    }
}
