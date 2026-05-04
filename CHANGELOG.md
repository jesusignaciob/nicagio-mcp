# Changelog

## v1.0.0 — 2026-05-04

### Initial Release

#### chroma-mcp
- MCP server for ChromaDB vector memory
- Tools: `store_memory`, `search_memory`, `list_collections`, `get_collection_info`, `delete_memory`
- Auto-warming of embedding model on startup
- Configurable host, port, collection, tenant, and database via environment variables

#### minimax-mcp
- MCP server wrapping MiniMax AI APIs via `mmx` CLI
- Tools:
  - `generate_image` — Text-to-image generation (image-01 / image-01-live)
  - `generate_video` — Text/video-to-video generation (Hailuo 2.3, SEF, S2V)
  - `generate_music` — Text-to-music with lyrics, instrumental, and genre support
  - `synthesize_speech` — Text-to-speech synthesis (speech-2.8-hd)
  - `chat` — Text generation with MiniMax M2.7 models
- Clean TypeScript with Zod parameter validation
- CLI wrapper abstraction for testability
