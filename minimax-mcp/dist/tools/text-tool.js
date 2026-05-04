/**
 * Text Chat Tool — wraps `mmx text chat`.
 *
 * Single Responsibility: Only handles text generation/chat.
 */
import { z } from 'zod';
const TextParams = z.object({
    message: z.string().min(1).describe('Message to send'),
    system: z.string().optional().describe('System prompt'),
    model: z.string().optional().describe('Model ID (default: MiniMax-M2.7)'),
    max_tokens: z.number().optional().describe('Maximum tokens to generate'),
    temperature: z.number().optional().describe('Sampling temperature (0.0, 1.0]'),
    stream: z.boolean().optional().describe('Stream response tokens'),
});
export function createTextTool(executor) {
    return {
        spec: {
            name: 'chat',
            description: 'Chat with MiniMax text models (M2.7) for text generation and conversation',
            inputSchema: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'Message to send' },
                    system: { type: 'string', description: 'System prompt to set behavior' },
                    model: { type: 'string', description: 'Model: MiniMax-M2.7 (default), MiniMax-M2.7-highspeed' },
                    max_tokens: { type: 'number', description: 'Maximum tokens to generate (default: 4096)' },
                    temperature: { type: 'number', description: 'Sampling temperature (0.0, 1.0]' },
                    stream: { type: 'boolean', description: 'Stream response tokens' },
                },
                required: ['message'],
            },
        },
        handler: async (params) => {
            const args = parseTextArgs(params);
            return executor.execute(args, 60);
        },
    };
}
function parseTextArgs(params) {
    const parsed = TextParams.parse(params);
    const args = ['text', 'chat', '--message', parsed.message];
    if (parsed.system)
        args.push('--system', parsed.system);
    if (parsed.model)
        args.push('--model', parsed.model);
    if (parsed.max_tokens)
        args.push('--max-tokens', String(parsed.max_tokens));
    if (parsed.temperature !== undefined)
        args.push('--temperature', String(parsed.temperature));
    if (parsed.stream)
        args.push('--stream');
    return args;
}
//# sourceMappingURL=text-tool.js.map