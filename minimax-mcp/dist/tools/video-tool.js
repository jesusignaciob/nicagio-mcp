/**
 * Video Generation Tool — wraps `mmx video generate`.
 *
 * Single Responsibility: Only handles video generation.
 */
import { z } from 'zod';
const VideoParams = z.object({
    prompt: z.string().min(1).describe('Video description'),
    model: z.string().optional().describe('Model ID (MiniMax-Hailuo-2.3, etc.)'),
    first_frame: z.string().optional().describe('First frame image path or URL (I2V/SEF mode)'),
    last_frame: z.string().optional().describe('Last frame image path or URL (SEF mode, requires first_frame)'),
    subject_image: z.string().optional().describe('Subject reference image (S2V mode)'),
    download: z.string().optional().describe('File path to save the video'),
    async: z.boolean().optional().describe('Return task ID immediately without waiting'),
    poll_interval: z.number().optional().describe('Polling interval in seconds (default: 5)'),
});
export function createVideoTool(executor) {
    return {
        spec: {
            name: 'generate_video',
            description: 'Generate a video using MiniMax Hailuo models (T2V, I2V, SEF, S2V)',
            inputSchema: {
                type: 'object',
                properties: {
                    prompt: { type: 'string', description: 'Video description' },
                    model: { type: 'string', description: 'Model ID: MiniMax-Hailuo-2.3, MiniMax-Hailuo-2.3-Fast, Hailuo-02 (SEF), S2V-01' },
                    first_frame: { type: 'string', description: 'First frame image path or URL (enables I2V mode)' },
                    last_frame: { type: 'string', description: 'Last frame image path or URL (enables SEF mode with Hailuo-02). Requires first_frame.' },
                    subject_image: { type: 'string', description: 'Subject reference image for character consistency (S2V-01 mode)' },
                    download: { type: 'string', description: 'File path to save the video on completion' },
                    async: { type: 'boolean', description: 'Return task ID immediately without waiting' },
                    poll_interval: { type: 'number', description: 'Polling interval in seconds (default: 5)' },
                },
                required: ['prompt'],
            },
        },
        handler: async (params) => {
            const args = parseVideoArgs(params);
            return executor.execute(args, 300);
        },
    };
}
function parseVideoArgs(params) {
    const parsed = VideoParams.parse(params);
    const args = ['video', 'generate', '--prompt', parsed.prompt];
    if (parsed.model)
        args.push('--model', parsed.model);
    if (parsed.first_frame)
        args.push('--first-frame', parsed.first_frame);
    if (parsed.last_frame)
        args.push('--last-frame', parsed.last_frame);
    if (parsed.subject_image)
        args.push('--subject-image', parsed.subject_image);
    if (parsed.download)
        args.push('--download', parsed.download);
    if (parsed.async)
        args.push('--async');
    if (parsed.poll_interval)
        args.push('--poll-interval', String(parsed.poll_interval));
    return args;
}
//# sourceMappingURL=video-tool.js.map