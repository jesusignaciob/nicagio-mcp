import { QdrantClient, buildFilter } from './qdrant-client.js';
import type { SearchOptions, KnowledgeResult, IndexResult } from './types.js';

export class KnowledgeSearch {
  private qdrant: QdrantClient;
  private embedFn: (text: string) => Promise<number[]>;

  constructor(qdrantUrl: string, embedFn: (text: string) => Promise<number[]>) {
    this.qdrant = new QdrantClient(qdrantUrl);
    this.embedFn = embedFn;
  }

  async search(query: string, options?: SearchOptions): Promise<KnowledgeResult[]> {
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
      domain: (r.payload.domain as string) ?? '',
      source: (r.payload.source as string) ?? '',
      path: (r.payload.path as string) ?? '',
      title: (r.payload.title as string) ?? '',
      content: (r.payload.content as string) ?? '',
      score: r.score,
      meta: (r.payload.meta as Record<string, unknown>) ?? {},
    }));
  }

  async list(options?: SearchOptions & { offset?: string }): Promise<{ points: KnowledgeResult[]; nextOffset: string | null }> {
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
      domain: (r.payload.domain as string) ?? '',
      source: (r.payload.source as string) ?? '',
      path: (r.payload.path as string) ?? '',
      title: (r.payload.title as string) ?? '',
      content: (r.payload.content as string) ?? '',
      score: 0,
      meta: (r.payload.meta as Record<string, unknown>) ?? {},
    }));
    return { points, nextOffset: result.nextPageOffset };
  }

  async reindex(domain: string, source?: string): Promise<IndexResult> {
    const result: IndexResult = { indexed: 0, errors: 0, details: [] };
    try {
      const filter: { must: Record<string, unknown>[] } = { must: [{ key: 'domain', match: { value: domain } }] };
      if (source) {
        filter.must.push({ key: 'source', match: { value: source } });
      }
      await this.qdrant.deletePoints(filter);
      result.details.push(`Deleted existing points for domain=${domain}${source ? `, source=${source}` : ''}`);
    } catch (e) {
      result.errors++;
      result.details.push(`Error deleting points: ${e instanceof Error ? e.message : String(e)}`);
    }
    return result;
  }
}
