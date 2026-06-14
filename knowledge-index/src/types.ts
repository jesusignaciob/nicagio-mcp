export interface KnowledgePoint {
  id: string;
  domain: 'code' | 'infra-doc' | 'project-doc';
  source: string;
  path: string;
  title: string;
  content: string;
  meta: Record<string, unknown>;
}

export interface BranchSummary {
  branch: string;
  source: string;
  lastCommit: string;
  author: string;
  commitMessage: string;
  filesChanged: number;
  summary: string;
  tags: string[];
}

export interface IndexResult {
  indexed: number;
  errors: number;
  details: string[];
}

export interface SearchOptions {
  domain?: string;
  source?: string;
  branch?: string;
  docType?: string;
  tags?: string[];
  limit?: number;
}

export interface KnowledgeResult {
  id: string;
  domain: string;
  source: string;
  path: string;
  title: string;
  content: string;
  score: number;
  meta: Record<string, unknown>;
}
