import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BranchIndexer } from '../src/branch-indexer.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { execSync } from 'node:child_process';

describe('BranchIndexer', () => {
  let indexer: BranchIndexer;
  let mockEmbed: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbed = vi.fn().mockResolvedValue(new Array(384).fill(0.1));
    indexer = new BranchIndexer('http://127.0.0.1:6333', mockEmbed);
  });

  describe('indexBranch', () => {
    it('should handle no commits vs main', async () => {
      (execSync as ReturnType<typeof vi.fn>).mockReturnValue('');
      const result = await indexer.indexBranch('/tmp/repo', 'feature-x');
      expect(result.indexed).toBe(0);
      expect(result.details).toContain('No new commits on feature-x vs main');
    });

    it('should parse commits and index file diffs', async () => {
      (execSync as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
        if (cmd.includes('--format=%H|%an|%s')) {
          return 'abc123|John|Add new feature\n';
        }
        if (cmd.includes('--stat')) {
          return ' src/file.ts | 10 ++++++++++\n';
        }
        if (cmd.includes('diff')) {
          return 'diff --git a/src/file.ts b/src/file.ts\n+const x = 1;\n';
        }
        return '';
      });
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { exists: true } }) })
        .mockResolvedValueOnce({ ok: true });
      const result = await indexer.indexBranch('/tmp/repo', 'feature-x');
      expect(result.indexed).toBeGreaterThan(0);
      expect(result.errors).toBe(0);
    });

    it('should handle git errors gracefully', async () => {
      (execSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('fatal: not a git repository');
      });
      const result = await indexer.indexBranch('/tmp/repo', 'feature-x');
      expect(result.errors).toBeGreaterThan(0);
    });
  });

  describe('getBranchSummary', () => {
    it('should return null when no points found', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { exists: true } }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            result: { points: [], next_page_offset: null },
          }),
        });
      const summary = await indexer.getBranchSummary('repo', 'feature-x');
      expect(summary).toBeNull();
    });
  });
});
