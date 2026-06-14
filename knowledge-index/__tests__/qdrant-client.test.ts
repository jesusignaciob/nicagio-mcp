import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildFilter } from '../src/qdrant-client.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('buildFilter', () => {
  it('should return undefined with no options', () => {
    expect(buildFilter({})).toBeUndefined();
  });

  it('should build filter with domain', () => {
    const filter = buildFilter({ domain: 'code' });
    expect(filter).toEqual({ must: [{ key: 'domain', match: { value: 'code' } }] });
  });

  it('should build filter with multiple options', () => {
    const filter = buildFilter({ domain: 'code', source: 'repo', tags: ['test'] });
    expect(filter?.must).toHaveLength(3);
  });
});

describe('QdrantClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle ensureCollection - create if not exists', async () => {
    const { QdrantClient } = await import('../src/qdrant-client.js');
    const client = new QdrantClient('http://127.0.0.1:6333');
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { exists: false } }) })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    await client.ensureCollection();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should skip creation if collection exists', async () => {
    const { QdrantClient } = await import('../src/qdrant-client.js');
    const client = new QdrantClient('http://127.0.0.1:6333');
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ result: { exists: true } }) });
    await client.ensureCollection();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should handle 409 conflict gracefully', async () => {
    const { QdrantClient } = await import('../src/qdrant-client.js');
    const client = new QdrantClient('http://127.0.0.1:6333');
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { exists: false } }) })
      .mockResolvedValueOnce({ ok: false, status: 409, statusText: 'Conflict' });
    await expect(client.ensureCollection()).resolves.toBeUndefined();
  });

  it('should skip empty upsert', async () => {
    const { QdrantClient } = await import('../src/qdrant-client.js');
    const client = new QdrantClient('http://127.0.0.1:6333');
    await client.upsertPoints([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should upsert points', async () => {
    const { QdrantClient } = await import('../src/qdrant-client.js');
    const client = new QdrantClient('http://127.0.0.1:6333');
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { exists: true } }) })
      .mockResolvedValueOnce({ ok: true });
    await client.upsertPoints([{ id: '1', vector: new Array(384).fill(0.1), payload: { domain: 'code' } }]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
