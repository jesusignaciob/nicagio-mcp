export declare function createEmbedder(modelName?: string): Promise<(text: string) => Promise<number[]>>;
export declare function embed(text: string): Promise<number[]>;
