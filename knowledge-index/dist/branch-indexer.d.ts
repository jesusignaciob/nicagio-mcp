import type { IndexResult, BranchSummary } from './types.js';
export declare class BranchIndexer {
    private qdrant;
    private embedFn;
    constructor(qdrantUrl: string, embedFn: (text: string) => Promise<number[]>);
    indexBranch(repoPath: string, branch: string): Promise<IndexResult>;
    indexBranchIncremental(repoPath: string, branch: string): Promise<IndexResult>;
    getBranchSummary(source: string, branch: string): Promise<BranchSummary | null>;
    private getCommits;
}
