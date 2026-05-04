/**
 * Image Generation Tool — wraps `mmx image generate`.
 *
 * Single Responsibility: Only handles image generation.
 */

import { z } from 'zod';
import type { ToolDefinition } from './base-tool.js';
import type { CliExecutor } from '../cli/executor.js';

const ImageParams = z.object({
  prompt: z.string().min(1).describe('Image description'),
  out: z.string().optional().describe('Output file path'),
  model: z.string().optional().describe('Model ID (e.g. image-01, image-01-live)'),
  ratio: z.string().optional().describe('Aspect ratio (e.g. 16:9, 1:1, 9:16)'),
  size: z.string().optional().describe('Image size (e.g. 1024x1024)'),
});

export function createImageTool(executor: CliExecutor): ToolDefinition {
  return {
    spec: {
      name: 'generate_image',
      description: 'Generate an image using MiniMax image-01 model',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Image description' },
          out: { type: 'string', description: 'Output file path' },
          model: { type: 'string', description: 'Model ID (image-01 or image-01-live)' },
          ratio: { type: 'string', description: 'Aspect ratio: 16:9, 1:1, 9:16, 4:3, 3:2' },
          size: { type: 'string', description: 'Image size: 1024x1024, 1920x1080, etc.' },
        },
        required: ['prompt'],
      },
    },
    handler: async (params: Record<string, unknown>) => {
      const args = parseImageArgs(params);
      return executor.execute(args, 60);
    },
  };
}

function parseImageArgs(params: Record<string, unknown>): string[] {
  const parsed = ImageParams.parse(params);
  const args = ['image', 'generate', '--prompt', parsed.prompt];

  if (parsed.out) args.push('--out', parsed.out);
  if (parsed.model) args.push('--model', parsed.model);
  if (parsed.ratio) args.push('--ratio', parsed.ratio);
  if (parsed.size) args.push('--size', parsed.size);

  return args;
}
