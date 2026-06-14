import { randomUUID } from 'node:crypto';

const COLLECTION = 'knowledge-base';
const VECTOR_SIZE = 384;

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

interface QdrantSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

interface QdrantFilter {
  should?: Record<string, unknown>[];
  must?: Record<string, unknown>[];
}

export class QdrantClient {
  private url: string;

  constructor(url: string) {
    this.url = url.replace(/\/+$/, '');
  }

  async ensureCollection(): Promise<void> {
    const existsResp = await fetch(`${this.url}/collections/${COLLECTION}/exists`, { method: 'GET' });
    if (existsResp.ok) {
      const data = (await existsResp.json()) as { result?: { exists?: boolean } };
      if (data.result?.exists) return;
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

  async upsertPoints(points: QdrantPoint[]): Promise<void> {
    if (points.length === 0) return;
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

  async searchWithFilter(
    vector: number[],
    filter?: QdrantFilter,
    limit: number = 10,
  ): Promise<QdrantSearchResult[]> {
    await this.ensureCollection();
    const body: Record<string, unknown> = {
      vector,
      limit,
      with_payload: true,
    };
    if (filter) body.filter = filter;
    const resp = await fetch(`${this.url}/collections/${COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Search failed: ${resp.status} ${text}`);
    }
    const data = (await resp.json()) as { result: QdrantSearchResult[] };
    return data.result;
  }

  async scroll(
    filter?: QdrantFilter,
    limit: number = 20,
    offset?: string,
  ): Promise<{ points: QdrantSearchResult[]; nextPageOffset: string | null }> {
    await this.ensureCollection();
    const body: Record<string, unknown> = {
      limit,
      with_payload: true,
      with_vector: false,
    };
    if (filter) body.filter = filter;
    if (offset) body.offset = offset;
    const resp = await fetch(`${this.url}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Scroll failed: ${resp.status} ${text}`);
    }
    const data = (await resp.json()) as { result: { points: QdrantSearchResult[]; next_page_offset?: string | null } };
    return {
      points: data.result.points,
      nextPageOffset: data.result.next_page_offset ?? null,
    };
  }

  async deletePoints(filter: QdrantFilter): Promise<void> {
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

  async countPoints(filter?: QdrantFilter): Promise<number> {
    await this.ensureCollection();
    const body: Record<string, unknown> = { exact: true };
    if (filter) body.filter = filter;
    const resp = await fetch(`${this.url}/collections/${COLLECTION}/points/count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Count failed: ${resp.status} ${text}`);
    }
    const data = (await resp.json()) as { result: { count: number } };
    return data.result.count;
  }

  async createPayloadIndex(field: string, schema: string = 'keyword'): Promise<void> {
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

export function buildFilter(opts: {
  domain?: string;
  source?: string;
  branch?: string;
  docType?: string;
  tags?: string[];
}): QdrantFilter | undefined {
  const must: Record<string, unknown>[] = [];
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
