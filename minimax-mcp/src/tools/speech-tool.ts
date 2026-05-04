/**
 * Speech Synthesis Tool — wraps `mmx speech synthesize`.
 *
 * Single Responsibility: Only handles text-to-speech.
 */

import { z } from 'zod';
import type { ToolDefinition } from './base-tool.js';
import type { CliExecutor } from '../cli/executor.js';

const SpeechParams = z.object({
  text: z.string().min(1).max(10000).describe('Text to synthesize (max 10,000 characters)'),
  text_file: z.string().optional().describe('Path to a file containing text'),
  voice: z.string().optional().describe('Voice ID (default: English_expressive_narrator)'),
  model: z.string().optional().describe('Model ID (default: speech-2.8-hd)'),
  speed: z.number().optional().describe('Speech speed multiplier'),
  volume: z.number().optional().describe('Volume level'),
  pitch: z.number().optional().describe('Pitch adjustment'),
  format: z.string().optional().describe('Audio format (default: mp3)'),
  out: z.string().optional().describe('Output file path'),
  language: z.string().optional().describe('Language boost code'),
  subtitles: z.boolean().optional().describe('Include subtitle timing data'),
});

export function createSpeechTool(executor: CliExecutor): ToolDefinition {
  return {
    spec: {
      name: 'synthesize_speech',
      description: 'Generate speech/audio from text using MiniMax TTS models',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to synthesize (max 10,000 chars)' },
          text_file: { type: 'string', description: 'Path to a file containing text (use - for stdin)' },
          voice: { type: 'string', description: 'Voice ID. Default: English_expressive_narrator' },
          model: { type: 'string', description: 'Model: speech-2.8-hd (default), speech-2.6, speech-02' },
          speed: { type: 'number', description: 'Speech speed multiplier' },
          volume: { type: 'number', description: 'Volume level' },
          pitch: { type: 'number', description: 'Pitch adjustment' },
          format: { type: 'string', description: 'Audio format: mp3 (default), wav, pcm' },
          out: { type: 'string', description: 'Output file path' },
          language: { type: 'string', description: 'Language boost code' },
          subtitles: { type: 'boolean', description: 'Include subtitle timing data' },
        },
        required: ['text'],
      },
    },
    handler: async (params: Record<string, unknown>) => {
      const args = parseSpeechArgs(params);
      return executor.execute(args, 120);
    },
  };
}

function parseSpeechArgs(params: Record<string, unknown>): string[] {
  const parsed = SpeechParams.parse(params);
  const args = ['speech', 'synthesize'];

  if (parsed.text_file) {
    args.push('--text-file', parsed.text_file);
  } else {
    args.push('--text', parsed.text);
  }

  if (parsed.voice) args.push('--voice', parsed.voice);
  if (parsed.model) args.push('--model', parsed.model);
  if (parsed.speed !== undefined) args.push('--speed', String(parsed.speed));
  if (parsed.volume !== undefined) args.push('--volume', String(parsed.volume));
  if (parsed.pitch !== undefined) args.push('--pitch', String(parsed.pitch));
  if (parsed.format) args.push('--format', parsed.format);
  if (parsed.out) args.push('--out', parsed.out);
  if (parsed.language) args.push('--language', parsed.language);
  if (parsed.subtitles) args.push('--subtitles');

  return args;
}
