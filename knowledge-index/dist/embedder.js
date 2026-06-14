// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor = null;
export async function createEmbedder(modelName = 'Xenova/all-MiniLM-L6-v2') {
    if (!extractor) {
        const { pipeline } = await import('@huggingface/transformers');
        extractor = await pipeline('feature-extraction', modelName);
    }
    return async (text) => {
        const result = await extractor(text, { pooling: 'cls' });
        return Array.from(result.data);
    };
}
export async function embed(text) {
    if (!extractor) {
        throw new Error('Embedder not initialized. Call createEmbedder() first.');
    }
    const result = await extractor(text, { pooling: 'cls' });
    return Array.from(result.data);
}
