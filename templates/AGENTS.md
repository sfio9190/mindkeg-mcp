# Mind Keg — Agent Instructions

You have access to **Mind Keg**, a persistent memory system. It stores atomic learnings — debugging insights, architectural decisions, codebase conventions, and gotchas — so you never lose context between sessions.

**You MUST follow these instructions in every session.**

## On Session Start

1. Determine the current repository path and workspace path (parent folder) from the working directory.

2. Call `get_context` to prime yourself with all relevant learnings in one call:

   ```
   get_context({ repository: "<current repo path>" })
   ```

   This returns learnings partitioned into `repo_learnings`, `workspace_learnings`, and `global_learnings`, ranked by actionability (gotchas first). It also surfaces `stale_review` items (learnings that may be outdated) and `near_duplicates` (redundant pairs for cleanup).

   **Optional parameters:**
   - `path_hint`: Subdirectory you're working in (e.g., `"packages/api"`) — boosts topically relevant learnings.
   - `query`: Topic focus (e.g., `"authentication"`) — applies semantic ranking boost.
   - `budget`: `"compact"`, `"standard"` (default), or `"full"` — controls how many learnings fit in the response.

3. If `get_context` returns a `stale_review` array with items, examine them. For each:
   - If the learning is confirmed outdated: use `deprecate_learning` and store a corrected version.
   - If you're unsure: leave it flagged (do not clear the flag).

4. If `get_context` returns `near_duplicates`, note the pairs. Offer to consolidate them at the end of the session.

5. For topic-specific work, use `search_learnings` to find learnings you know to look for. **You MUST search all three scopes explicitly** if you need targeted results:

   ```
   // Repo scope
   search_learnings({ query: "<short keywords>", repository: "<current repo path>" })

   // Workspace scope
   search_learnings({ query: "<short keywords>", workspace: "<parent folder path>" })

   // Global scope (omit both)
   search_learnings({ query: "<short keywords>" })
   ```

   Use **short, focused queries** (1-3 keywords). Semantic search performs poorly with long sentences.

6. Read the results and incorporate relevant learnings into your approach **before writing any code**.

## During the Session

- If you discover a **contradiction** with a stored learning, use `deprecate_learning` on the old one and store the corrected version with `store_learning`.
- If a learning seems **outdated but you're not sure**, use `flag_stale` to mark it for review instead of deleting it.

## On Session End (or After Significant Discoveries)

**Ask the user** if they want to save any learnings from the session:

> "I discovered some things during this session that might be useful for future work:
> - [learning 1]
> - [learning 2]
>
> Should I save these to Mind Keg?"

**CRITICAL — NEVER skip this step:**

Before storing ANY learning, you **MUST ask the user which scope applies**. Do NOT assume the scope — even if it seems obvious. Always ask explicitly:

> "Should this learning apply to:
> 1. **This repo only** (`repository`: `/path/to/current/repo`)
> 2. **All repos in this workspace** (`workspace`: `/path/to/parent/folder/`)
> 3. **Globally** (omit both)"

Wait for the user's answer before calling `store_learning`. If the user provides a blanket answer (e.g., "workspace for all of them"), apply it to all learnings in that batch.

Then use `store_learning` with the chosen scope. Always include:
- `repository` OR `workspace` (not both) — or omit both for global learnings
- `category`: one of `architecture`, `conventions`, `debugging`, `gotchas`, `dependencies`, `decisions`
- `tags`: relevant keywords for searchability
- `source`: your agent name (e.g., `"claude-code"`, `"cursor"`, `"windsurf"`, `"codex-cli"`)

---

## Tool Reference

### store_learning

Store a new atomic learning. Keep it short (1-3 sentences, max 500 characters).

Use `repository` for repo-specific learnings, `workspace` for workspace-wide learnings (all repos under the same parent folder), or omit both for global learnings. `repository` and `workspace` are mutually exclusive.

```json
{
  "content": "Always wrap Prisma client calls in try/catch — it throws on constraint violations, not returns null.",
  "category": "gotchas",
  "tags": ["prisma", "error-handling"],
  "repository": "/path/to/current/repo",
  "source": "your-agent-name"
}
```

Workspace-scoped example (applies to all repos under `/path/to/workspace/`):

```json
{
  "content": "All services in this workspace use OAuth 2.0 with PKCE — do not use implicit flow.",
  "category": "conventions",
  "tags": ["auth", "oauth"],
  "workspace": "/path/to/workspace/",
  "source": "your-agent-name"
}
```

### search_learnings

Search for relevant learnings. Each scope requires its own search call:
- Use `repository` to search **repo-scoped** learnings
- Use `workspace` to search **workspace-scoped** learnings
- Omit both to search **global** learnings

**Always search all three scopes** to get complete results. The `repository` parameter does NOT automatically include workspace-scoped learnings.

```json
// Repo scope
{ "query": "how to handle database migrations", "repository": "/path/to/current/repo" }

// Workspace scope
{ "query": "how to handle database migrations", "workspace": "/path/to/parent/folder/" }

// Global scope
{ "query": "how to handle database migrations" }
```

### update_learning

Update an existing learning's content, category, or tags.

```json
{
  "id": "uuid-of-the-learning",
  "content": "Updated content here.",
  "tags": ["updated", "tags"]
}
```

### deprecate_learning

Mark a learning as outdated. Deprecated learnings are excluded from search by default.

```json
{
  "id": "uuid-of-the-learning",
  "reason": "This approach was replaced with X in PR #123."
}
```

### flag_stale

Flag a learning as potentially stale when you notice contradictions or suspect it's outdated. Unlike deprecation, this is a soft flag — the learning still appears in search results.

```json
{
  "id": "uuid-of-the-learning",
  "reason": "Batch limit may have been increased to 200 based on recent changes."
}
```

### delete_learning

Permanently delete a learning. Prefer `deprecate_learning` for auditability.

```json
{
  "id": "uuid-of-the-learning"
}
```

### list_repositories

List all repositories that have stored learnings.

```json
{}
```

### list_workspaces

List all workspace directories that have workspace-scoped learnings, along with the learning count per workspace.

```json
{}
```

### get_context

Prime an agent session with all relevant learnings for the current repository in one call. Returns learnings ranked by actionability, partitioned by scope, and trimmed to a character budget. Always safe to call — read-only.

```json
{
  "repository": "/path/to/current/repo",
  "path_hint": "packages/api",
  "query": "authentication",
  "budget": "standard"
}
```

Response sections:
- `repo_learnings`: Repo-scoped learnings (ranked: gotchas → conventions → decisions → dependencies)
- `workspace_learnings`: Workspace-scoped learnings
- `global_learnings`: Global learnings
- `stale_review`: Stale-flagged learnings for your attention
- `near_duplicates`: Near-duplicate pairs to consider consolidating
- `summary`: Counts per scope and most-recent `last_updated` timestamp

---

## What Makes a Good Learning?

- **Atomic**: One insight per entry. Don't bundle multiple unrelated facts.
- **Actionable**: Describes what to DO or AVOID, not just what exists.
- **Specific**: Mentions concrete context (library name, file path, pattern name).
- **Brief**: 1-3 sentences. Max 500 characters. If it's longer, split it.

**Good:**
- "Always wrap Prisma client calls in try/catch — it throws on constraint violations, not returns null."
- "The `useAuth` hook must be called inside `AuthProvider` — calling it at the page level causes an infinite loop."
- "This repo uses `pnpm` workspaces — do not use `npm install`; it will break the lockfile."

**Bad:**
- "Be careful with the database." (not actionable)
- "The codebase uses TypeScript." (not an insight)
- Long multi-paragraph descriptions (not atomic — split into separate learnings)

## Categories

| Category | When to Use |
|---|---|
| `architecture` | System design decisions, patterns, module structure |
| `conventions` | Code style, naming, formatting rules specific to this project |
| `debugging` | How specific bugs were diagnosed and fixed |
| `gotchas` | Surprising behaviors, footguns, things that break unexpectedly |
| `dependencies` | Library-specific behaviors, version constraints, breaking changes |
| `decisions` | Why a specific approach was chosen over alternatives |
