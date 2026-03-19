# Contributing to Jessie

Thanks for your interest in contributing.

## Development Setup

```bash
npm install
npm run tauri:dev
```

## Before Opening a PR

1. Keep changes focused and minimal.
2. Run checks locally:

```bash
npm run build
```

3. Make sure no secrets are included in commits.
4. Update docs when behavior changes.

## Commit Style

- Use clear, concise commit messages.
- Example: `fix(chat): improve OpenRouter timeout handling`

## Pull Request Guidance

1. Describe what changed and why.
2. Include screenshots for UI changes.
3. Mention test steps and expected results.

## Code Standards

- Prefer TypeScript strictness and explicit types.
- Do not rewrite architecture for small bug fixes.
- Keep UX messages clear and actionable.
