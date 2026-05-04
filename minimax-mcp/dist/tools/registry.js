/**
 * Tool Registry — manages tool registration and discovery.
 *
 * Open/Closed: New tools are added by registering them, not by modifying this class.
 * Single Responsibility: Only manages the collection of tools.
 */
import { createImageTool } from './image-tool.js';
import { createVideoTool } from './video-tool.js';
import { createMusicTool } from './music-tool.js';
import { createSpeechTool } from './speech-tool.js';
import { createTextTool } from './text-tool.js';
export class ToolRegistry {
    definitions;
    constructor(executor) {
        // Register all tools — add new ones here following OCP
        this.definitions = [
            createImageTool(executor),
            createVideoTool(executor),
            createMusicTool(executor),
            createSpeechTool(executor),
            createTextTool(executor),
        ];
    }
    /** Returns MCP tool specs for the server capabilities */
    getSpecs() {
        return this.definitions.map((def) => def.spec);
    }
    /** Finds and executes a tool by name */
    async execute(name, params) {
        const tool = this.definitions.find((def) => def.spec.name === name);
        if (!tool) {
            return {
                success: false,
                stdout: '',
                stderr: `Unknown tool: ${name}`,
                exitCode: 1,
            };
        }
        return tool.handler(params);
    }
}
//# sourceMappingURL=registry.js.map