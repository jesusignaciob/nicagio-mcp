# Changelog

## v1.1.0 — 2026-05-04

### Minor Release — TypeScript Migration

#### chroma-mcp
- **Migración completa de JavaScript a TypeScript** con tipos estrictos
- Tipado nativo de ChromaDB v3.4.3 (Metadata, Where, QueryResult)
- tsconfig con strict mode, declarations y sourcemaps
- Build output en dist/ con source maps para debugging
- `npm run dev` con tsx para hot-reload

#### General
- Monorepo ahora 100% TypeScript (ambos servidores)
- Build unificado desde la raíz
- CI workflow para Node 18, 20 y 22
- CHANGELOG.md y LICENSE añadidos

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
