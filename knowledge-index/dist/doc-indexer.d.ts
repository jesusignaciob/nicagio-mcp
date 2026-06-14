import type { IndexResult } from './types.js';
type DocDomain = 'infra-doc' | 'project-doc';
export declare class DocIndexer {
    private qdrant;
    private embedFn;
    constructor(qdrantUrl: string, embedFn: (text: string) => Promise<number[]>);
    indexDoc(filePath: string, domain: DocDomain, tags?: string[]): Promise<IndexResult>;
    indexDocDirectory(dirPath: string, domain: DocDomain): Promise<IndexResult>;
    private walkDir;
}
export {};
