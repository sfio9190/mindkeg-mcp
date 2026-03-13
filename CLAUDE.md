# Mind Keg MCP — Development Guide for AI Agents

This file provides persistent context for AI agents (Claude Code, Cursor, Windsurf, etc.) working on this codebase.
**This project dogfoods its own concept**: it IS a persistent memory system for agents, and we use it on itself.

## Project Overview

Mind Keg MCP is a TypeScript/Node.js MCP server that stores, searches, and retrieves atomic developer learnings.
It is designed to give AI agents persistent memory across sessions.

- **Version**: 0.2.0
- **Runtime**: Node.js >= 22 (uses built-in `node:sqlite`)
- **Transport**: stdio (local) + HTTP+SSE (remote)
- **Storage**: SQLite via `node:sqlite` (`DatabaseSync` — synchronous)
- **Search**: Semantic (FastEmbed local ONNX or OpenAI embeddings) with FTS5 fallback when no embedding provider is configured
- **Auth**: API key-based (SHA-256 hashed, never stored in plaintext)
- **License**: MIT

### Repository Layout

```
cli/
  index.ts              CLI entry point (Commander.js)
  commands/
    api-key.ts          API key management (generate, list, revoke)
    export.ts           Export learnings to JSON
    import.ts           Import learnings from JSON
    dedup-scan.ts       Backfill duplicate_candidates for existing learnings
    init.ts             Project setup (copies AGENTS.md template)
    migrate.ts          Run database migrations
    serve.ts            Start stdio or HTTP server
    stats.ts            Database statistics

src/
  index.ts              Server entry point, transport setup
  server.ts             MCP server, tool registration
  config.ts             Config loading (env vars → Zod-validated defaults)
  auth/
    api-key.ts          API key generation (crypto.randomBytes + SHA-256)
    middleware.ts        API key validation middleware
  tools/                One file per MCP tool (9 tools)
    store-learning.ts
    search-learnings.ts
    update-learning.ts
    deprecate-learning.ts
    delete-learning.ts
    flag-stale.ts
    list-repositories.ts
    list-workspaces.ts
    get-context.ts
  services/
    learning-service.ts Business logic for CRUD + search + getContext
    embedding-service.ts Embedding provider abstraction
    ranking.ts          Pure ranking function for get_context
    budget.ts           Pure budget allocation/trimming for get_context
    index.ts            Service barrel export
  storage/
    storage-adapter.ts  StorageAdapter interface
    sqlite-adapter.ts   SQLite implementation
    storage-factory.ts  Factory for creating adapters
    migrations/
      001-initial.ts    Initial schema + FTS5 triggers
      002-duplicate-candidates.ts  Near-duplicate detection table
  models/
    learning.ts         Zod schemas + TypeScript types (core entity)
    repository.ts       Repository model
    workspace.ts        Workspace model (WS-AC-4)
    index.ts            Model barrel export
  utils/
    errors.ts           Typed error classes (MindKegError hierarchy)
    logger.ts           Pino logger → stderr
    index.ts            Utils barrel export

templates/
  AGENTS.md             Template users copy to their repos via `mindkeg init`

tests/
  unit/
    auth.test.ts
    budget.test.ts
    embedding-service.test.ts
    get-context.test.ts
    init.test.ts
    learning-service.test.ts
    models.test.ts
    ranking.test.ts
    stats.test.ts
    workspace.test.ts
  integration/
    e2e-sqlite.test.ts
    get-context.test.ts
    sqlite-adapter.test.ts

.github/workflows/
  ci.yml                CI: typecheck → lint → test → build (Node 22, ubuntu + windows)
  publish.yml           Publish to npm on GitHub release (with provenance)
```

## Code Conventions

### TypeScript
- Strict mode enabled (`strict: true`, `noUncheckedIndexedAccess: true` in tsconfig)
- ESM modules only (`"type": "module"` in package.json)
- Target: ES2022, module: ESNext, moduleResolution: bundler
- No `any` types — use `unknown` then narrow with type guards. ESLint warns on `@typescript-eslint/no-explicit-any`.
- Zod schemas are the source of truth for runtime validation
- All public functions and interfaces have JSDoc comments
- Path alias: `@/*` maps to `./src/*` (configured in tsconfig, resolved by tsup)

### Naming Patterns
- **Files**: kebab-case (`learning-service.ts`, `store-learning.ts`, `api-key.ts`)
- **Functions**: camelCase (`createMcpServer`, `registerStoreLearning`, `loadConfig`)
- **Interfaces/Types**: PascalCase (`StorageAdapter`, `Learning`, `LearningWithScore`)
- **Constants**: UPPER_SNAKE_CASE (`LEARNING_CATEGORIES`, `LEARNING_STATUSES`)
- **Zod schemas**: PascalCase with `Schema` suffix (`CreateLearningInputSchema`, `ConfigSchema`)
- **Test files**: Same name as source + `.test.ts` suffix (`models.test.ts`, `auth.test.ts`)

### Error Handling
- Always throw typed errors from `src/utils/errors.ts` — never raw strings or generic `new Error()`
- Error hierarchy: `MindKegError` (base) → `ValidationError`, `AuthError`, `AccessError`, `NotFoundError`, `EmbeddingError`, `StorageError`
- Each error has a `code` field (`ErrorCode` union type) and optional `details`
- MCP tool handlers catch all errors and return structured MCP error responses
- Log errors at `error` level before returning to client
- Type guard: `isMindKegError(err)` for narrowing

### Import Ordering
- Node.js built-ins first (`node:sqlite`, `node:crypto`, `node:path`)
- External packages second (`zod`, `commander`, `pino`, `@modelcontextprotocol/sdk`)
- Internal imports third with `.js` extension (required for ESM: `./tools/store-learning.js`)

### Module Organization
- One MCP tool per file in `src/tools/`
- Each tool file exports a `register*` function that takes `(server, learningService, storage, getApiKey)`
- Services hold business logic; tools are thin wrappers that parse input, call service, format response
- Storage adapter is interface-based for backend swappability
- Barrel exports (`index.ts`) in `services/`, `models/`, `utils/`

## Style & Formatting

- **ESLint config**: `.eslintrc.cjs` — extends `eslint:recommended` + `@typescript-eslint/recommended`
- **Key rules**:
  - `@typescript-eslint/no-explicit-any`: warn
  - `@typescript-eslint/explicit-function-return-type`: off
  - `@typescript-eslint/no-unused-vars`: error (with `argsIgnorePattern: '^_'` — prefix unused args with `_`)
  - `no-console`: off
- **No Prettier config** — formatting follows ESLint defaults and editor settings
- **No `.editorconfig`** detected

## Build, Run & Test Commands

### Prerequisites
- Node.js >= 22
- npm (package manager)
- Set `ONNX_RUNTIME_NODE_INSTALL_CUDA=skip` during `npm ci` to avoid CUDA binary download failures

### Commands

| Task | Command |
|---|---|
| Install dependencies | `npm ci` (CI) or `npm install` (dev) |
| Build | `npm run build` (uses tsup) |
| Dev (watch mode) | `npm run dev` (tsup --watch) |
| Run tests | `npm test` (vitest run) |
| Test watch mode | `npm run test:watch` (vitest) |
| Test with coverage | `npm run test:coverage` (vitest --coverage, v8 provider) |
| Lint | `npm run lint` (eslint src cli tests) |
| Typecheck | `npm run typecheck` (tsc --noEmit) |
| Serve (stdio) | `npm run serve:stdio` |
| Serve (HTTP) | `npm run serve:http` |

### Build Details
- **Bundler**: tsup (`tsup.config.ts`)
- **Format**: ESM only
- **Target**: node22
- **Output**: `dist/` directory
- **Entry points**: `src/index.ts` (server), `cli/index.ts` (CLI), plus subpath exports for `storage`, `services`, `models`, `utils`, `server`
- **DTS**: true (generates `.d.ts` files)
- **Sourcemaps**: true
- **Splitting**: false
- **Bundle**: true (all dependencies bundled)

### CLI Commands
The `mindkeg` CLI (`dist/cli/index.js`) provides:

| Command | Description |
|---|---|
| `mindkeg serve --stdio` | Start MCP server over stdio |
| `mindkeg serve --http` | Start MCP server over HTTP+SSE |
| `mindkeg api-key` | Generate, list, or revoke API keys |
| `mindkeg migrate` | Run database migrations |
| `mindkeg export` | Export learnings to JSON |
| `mindkeg import` | Import learnings from JSON |
| `mindkeg init` | Set up a project (copies AGENTS.md template) |
| `mindkeg stats` | Display database statistics |
| `mindkeg dedup-scan` | Backfill duplicate_candidates table for existing learnings |

## Testing Standards

- **Runner**: Vitest
- **Test locations**: `tests/unit/` and `tests/integration/`
- **Naming**: `<module>.test.ts` matching source module names
- **Integration tests**: Use in-memory or temp-file SQLite databases — no external services required
- **Coverage provider**: `@vitest/coverage-v8`
- **Mocking**: Tests should NOT require external services (OpenAI) unless explicitly tagged
- **Running a single test file**: `npx vitest run tests/unit/models.test.ts`
- **Running a single test by name**: `npx vitest run -t "test name pattern"`

## Git & PR Conventions

### Commit Messages
Conventional Commits style observed in recent history:
- `feat:` — new feature (`feat: add mindkeg stats command`)
- `fix:` — bug fix (`fix: skip CUDA binary download in CI`)
- `docs:` — documentation changes
- `ci:` — CI configuration
- `release:` — version releases

### Branch Strategy
- Main branch: `main`
- Feature branches merged to `main`

### CI Pipeline
CI runs on push to `main` and pull requests to `main`:
1. Typecheck (`npm run typecheck`)
2. Lint (`npm run lint`)
3. Test (`npm test`)
4. Build (`npm run build`)

Matrix: Ubuntu + Windows, Node.js 22.

### Publishing
- npm publish triggered by GitHub release events
- Includes `--provenance` flag for supply chain security
- Published with `--access public`

## Architecture & Patterns

### Design Patterns
- **Interface-based storage**: `StorageAdapter` interface with SQLite implementation. Allows future backend swaps.
- **Service layer**: `LearningService` encapsulates business logic (validation, embedding generation, CRUD orchestration). Tools are thin.
- **Factory pattern**: `storage-factory.ts` creates the appropriate adapter based on config.
- **Dependency injection**: `createMcpServer(deps)` receives storage, embedding, and auth dependencies.
- **Zod validation**: All external input validated through Zod schemas before reaching business logic.

### Storage
- All SQL uses parameterized queries (never string interpolation)
- SQLite: Node.js 22 built-in `node:sqlite` (`DatabaseSync`) — synchronous, like `better-sqlite3`
  - Uses `--experimental-sqlite` flag (enabled by default in Node 22+)
  - Do NOT use `async/await` for DB operations
- Tags stored as JSON text in SQLite
- Embedding stored as JSON text (float array) in SQLite
- FTS5 triggers maintain `learnings_fts` table on insert/update/delete

### MCP Tools Exposed

| Tool | Description |
|---|---|
| store_learning | Store a new atomic learning |
| search_learnings | Semantic/keyword search for relevant learnings |
| update_learning | Update content, category, tags of a learning |
| deprecate_learning | Mark a learning as deprecated |
| flag_stale | Flag a learning as potentially outdated |
| delete_learning | Permanently delete a learning |
| list_repositories | List all repos with learning counts |
| list_workspaces | List all workspaces with learning counts |
| get_context | Prime an agent session with all relevant learnings — ranked, partitioned by scope, and budget-trimmed |

### Data Model

- `content`: max 500 characters (enforced by Zod + DB constraint)
- `category`: exactly one of: `architecture`, `conventions`, `debugging`, `gotchas`, `dependencies`, `decisions`
- `repository`: null = global or workspace-scoped; set = repo-specific
- `workspace`: null = repo-specific or global; set = workspace-scoped (mutually exclusive with `repository`)
- Scope truth table: `repository` set → repo-specific; `workspace` set → workspace-wide; both null → global; both set → invalid (Zod refine rejects)
- `status`: `active` (default) | `deprecated` (excluded from search by default)
- `stale_flag`: boolean, set when an agent thinks a learning may be outdated
- `embedding`: float[] stored as JSON text (384 dims for FastEmbed, 1536 dims for OpenAI)
- `scope` field on `LearningWithScore`: `'repo' | 'workspace' | 'global'` — annotated on search results

### Logging
- Logger writes to **stderr** (`fd 2`) — never stdout — because stdout is used for MCP stdio protocol
- Use `getLogger()` from `src/utils/logger.ts`
- Log levels: debug (verbose), info (operational), warn (degraded), error (failure)
- Never log API keys, even partially (except the public prefix)

## Configuration (Environment Variables)

| Variable | Default | Description |
|---|---|---|
| MINDKEG_SQLITE_PATH | ~/.mindkeg/brain.db | SQLite database file path |
| MINDKEG_EMBEDDING_PROVIDER | fastembed | `"fastembed"`, `"openai"`, or `"none"` |
| OPENAI_API_KEY | (none) | OpenAI API key (when provider=openai) |
| MINDKEG_HOST | 127.0.0.1 | HTTP server bind address |
| MINDKEG_PORT | 52100 | HTTP server port |
| MINDKEG_LOG_LEVEL | info | debug / info / warn / error |
| MINDKEG_API_KEY | (none) | API key for stdio transport |

### Embedding Providers

- **`fastembed`** (default): Free, local ONNX-based embeddings via `BAAI/bge-small-en-v1.5` (384 dims). No API key needed. Model downloaded on first use (~50MB).
- **`openai`**: OpenAI `text-embedding-3-small` (1536 dims). Requires `OPENAI_API_KEY`. Best semantic quality.
- **`none`**: FTS5 keyword search fallback. No embeddings generated. A warning is logged at startup.

All CRUD operations work identically regardless of provider. Only search quality differs.

## Common Pitfalls

- **SQLite is synchronous**: `node:sqlite` (`DatabaseSync`) is synchronous. Do NOT use `await` on DB calls. This is different from most Node.js database libraries.
- **Logger must use stderr**: `pino` logger destination must be `fd 2` (stderr) or the MCP stdio transport breaks. Never write to stdout from server code.
- **API keys are displayed ONCE**: At creation time only. They are SHA-256 hashed and never retrievable afterward.
- **FTS5 trigger maintenance**: Insert/update/delete on `learnings` must sync the `learnings_fts` shadow table. The triggers are set up in `001-initial.ts` migration.
- **Port 52100**: Default HTTP port. Document this clearly for firewall rules.
- **ESM imports need `.js` extension**: Internal imports must use `.js` extension (e.g., `./tools/store-learning.js`) even though source files are `.ts`. This is required for ESM resolution.
- **Scope mutual exclusivity**: `repository` and `workspace` are mutually exclusive on learnings. Setting both is rejected by Zod validation. Check the refine rule in `CreateLearningInputSchema`.
- **CUDA skip in CI**: Set `ONNX_RUNTIME_NODE_INSTALL_CUDA=skip` during `npm ci` to prevent transient 502 failures when downloading CUDA binaries.
- **CLI version hardcoded**: The CLI displays version `0.1.0` in `cli/index.ts` line 19, but `package.json` is at `0.2.0`. These are out of sync.

## Agent Workflow

See [AGENTS.md](./AGENTS.md) for full agent documentation and delegation map.

**Project agents (from `.claude/agents/`):**
No project agents defined yet.

**Personal agents (from `~/.claude-personal/agents/`):**
- architecture-design
- bug-fixer
- bug-investigator
- commercialization-readiness-auditor
- docs-drift-auditor
- feature-executor
- implementation-planner
- mind-keg
- open-source-readiness-auditor
- oss-commercial-strategy
- platform-architecture-auditor
- product-spec-designer
- refactor-executor
- repo-auditor
- repo-docs-generator
- requirements-clarifier
- saas-pricing-strategist
- seo-strategy-analyst
- ui-spec-generator
- workflow-orchestrator

When working on tasks:
1. Check if the task maps to an existing agent from either list above.
2. If it does, delegate to that agent per its defined scope and constraints.
3. If no agent matches, work as the generalist with full repo context.
4. Always verify changes against the conventions in this file before committing.
5. Multi-agent tasks: execute sequentially per the ordering in AGENTS.md.

## Knowledge Capture

When studying, researching, or learning new technologies, frameworks, or concepts — **always store learnings in Mind Keg** using the `mind-keg` agent. This ensures knowledge is persisted across sessions and searchable later.

**When to invoke `mind-keg`:**
- After reading documentation, blog posts, or release notes
- After completing a study session or tutorial
- When discovering non-obvious patterns, gotchas, or best practices
- When the user explicitly asks to "remember" or "save" a learning
- At the end of any research or learning task — proactively offer to store learnings

**How to invoke:**
- Use the `mind-keg` agent via the Agent tool
- Ask the user for preferred scope (repository, workspace, or global) before storing
- Group related learnings logically rather than storing one at a time when possible
