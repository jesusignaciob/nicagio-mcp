// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null;

export async function createEmbedder(modelName: string = 'Xenova/all-MiniLM-L6-v2'): Promise<(text: string) => Promise<number[]>> {
  if (!extractor) {
    const { pipeline } = await import('@huggingface/transformers');
    extractor = await pipeline('feature-extraction', modelName);
  }
  return async (text: string): Promise<number[]> => {
    const result = await extractor(text, { pooling: 'cls' });
    return Array.from(result.data) as number[];
  };
}

export async function embed(text: string): Promise<number[]> {
  if (!extractor) {
    throw new Error('Embedder not initialized. Call createEmbedder() first.');
  }
  const result = await extractor(text, { pooling: 'cls' });
  return Array.from(result.data) as number[];
}
