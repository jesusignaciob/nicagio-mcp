import type { SearchOptions, KnowledgeResult, IndexResult } from './types.js';
export declare class KnowledgeSearch {
    private qdrant;
    private embedFn;
    constructor(qdrantUrl: string, embedFn: (text: string) => Promise<number[]>);
    search(query: string, options?: SearchOptions): Promise<KnowledgeResult[]>;
    list(options?: SearchOptions & {
        offset?: string;
    }): Promise<{
        points: KnowledgeResult[];
        nextOffset: string | null;
    }>;
    reindex(domain: string, source?: string): Promise<IndexResult>;
}
