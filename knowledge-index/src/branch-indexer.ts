import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { QdrantClient, buildFilter } from './qdrant-client.js';
import type { IndexResult, BranchSummary } from './types.js';

function runGit(repoPath: string, args: string[]): string {
  const cmd = `git -C ${JSON.stringify(repoPath)} ${args.join(' ')}`;
  return execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim();
}

function extractRepoName(repoPath: string): string {
  const repo = repoPath.replace(/\/+$/, '');
  const name = repo.split('/').pop() ?? repo;
  return name.replace(/\.git$/, '');
}

function extractTags(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'shall', 'can',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above',
    'below', 'between', 'out', 'off', 'over', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where',
    'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'because',
    'and', 'but', 'or', 'if', 'while', 'that', 'this', 'these',
    'those', 'it', 'its', 'add', 'update', 'fix', 'change', 'remove',
  ]);
  const words = text.toLowerCase().split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const freq = new Map<string, number>();
  for (const word of words) {
    if (word.length > 2 && !stopWords.has(word)) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
}

interface FileChange {
  filePath: string;
  changeType: 'added' | 'modified' | 'deleted';
  diff: string;
}

function parseDiffStat(statOutput: string): { filePath: string; changeType: 'added' | 'modified' | 'deleted' }[] {
  const files: { filePath: string; changeType: 'added' | 'modified' | 'deleted' }[] = [];
  for (const line of statOutput.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(' ') && trimmed.includes('|')) {
      const parts = trimmed.split('|');
      const path = parts[0]?.trim() ?? '';
      if (path) files.push({ filePath: path, changeType: 'modified' });
    } else if (trimmed.startsWith('create mode')) {
      const path = trimmed.split(/\s+/).pop() ?? '';
      if (path) files.push({ filePath: path, changeType: 'added' });
    } else if (trimmed.startsWith('delete mode')) {
      const path = trimmed.split(/\s+/).pop() ?? '';
      if (path) files.push({ filePath: path, changeType: 'deleted' });
    }
  }
  return files;
}

function summarizeDiff(filePath: string, diff: string, changeType: string): string {
  if (!diff || diff.trim().length === 0) {
    return `${filePath}: ${changeType}`;
  }
  const lines = diff.split('\n');
  const added = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
  const removed = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
  const parts: string[] = [];
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const content = line.slice(1).trim();
      if (content.length > 3 && !content.startsWith('import') && !content.startsWith('//') && !content.startsWith('/*') && !content.startsWith('*')) {
        parts.push(content);
      }
    }
  }
  const sample = parts.slice(0, 5).join('; ');
  let summary = `${filePath}: ${changeType}`;
  if (added > 0 || removed > 0) {
    summary += ` (+${added}/-${removed} lines)`;
  }
  if (sample) {
    summary += `. Changes: ${sample}`;
  }
  if (summary.length > 500) {
    summary = summary.slice(0, 497) + '...';
  }
  return summary;
}

function getOverallSummary(commits: { hash: string; author: string; message: string }[], filesChanged: number): string {
  const messages = commits.map((c) => c.message).filter(Boolean);
  return `Branch has ${commits.length} commit(s) affecting ${filesChanged} file(s). Messages: ${messages.join('; ')}`.slice(0, 1000);
}

export class BranchIndexer {
  private qdrant: QdrantClient;
  private embedFn: (text: string) => Promise<number[]>;

  constructor(qdrantUrl: string, embedFn: (text: string) => Promise<number[]>) {
    this.qdrant = new QdrantClient(qdrantUrl);
    this.embedFn = embedFn;
  }

  async indexBranch(repoPath: string, branch: string): Promise<IndexResult> {
    const result: IndexResult = { indexed: 0, errors: 0, details: [] };
    try {
      const repoName = extractRepoName(repoPath);
      const commits = this.getCommits(repoPath, branch);
      if (commits.length === 0) {
        result.details.push(`No new commits on ${branch} vs main`);
        return result;
      }
      const latestCommit = commits[0]?.hash ?? '';
      const author = commits[0]?.author ?? '';
      const commitMessage = commits[0]?.message ?? '';
      const statOutput = runGit(repoPath, ['diff', `main..${branch}`, '--stat']);
      const fileChanges = parseDiffStat(statOutput);
      for (const fc of fileChanges) {
        try {
          const diff = runGit(repoPath, ['diff', `main..${branch}`, '--', fc.filePath]);
          const diffSummary = summarizeDiff(fc.filePath, diff, fc.changeType);
          const vector = await this.embedFn(diffSummary);
          await this.qdrant.upsertPoints([{
            id: randomUUID(),
            vector,
            payload: {
              domain: 'code',
              source: repoName,
              path: fc.filePath,
              title: `${branch} → ${fc.filePath}`,
              content: diffSummary,
              meta: {
                branch,
                commit: latestCommit,
                author,
                change_type: fc.changeType,
                files_changed: fileChanges.length,
                tags: extractTags(diffSummary),
                indexed_at: new Date().toISOString(),
              },
            },
          }]);
          result.indexed++;
        } catch (e) {
          result.errors++;
          result.details.push(`Error indexing ${fc.filePath}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      const overallSummary = getOverallSummary(commits, fileChanges.length);
      const summaryVector = await this.embedFn(overallSummary);
      await this.qdrant.upsertPoints([{
        id: randomUUID(),
        vector: summaryVector,
        payload: {
          domain: 'code',
          source: repoName,
          path: branch,
          title: `Branch: ${branch}`,
          content: overallSummary,
          meta: {
            branch,
            commit: latestCommit,
            author,
            change_type: 'summary',
            files_changed: fileChanges.length,
            tags: extractTags(overallSummary),
            indexed_at: new Date().toISOString(),
          },
        },
      }]);
      result.indexed++;
    } catch (e) {
      result.errors++;
      result.details.push(`Error indexing branch ${branch}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return result;
  }

  async indexBranchIncremental(repoPath: string, branch: string): Promise<IndexResult> {
    const result: IndexResult = { indexed: 0, errors: 0, details: [] };
    try {
      const repoName = extractRepoName(repoPath);
      const filter = buildFilter({ domain: 'code', source: repoName, branch });
      const scrollResult = await this.qdrant.scroll(filter, 1);
      const existingSummary = scrollResult.points.find(
        (p) => (p.payload as Record<string, unknown>)?.meta && (p.payload as Record<string, unknown>).meta !== null,
      );
      const lastIndexedCommit = existingSummary
        ? ((existingSummary.payload as Record<string, unknown>).meta as Record<string, unknown>)?.commit as string | undefined
        : undefined;
      let commits: { hash: string; author: string; message: string }[];
      if (lastIndexedCommit) {
        try {
          const log = runGit(repoPath, ['log', `${lastIndexedCommit}..${branch}`, '--format=%H|%an|%s']);
          commits = log ? log.split('\n').filter(Boolean).map((l) => {
            const [hash, author, ...rest] = l.split('|');
            return { hash: hash ?? '', author: author ?? '', message: rest.join('|') };
          }) : [];
        } catch {
          commits = [];
        }
      } else {
        commits = this.getCommits(repoPath, branch);
      }
      if (commits.length === 0) {
        result.details.push('No new commits since last index');
        return result;
      }
      const latestCommit = commits[0]?.hash ?? '';
      const author = commits[0]?.author ?? '';
      const statOutput = runGit(repoPath, ['diff', `main..${branch}`, '--stat']);
      const fileChanges = parseDiffStat(statOutput);
      for (const fc of fileChanges) {
        try {
          const diff = runGit(repoPath, ['diff', `main..${branch}`, '--', fc.filePath]);
          const diffSummary = summarizeDiff(fc.filePath, diff, fc.changeType);
          const vector = await this.embedFn(diffSummary);
          await this.qdrant.upsertPoints([{
            id: randomUUID(),
            vector,
            payload: {
              domain: 'code',
              source: repoName,
              path: fc.filePath,
              title: `${branch} → ${fc.filePath}`,
              content: diffSummary,
              meta: {
                branch,
                commit: latestCommit,
                author,
                change_type: fc.changeType,
                files_changed: fileChanges.length,
                tags: extractTags(diffSummary),
                indexed_at: new Date().toISOString(),
              },
            },
          }]);
          result.indexed++;
        } catch (e) {
          result.errors++;
          result.details.push(`Error indexing ${fc.filePath}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      const overallSummary = getOverallSummary(commits, fileChanges.length);
      const summaryVector = await this.embedFn(overallSummary);
      await this.qdrant.upsertPoints([{
        id: randomUUID(),
        vector: summaryVector,
        payload: {
          domain: 'code',
          source: repoName,
          path: branch,
          title: `Branch: ${branch}`,
          content: overallSummary,
          meta: {
            branch,
            commit: latestCommit,
            author,
            change_type: 'summary',
            files_changed: fileChanges.length,
            tags: extractTags(overallSummary),
            indexed_at: new Date().toISOString(),
          },
        },
      }]);
      result.indexed++;
    } catch (e) {
      result.errors++;
      result.details.push(`Error in incremental index for ${branch}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return result;
  }

  async getBranchSummary(source: string, branch: string): Promise<BranchSummary | null> {
    const filter = buildFilter({ domain: 'code', source, branch });
    const scrollResult = await this.qdrant.scroll(filter, 50);
    const points = scrollResult.points;
    if (points.length === 0) return null;
    const summaryPoint = points.find((p) => {
      const meta = (p.payload as Record<string, unknown>)?.meta as Record<string, unknown> | undefined;
      return meta?.change_type === 'summary';
    }) ?? points[0];
    const payload = summaryPoint.payload as Record<string, unknown>;
    const meta = payload.meta as Record<string, unknown>;
    return {
      branch: (meta?.branch as string) ?? branch,
      source: (payload.source as string) ?? source,
      lastCommit: (meta?.commit as string) ?? '',
      author: (meta?.author as string) ?? '',
      commitMessage: (payload.content as string) ?? '',
      filesChanged: (meta?.files_changed as number) ?? 0,
      summary: (payload.content as string) ?? '',
      tags: (meta?.tags as string[]) ?? [],
    };
  }

  private getCommits(repoPath: string, branch: string): { hash: string; author: string; message: string }[] {
    const log = runGit(repoPath, ['log', `main..${branch}`, '--format=%H|%an|%s']);
    if (!log) return [];
    return log.split('\n').filter(Boolean).map((line) => {
      const [hash, author, ...rest] = line.split('|');
      return { hash: hash ?? '', author: author ?? '', message: rest.join('|') };
    });
  }
}
