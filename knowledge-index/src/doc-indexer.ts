import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { QdrantClient } from './qdrant-client.js';
import type { IndexResult } from './types.js';

type DocDomain = 'infra-doc' | 'project-doc';

function inferDocType(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.endsWith('.feature')) return 'hu';
  if (normalized.includes('/adrs/') || normalized.includes('/adr/')) return 'adr';
  if (normalized.includes('/design/') || normalized.includes('/architecture/')) return 'architecture';
  if (normalized.endsWith('.test.') || normalized.endsWith('.spec.') || normalized.includes('.test.') || normalized.includes('.spec.')) return 'test-spec';
  const basename = normalized.split('/').pop() ?? '';
  if (basename.startsWith('Dockerfile') || basename === 'Dockerfile') return 'dockerfile';
  if (basename.startsWith('docker-compose')) return 'docker-compose';
  return 'guide';
}

function generateTitle(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() ?? '';
  const name = basename.replace(/\.[^/.]+$/, '');
  if (normalized.includes('/features/') && name.startsWith('hu')) {
    return name.toUpperCase();
  }
  return name;
}

function generateDocSummary(content: string, filePath: string): string {
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  const headingLines = lines.filter((l) => l.startsWith('#'));
  const nonEmpty = lines.slice(0, 50);
  let summary = '';
  if (headingLines.length > 0) {
    summary = headingLines.slice(0, 3).join('; ');
  }
  const bodyLines = nonEmpty.filter((l) => !l.startsWith('#')).slice(0, 5);
  if (bodyLines.length > 0) {
    summary += (summary ? '. ' : '') + bodyLines.join(' ');
  }
  if (!summary) {
    summary = content.slice(0, 500);
  }
  return summary.slice(0, 1000);
}

export class DocIndexer {
  private qdrant: QdrantClient;
  private embedFn: (text: string) => Promise<number[]>;

  constructor(qdrantUrl: string, embedFn: (text: string) => Promise<number[]>) {
    this.qdrant = new QdrantClient(qdrantUrl);
    this.embedFn = embedFn;
  }

  async indexDoc(filePath: string, domain: DocDomain, tags?: string[]): Promise<IndexResult> {
    const result: IndexResult = { indexed: 0, errors: 0, details: [] };
    try {
      const content = readFileSync(filePath, 'utf-8');
      const docType = inferDocType(filePath);
      const title = generateTitle(filePath);
      const summary = generateDocSummary(content, filePath);
      const resolvedPath = filePath;
      const source = domain === 'infra-doc' ? 'infrastructure' : 'project';
      const vector = await this.embedFn(summary);
      await this.qdrant.upsertPoints([{
        id: randomUUID(),
        vector,
        payload: {
          domain,
          source,
          path: resolvedPath,
          title,
          content: summary,
          meta: {
            doc_type: docType,
            tags: tags ?? [],
            file_path: resolvedPath,
            indexed_at: new Date().toISOString(),
          },
        },
      }]);
      result.indexed = 1;
    } catch (e) {
      result.errors = 1;
      result.details.push(`Error indexing doc ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return result;
  }

  async indexDocDirectory(dirPath: string, domain: DocDomain): Promise<IndexResult> {
    const result: IndexResult = { indexed: 0, errors: 0, details: [] };
    try {
      const files = this.walkDir(dirPath);
      for (const file of files) {
        try {
          const docResult = await this.indexDoc(file, domain);
          result.indexed += docResult.indexed;
          result.errors += docResult.errors;
          result.details.push(...docResult.details);
        } catch (e) {
          result.errors++;
          result.details.push(`Error indexing ${file}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } catch (e) {
      result.errors++;
      result.details.push(`Error walking directory ${dirPath}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return result;
  }

  private walkDir(dirPath: string): string[] {
    const files: string[] = [];
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...this.walkDir(fullPath));
        }
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    return files;
  }
}
