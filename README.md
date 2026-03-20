# Jessie

Jessie is a desktop AI chat app built with **Tauri + React + TypeScript**, powered by **OpenRouter**.

It focuses on practical daily use: fast streaming chat, clean settings, memory support, and real-time web search via Tavily tool calling.

## Highlights

- Streaming chat responses
- OpenRouter model management (add/edit/remove/default model)
- Memory system v2
  - memory retrieval
  - prompt injection
  - auto extraction with filtering and dedupe
  - conflict handling
- Real-time web search (Tavily API, via OpenRouter tool-calling loop)
- Local persistence (settings, chats, memory)
- Settings panel (General / Models / Memory / Data / Appearance / Advanced)
- Toast feedback and error handling

## Tech Stack

- Tauri 2
- React + TypeScript + Vite
- Zustand
- TailwindCSS
- OpenRouter Chat Completions API
- Tavily Search API

## Prerequisites

- Node.js 18+
- Rust toolchain
- Tauri system dependencies for your OS

## Quick Start

```bash
npm install
npm run tauri:dev
```

## Build

```bash
npm run build
npm run tauri:build
```

## Required Configuration

Set API keys inside Jessie Settings:

1. **OpenRouter API Key**
Path: `Settings -> Models -> OpenRouter API Key`

2. **Tavily API Key** (for real-time web search)
Path: `Settings -> General -> Tavily API Key`

Both keys are stored locally on your device.

## How Web Search Works

Jessie uses OpenRouter tool calling with a `web_search` tool definition:

1. User asks a question
2. Model emits `tool_calls` for `web_search` when needed
3. Jessie calls Tavily (`https://api.tavily.com/search`)
4. Tool result is sent back as `role: "tool"`
5. Model continues and returns final answer

Fallback behavior:

- Missing Tavily key or Tavily request failure -> normal LLM response + toast `Web search unavailable`

## Development Commands

```bash
# run web app only
npm run dev

# run desktop app (Tauri)
npm run tauri:dev

# typecheck + production web build
npm run build
```

## Project Structure (Main Parts)

- `src/store/useChatStore.ts` - chat pipeline, tool loop, streaming
- `src/lib/openrouter.ts` - OpenRouter request layer
- `src/lib/tavily.ts` - Tavily API integration
- `src/store/useMemoryStore.ts` - memory extraction/injection/persistence
- `src/components/settings/*` - settings UI sections
- `src-tauri/` - Tauri desktop host

## Troubleshooting

If Jessie says it cannot access real-time data:

- Ensure Tavily API key is set in Settings -> General
- Ensure OpenRouter API key and model are configured
- Check console logs for:
  - `Tool called: ...`
  - `Tavily result: ...`
- Retry in a new message after updating keys

## Security Notes

- Never commit real API keys or secrets
- Keep `.env*` files out of version control
- Use `SECURITY.md` process for vulnerability reports

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT License. See [LICENSE](./LICENSE).
