interface QdrantPoint {
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
}
interface QdrantSearchResult {
    id: string;
    score: number;
    payload: Record<string, unknown>;
}
interface QdrantFilter {
    should?: Record<string, unknown>[];
    must?: Record<string, unknown>[];
}
export declare class QdrantClient {
    private url;
    constructor(url: string);
    ensureCollection(): Promise<void>;
    upsertPoints(points: QdrantPoint[]): Promise<void>;
    searchWithFilter(vector: number[], filter?: QdrantFilter, limit?: number): Promise<QdrantSearchResult[]>;
    scroll(filter?: QdrantFilter, limit?: number, offset?: string): Promise<{
        points: QdrantSearchResult[];
        nextPageOffset: string | null;
    }>;
    deletePoints(filter: QdrantFilter): Promise<void>;
    countPoints(filter?: QdrantFilter): Promise<number>;
    createPayloadIndex(field: string, schema?: string): Promise<void>;
}
export declare function buildFilter(opts: {
    domain?: string;
    source?: string;
    branch?: string;
    docType?: string;
    tags?: string[];
}): QdrantFilter | undefined;
export {};
