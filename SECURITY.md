# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly by emailing the maintainer or opening a [GitHub issue](https://github.com/carloditan24/mindkeg-mcp/issues) with the label `security`.

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

## Security Design

### API Key Authentication

- API keys are generated with cryptographically secure randomness (`crypto.randomBytes`)
- Keys are hashed with SHA-256 before storage — plaintext keys are never persisted
- Keys are displayed once at creation and cannot be retrieved afterward
- Key comparison uses `timingSafeEqual` to prevent timing attacks on the HTTP transport

### Data Storage

- All SQL queries use parameterized statements — no string interpolation
- SQLite database is stored locally at `~/.mindkeg/brain.db` by default
- HTTP server binds to `127.0.0.1` (localhost only) by default

### Logging

- API keys are never logged, even partially (only the public prefix is logged)
- Logger writes to stderr to avoid leaking data through the MCP stdio protocol

## Known Issues

### Dev-only: esbuild/vite/vitest (moderate)

The `esbuild` vulnerability (GHSA-67mh-4wv8-2f99) affects the development server only. It is a dev dependency and is **not shipped** to users in the published npm package.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |
