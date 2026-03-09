# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-09

### Added
- `mindkeg init` command for quick project setup — auto-detects agent tooling (Claude Code, Cursor, Windsurf), writes MCP config, copies agent instructions, and runs a health check
- `mindkeg stats` command to display database statistics — learning counts, category breakdown, scope distribution, embedding coverage, DB file size, with `--json` output support
- `getStats()` method on the storage adapter for aggregate database queries

### Fixed
- Skip CUDA binary download in CI to prevent transient 502 failures

## [0.1.1] - 2026-03-08

### Added
- `/release` slash command for automated version releases with changelog, tagging, and GitHub release creation
- npm publish CI workflow triggered on GitHub releases (with provenance)

### Fixed
- Resolved ESLint unused import/variable errors in test files
- Fixed TypeScript type errors in CLI import command and SQLite adapter

## [0.1.0] - 2026-03-08

### Added

- MCP server with stdio and HTTP+SSE transports
- 8 MCP tools: `store_learning`, `search_learnings`, `update_learning`, `deprecate_learning`, `flag_stale`, `delete_learning`, `list_repositories`, `list_workspaces`
- Three embedding providers: FastEmbed (default, free, local), OpenAI, and None (FTS5 keyword fallback)
- Three scoping levels: repository-specific, workspace-wide, and global learnings
- SQLite storage using Node.js 22 built-in `node:sqlite`
- API key authentication with SHA-256 hashing and per-repository access control
- CLI for server management, API key lifecycle, migrations, import/export
- `AGENTS.md` template for instructing AI agents to use Mind Keg
- Import/export for backup and migration
