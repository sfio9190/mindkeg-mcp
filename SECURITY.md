# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please use GitHub's private vulnerability reporting:

1. Navigate to the [Security Advisories](https://github.com/carloluisito/mindkeg-mcp/security/advisories) page.
2. Click **New draft security advisory**.
3. Fill in the details: description, severity, reproduction steps, and potential impact.

We will respond within 48 hours and coordinate a fix before public disclosure. Please do not open public issues for security vulnerabilities.

If GitHub Security Advisories are unavailable, email the maintainer directly with the label `[SECURITY]` in the subject.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.4.x   | Yes       |
| 0.3.x   | Yes       |
| < 0.3.0 | No        |

## Secure Development Lifecycle

### Code Review
- All changes require a pull request before merging to `main`.
- Security-sensitive changes (auth, crypto, storage) are tagged and reviewed specifically against the threat model below.

### Dependency Management
- Dependencies are audited with `npm audit` on every CI run.
- A CycloneDX SBOM is generated and published with every release as a GitHub release asset, enabling consumers to verify the complete dependency tree.
- Transitive dependency vulnerabilities are tracked in the Known Issues section of this file.

### Release Signing
- All release git tags are signed with GPG (or gitsign for keyless signing via OIDC).
- The npm tarball is signed with Sigstore cosign. The `.sig` and `.bundle` artifacts are published as GitHub release assets alongside the SBOM.
- npm provenance attestation is included in every published package (verifiable via `npm audit signatures`).

### Git Tag Signing Process

For GPG-signed tags:
```
git tag -s v0.4.0 -m "release: v0.4.0"
git push origin v0.4.0
```

For keyless signing via gitsign (Sigstore):
```
gitsign tag -s v0.4.0 -m "release: v0.4.0"
git push origin v0.4.0
```

Consumers can verify a release tag:
```
git verify-tag v0.4.0
```

## Threat Model Summary

### Trust Boundaries
- **Agents (Claude Code, Cursor, Windsurf)**: Trusted consumers of MCP tools. Authenticated via API key.
- **MCP protocol**: JSON-RPC over stdio (local) or HTTP+SSE (remote). Stdio is fully trusted (local process). HTTP requires API key per request.
- **Database**: SQLite file on the local filesystem. Assumed private to the user running the server.
- **Embedding providers**: FastEmbed (local ONNX, trusted) or OpenAI API (external, trusted for embeddings only).

### Key Threats and Mitigations

| Threat | Mitigation |
|--------|-----------|
| Unauthorized tool access | API key authentication; SHA-256 key comparison; per-session re-validation (F-01) |
| Memory poisoning via adversarial content | Content sanitization (control char stripping); integrity hashing (SHA-256); provenance tracking (`source_agent`) |
| Data exfiltration from database | Application-level AES-256-GCM encryption (`MINDKEG_ENCRYPTION_KEY`) |
| Tampered learnings undetected | SHA-256 `integrity_hash` per learning; opt-in verification via `verify_integrity` flag |
| API abuse / denial of service | Token bucket rate limiting (100 write rpm / 300 read rpm per API key prefix) |
| Large request body memory exhaustion | 1 MB request body limit on HTTP transport |
| Session fixation | API key hash stored per session; re-validated on each request |
| Audit trail gaps | Structured JSON lines audit log (`~/.mindkeg/audit.jsonl`); every tool invocation logged |
| Stale/expired data lingering | TTL per learning (`ttl_days`); global default TTL; automatic purge on startup and periodically |

### Out of Scope
- Network-level encryption (TLS): deploy behind a TLS-terminating reverse proxy for HTTP mode.
- Multi-tenancy: the server is designed for a single user / single organization.
- Key management: `MINDKEG_ENCRYPTION_KEY` management is the operator's responsibility.

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
- Optional AES-256-GCM encryption for `content` and `embedding` fields via `MINDKEG_ENCRYPTION_KEY`

### Logging and Audit

- API keys are never logged, even partially (only the public prefix is logged)
- Logger writes to stderr to avoid leaking data through the MCP stdio protocol
- All tool invocations produce structured audit log entries (JSON lines) with timestamp, actor, action, resource ID, and result
- Sensitive fields (`content`, `embedding`) are never included in audit entries

### Content Integrity

- Every stored learning receives a SHA-256 `integrity_hash` covering its content, category, repository, workspace, and source_agent
- Callers can opt in to integrity verification (`verify_integrity: true`) on `search_learnings` and `get_context`
- Each result is annotated with `integrity_valid: boolean` indicating whether the stored hash matches the computed hash

### Rate Limiting

- HTTP transport enforces in-memory token bucket rate limiting per API key prefix
- Write tools: 100 requests/minute (configurable via `MINDKEG_RATE_LIMIT_WRITE_RPM`)
- Read tools: 300 requests/minute (configurable via `MINDKEG_RATE_LIMIT_READ_RPM`)
- Exceeded requests receive HTTP 429 with `Retry-After` header
- Rate limiting does not apply to stdio transport (local process, fully trusted)

## Known Issues

### Production: tar via fastembed (high)

The `fastembed` dependency pulls in `tar` (via `onnxruntime-node`) which has path traversal vulnerabilities (GHSA-34x7-hfp2-rc4v, GHSA-8qq5-rm4j-mr97, GHSA-qffp-2rhf-9h96). The fixed `tar@7.5.10` has a breaking change (removed default export) that is incompatible with `fastembed`. We cannot override until `fastembed` updates its dependency.

**Practical risk is low**: `tar` is only used during the one-time FastEmbed model download from Hugging Face (a trusted source). It is not used for any user-supplied data. If this concerns you, set `MINDKEG_EMBEDDING_PROVIDER=none` to skip FastEmbed entirely and use FTS5 keyword search.

### Dev-only: esbuild/vite/vitest (moderate)

The `esbuild` vulnerability (GHSA-67mh-4wv8-2f99) affects the development server only. It is a dev dependency and is **not shipped** to users in the published npm package.
