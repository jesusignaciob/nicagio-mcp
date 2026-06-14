const COLLECTION = 'knowledge-base';
const VECTOR_SIZE = 384;
export class QdrantClient {
    url;
    constructor(url) {
        this.url = url.replace(/\/+$/, '');
    }
    async ensureCollection() {
        const existsResp = await fetch(`${this.url}/collections/${COLLECTION}/exists`, { method: 'GET' });
        if (existsResp.ok) {
            const data = (await existsResp.json());
            if (data.result?.exists)
                return;
        }
        const createResp = await fetch(`${this.url}/collections/${COLLECTION}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
            }),
        });
        if (!createResp.ok && createResp.status !== 409) {
            throw new Error(`Failed to create collection: ${createResp.statusText}`);
        }
    }
    async upsertPoints(points) {
        if (points.length === 0)
            return;
        await this.ensureCollection();
        const resp = await fetch(`${this.url}/collections/${COLLECTION}/points`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points, wait: true }),
        });
        if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`Upsert failed: ${resp.status} ${body}`);
        }
    }
    async searchWithFilter(vector, filter, limit = 10) {
        await this.ensureCollection();
        const body = {
            vector,
            limit,
            with_payload: true,
        };
        if (filter)
            body.filter = filter;
        const resp = await fetch(`${this.url}/collections/${COLLECTION}/points/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Search failed: ${resp.status} ${text}`);
        }
        const data = (await resp.json());
        return data.result;
    }
    async scroll(filter, limit = 20, offset) {
        await this.ensureCollection();
        const body = {
            limit,
            with_payload: true,
            with_vector: false,
        };
        if (filter)
            body.filter = filter;
        if (offset)
            body.offset = offset;
        const resp = await fetch(`${this.url}/collections/${COLLECTION}/points/scroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Scroll failed: ${resp.status} ${text}`);
        }
        const data = (await resp.json());
        return {
            points: data.result.points,
            nextPageOffset: data.result.next_page_offset ?? null,
        };
    }
    async deletePoints(filter) {
        await this.ensureCollection();
        const resp = await fetch(`${this.url}/collections/${COLLECTION}/points/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filter, wait: true }),
        });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Delete failed: ${resp.status} ${text}`);
        }
    }
    async countPoints(filter) {
        await this.ensureCollection();
        const body = { exact: true };
        if (filter)
            body.filter = filter;
        const resp = await fetch(`${this.url}/collections/${COLLECTION}/points/count`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Count failed: ${resp.status} ${text}`);
        }
        const data = (await resp.json());
        return data.result.count;
    }
    async createPayloadIndex(field, schema = 'keyword') {
        await this.ensureCollection();
        const resp = await fetch(`${this.url}/collections/${COLLECTION}/index`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ field_name: field, field_schema: schema, wait: true }),
        });
        if (!resp.ok && resp.status !== 409) {
            const text = await resp.text();
            throw new Error(`Create payload index failed: ${resp.status} ${text}`);
        }
    }
}
export function buildFilter(opts) {
    const must = [];
    if (opts.domain) {
        must.push({ key: 'domain', match: { value: opts.domain } });
    }
    if (opts.source) {
        must.push({ key: 'source', match: { value: opts.source } });
    }
    if (opts.branch) {
        must.push({ key: 'meta.branch', match: { value: opts.branch } });
    }
    if (opts.docType) {
        must.push({ key: 'meta.doc_type', match: { value: opts.docType } });
    }
    if (opts.tags && opts.tags.length > 0) {
        for (const tag of opts.tags) {
            must.push({ key: 'meta.tags', match: { value: tag } });
        }
    }
    return must.length > 0 ? { must } : undefined;
}
