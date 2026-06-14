import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeSearch } from '../src/knowledge-search.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('KnowledgeSearch', () => {
  let search: KnowledgeSearch;
  let mockEmbed: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbed = vi.fn().mockResolvedValue(new Array(384).fill(0.1));
    search = new KnowledgeSearch('http://127.0.0.1:6333', mockEmbed);
  });

  describe('search', () => {
    it('should return results from semantic search', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { exists: true } }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            result: [
              { id: '1', score: 0.95, payload: { domain: 'code', source: 'repo', path: 'src/index.ts', title: 'Branch: feat-x', content: 'summary', meta: { branch: 'feat-x' } } },
            ],
          }),
        });
      const results = await search.search('test query', { domain: 'code' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
      expect(results[0].domain).toBe('code');
      expect(results[0].score).toBe(0.95);
    });

    it('should pass filter options to search', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { exists: true } }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: [] }) });
      await search.search('query', { domain: 'code', source: 'repo', branch: 'feat-x', tags: ['test'] });
      const searchBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(searchBody.filter).toBeDefined();
    });
  });

  describe('list', () => {
    it('should return paginated results', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { exists: true } }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            result: {
              points: [{ id: '1', payload: { domain: 'code', source: 'repo', path: 'x', title: 't', content: 'c', meta: {} } }],
              next_page_offset: null,
            },
          }),
        });
      const result = await search.list({ domain: 'code', limit: 10 });
      expect(result.points).toHaveLength(1);
      expect(result.nextOffset).toBeNull();
    });
  });

  describe('reindex', () => {
    it('should delete points by domain', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { exists: true } }) })
        .mockResolvedValueOnce({ ok: true });
      const result = await search.reindex('code');
      expect(result.errors).toBe(0);
    });
  });
});
