/**
 * Music Generation Tool — wraps `mmx music generate`.
 *
 * Single Responsibility: Only handles music generation.
 */
import { z } from 'zod';
const MusicParams = z.object({
    prompt: z.string().min(1).describe('Music style description'),
    lyrics: z.string().optional().describe('Song lyrics with structure tags'),
    lyrics_file: z.string().optional().describe('Path to a file containing lyrics'),
    lyrics_optimizer: z.boolean().optional().describe('Auto-generate lyrics from prompt'),
    instrumental: z.boolean().optional().describe('Generate instrumental music (no vocals)'),
    vocals: z.string().optional().describe('Vocal style description'),
    genre: z.string().optional().describe('Music genre'),
    mood: z.string().optional().describe('Mood or emotion'),
    instruments: z.string().optional().describe('Instruments to feature'),
    tempo: z.string().optional().describe('Tempo description'),
    bpm: z.number().optional().describe('Exact tempo in BPM'),
    key: z.string().optional().describe('Musical key'),
    model: z.string().optional().describe('Model: music-2.6, music-2.6-free, music-2.5+, music-2.5'),
    out: z.string().optional().describe('Output file path'),
    format: z.string().optional().describe('Audio format (mp3, wav, etc.)'),
});
export function createMusicTool(executor) {
    return {
        spec: {
            name: 'generate_music',
            description: 'Generate music using MiniMax music models (text-to-music, with lyrics, or instrumental)',
            inputSchema: {
                type: 'object',
                properties: {
                    prompt: { type: 'string', description: 'Music style description (e.g. "cinematic orchestral, building tension")' },
                    lyrics: { type: 'string', description: 'Song lyrics with structure tags ([Verse], [Chorus], etc.)' },
                    lyrics_file: { type: 'string', description: 'Path to a file containing lyrics' },
                    lyrics_optimizer: { type: 'boolean', description: 'Auto-generate lyrics from prompt' },
                    instrumental: { type: 'boolean', description: 'Generate instrumental music (no vocals)' },
                    vocals: { type: 'string', description: 'Vocal style (e.g. "warm male baritone", "bright female soprano")' },
                    genre: { type: 'string', description: 'Music genre: folk, pop, jazz, electronic, etc.' },
                    mood: { type: 'string', description: 'Mood: warm, melancholic, uplifting, etc.' },
                    instruments: { type: 'string', description: 'Instruments to feature' },
                    tempo: { type: 'string', description: 'Tempo: fast, slow, moderate' },
                    bpm: { type: 'number', description: 'Exact tempo in beats per minute' },
                    key: { type: 'string', description: 'Musical key: C major, A minor, etc.' },
                    model: { type: 'string', description: 'Model: music-2.6 (recommended), music-2.6-free, music-2.5+, music-2.5' },
                    out: { type: 'string', description: 'Output file path' },
                    format: { type: 'string', description: 'Audio format: mp3, wav' },
                },
                required: ['prompt'],
            },
        },
        handler: async (params) => {
            const args = parseMusicArgs(params);
            return executor.execute(args, 180);
        },
    };
}
function parseMusicArgs(params) {
    const parsed = MusicParams.parse(params);
    const args = ['music', 'generate', '--prompt', parsed.prompt];
    if (parsed.lyrics)
        args.push('--lyrics', parsed.lyrics);
    if (parsed.lyrics_file)
        args.push('--lyrics-file', parsed.lyrics_file);
    if (parsed.lyrics_optimizer)
        args.push('--lyrics-optimizer');
    if (parsed.instrumental)
        args.push('--instrumental');
    if (parsed.vocals)
        args.push('--vocals', parsed.vocals);
    if (parsed.genre)
        args.push('--genre', parsed.genre);
    if (parsed.mood)
        args.push('--mood', parsed.mood);
    if (parsed.instruments)
        args.push('--instruments', parsed.instruments);
    if (parsed.tempo)
        args.push('--tempo', parsed.tempo);
    if (parsed.bpm)
        args.push('--bpm', String(parsed.bpm));
    if (parsed.key)
        args.push('--key', parsed.key);
    if (parsed.model)
        args.push('--model', parsed.model);
    if (parsed.out)
        args.push('--out', parsed.out);
    if (parsed.format)
        args.push('--format', parsed.format);
    return args;
}
//# sourceMappingURL=music-tool.js.map