# Contributing to Mind Keg MCP

Thanks for your interest in contributing! This guide covers how to get set up and submit changes.

## Prerequisites

- **Node.js 22+** — required for the built-in `node:sqlite` module
- **npm** — for dependency management

## Getting Started

```bash
git clone https://github.com/carloluisito/mindkeg-mcp.git
cd mindkeg-mcp
npm install
npm run build
```

## Development Workflow

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

### Tests

- Tests use **Vitest** and run against in-memory SQLite databases
- No external services (OpenAI, etc.) are required
- Run the full suite before submitting a PR: `npm test`

### Code Style

- **TypeScript strict mode** — no `any` types; use `unknown` then narrow with type guards
- **ESM only** — all imports use `.js` extensions
- **Zod schemas** are the source of truth for runtime validation
- **Typed errors** from `src/utils/errors.ts` — never throw raw strings
- **Logger writes to stderr** — stdout is reserved for the MCP stdio protocol

## Submitting Changes

1. Fork the repository and create a branch from `main`
2. Make your changes
3. Add or update tests as needed
4. Run `npm test` and `npm run typecheck` to verify
5. Open a pull request against `main`

### Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Write a clear description of what changed and why
- If your change affects the MCP tool interface, update `README.md` and `templates/AGENTS.md`

## Reporting Issues

Use [GitHub Issues](https://github.com/carloluisito/mindkeg-mcp/issues) to report bugs or request features. Include:

- Steps to reproduce (for bugs)
- Node.js version (`node --version`)
- OS and shell
- Relevant error output or logs

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md).
