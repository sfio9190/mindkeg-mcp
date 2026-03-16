# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-03-16

### Added
- **Encryption at rest**: AES-256-GCM application-level encryption for learning content and embedding fields, controlled via `MINDKEG_ENCRYPTION_KEY` env var
- **Audit logging**: Structured JSON lines audit log (SIEM-compatible) for all MCP tool invocations, configurable destination via `MINDKEG_AUDIT_LOG`
- **TTL and data retention**: Per-learning `ttl_days` field with global default, automatic purge on startup and periodic interval, `mindkeg purge` CLI for manual bulk purge
- **Monitoring integration**: `/health` and `/metrics` (Prometheus format) endpoints on HTTP transport with configurable authentication
- **Content sanitization**: Strip control characters and reject whitespace-only content on store/update to prevent memory poisoning
- **Provenance tracking**: `source_agent` field on learnings to record which agent created or modified each entry
- **Integrity checksums**: SHA-256 `integrity_hash` on learnings with opt-in verification via `verify_integrity` parameter on `search_learnings` and `get_context`
- **Rate limiting**: Dual-bucket (write/read) in-memory token bucket rate limiter for HTTP transport, configurable via `MINDKEG_RATE_LIMIT_WRITE_RPM` and `MINDKEG_RATE_LIMIT_READ_RPM`
- **Supply chain hardening**: Expanded SECURITY.md with SDL and threat model, CycloneDX SBOM generation, Sigstore cosign signing of npm tarballs in CI
- CLI commands: `mindkeg encrypt-db`, `mindkeg decrypt-db`, `mindkeg purge`, `mindkeg backfill-integrity`
- Database migration 003: adds `ttl_days`, `source_agent`, `integrity_hash` columns (non-destructive)

### Changed
- `store_learning` and `update_learning` tools now accept `source_agent` and `ttl_days` parameters
- `search_learnings` and `get_context` tools now accept `verify_integrity` parameter
- `createMcpServer` dependency bag expanded with audit logger and metrics collector
- All tool handlers now emit audit entries and record Prometheus metrics
- Publish workflow generates SBOM and cosign signature as release assets

## [0.3.0] - 2026-03-13

### Added
- `get_context` MCP tool for session-start context priming — returns all relevant learnings for the current repository, workspace, and optional topic focus, structured by scope (repo/workspace/global), ranked by actionability (gotchas first), and trimmed to a character budget (compact/standard/full)
- Tiered ranking system: gotchas/debugging > conventions > decisions/architecture > dependencies, with stale-flag and recency tiebreakers
- Budget system with three presets: compact (~2K chars), standard (~5K), full (~12K), with rollover redistribution across sections
- Monorepo support via `path_hint` parameter — boosts learnings relevant to a specific subdirectory using substring matching and semantic similarity
- Optional `query` parameter for topic-biased context retrieval via embedding similarity
- Near-duplicate detection: write-time cosine similarity check (>0.92 threshold) on `store_learning` and `update_learning`, surfaced in `get_context` response
- `duplicate_candidates` database table (migration 002) for pre-computed near-duplicate pairs
- `mindkeg dedup-scan` CLI command to backfill duplicate detection for existing databases (supports `--dry-run`)
- Stale review section in `get_context` response — surfaces stale-flagged learnings for agent review

### Changed
- Version strings in CLI and MCP server now match package.json (previously hardcoded as 0.1.0)
- Tool count updated from 8 to 9 across documentation and code comments

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
