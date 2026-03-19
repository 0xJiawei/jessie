# Jessie

Jessie is a desktop AI chat app built with Tauri + React + TypeScript, powered by OpenRouter.

## Tech Stack

- Tauri 2
- React + TypeScript + Vite
- Zustand (state + local persistence)
- TailwindCSS
- OpenRouter Chat Completions API (streaming)

## Current Features

- Streaming chat experience
- Model management and model selection
- Memory system v2:
  - retrieval
  - injection
  - auto extraction
  - conflict handling
- Settings system:
  - General
  - Models
  - Memory
  - Data
  - Appearance
  - Advanced
- Toast notification system
- Local persistence

## Prerequisites

- Node.js 18+
- Rust toolchain (for Tauri build/dev)
- Tauri development dependencies for your OS

## Getting Started

```bash
npm install
npm run tauri:dev
```

## Build

```bash
npm run build
npm run tauri:build
```

## Configuration

Jessie uses OpenRouter for model requests. Add your API key from:

- Settings -> Models -> OpenRouter API Key

The key is stored locally on your machine.

## Security Note

- Never commit real API keys or secrets.
- Use local environment files (for example `.env.local`) and keep them ignored by git.

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) first.

## Security Reporting

If you discover a security issue, please follow [`SECURITY.md`](./SECURITY.md).

## License

This project is licensed under the MIT License. See [`LICENSE`](./LICENSE).
