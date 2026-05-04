# Nicagio MCP

Custom MCP (Model Context Protocol) servers desarrollados por Nicagio.

## Servidores

### chroma-mcp

Conexión a ChromaDB para memoria vectorial persistente.

```bash
cd chroma-mcp && npm install
node server.js
```

**Variables de entorno:**
- `CHROMA_HOST` (default: 127.0.0.1)
- `CHROMA_PORT` (default: 8000)
- `CHROMA_DEFAULT_COLLECTION` (default: openclaw-memory)

### minimax-mcp

Integración con MiniMax API (imagen, video, música, TTS, web search).

```bash
cd minimax-mcp && npm install && npm run build
npm start
```

**Variables de entorno:**
- `MINIMAX_API_KEY` — requerida
- `MINIMAX_API_HOST` (default: https://api.minimax.io)

## Licencia

MIT © Jesús Becerra
