import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

let extractor: any = null;

export async function embed(text: string): Promise<number[]> {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const result = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
}
