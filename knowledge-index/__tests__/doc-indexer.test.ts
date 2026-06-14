import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocIndexer } from '../src/doc-indexer.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { readFileSync } from 'node:fs';

describe('DocIndexer', () => {
  let indexer: DocIndexer;
  let mockEmbed: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbed = vi.fn().mockResolvedValue(new Array(384).fill(0.1));
    indexer = new DocIndexer('http://127.0.0.1:6333', mockEmbed);
  });

  describe('indexDoc', () => {
    it('should index a .feature file with hu doc_type', async () => {
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('Feature: Login\n  Scenario: User logs in');
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { exists: true } }) })
        .mockResolvedValueOnce({ ok: true });
      const result = await indexer.indexDoc('/tmp/features/hu-01c.feature', 'project-doc');
      expect(result.indexed).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('should index an ADR file', async () => {
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('# ADR-001\nUse TypeScript\n\nWe will use TypeScript for the project.');
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { exists: true } }) })
        .mockResolvedValueOnce({ ok: true });
      const result = await indexer.indexDoc('/tmp/docs/adrs/adr-001.md', 'infra-doc');
      expect(result.indexed).toBe(1);
    });

    it('should handle file read errors', async () => {
      (readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      });
      const result = await indexer.indexDoc('/tmp/nonexistent.md', 'project-doc');
      expect(result.errors).toBe(1);
    });
  });
});
