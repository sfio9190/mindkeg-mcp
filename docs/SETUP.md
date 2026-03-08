# Mind Keg MCP — Setup Guide

Complete guide to installing, configuring, and connecting Mind Keg to your AI coding agent.

---

## Prerequisites

### Node.js 22+

Mind Keg requires **Node.js 22 or later** (uses the built-in `node:sqlite` module).

```bash
node --version
# Must be v22.x or higher
```

If you need to install or upgrade:

- **nvm (macOS/Linux/WSL)**: `nvm install 22 && nvm use 22`
- **nvm-windows**: `nvm install 22 && nvm use 22`
- **fnm**: `fnm install 22 && fnm use 22`
- **Direct download**: [nodejs.org](https://nodejs.org/)

---

## Step 1: Install Mind Keg

### Option A: npm (recommended)

```bash
npm install -g mindkeg-mcp
```

### Option B: From source

```bash
git clone https://github.com/user/mindkeg-mcp.git
cd mindkeg-mcp
npm install
npm run build
```

When running from source, replace `mindkeg` with `node --experimental-sqlite dist/cli/index.js` in all commands below.

---

## Step 2: Create an API Key

Mind Keg requires an API key for authentication, even for local use.

```bash
mindkeg api-key create --name "My Laptop"
```

Output:

```
API key created successfully!

  Key:    mk_4e305d5c841bc91ec56e35427fb848d0...
  Prefix: 4e305d5c
  Name:   My Laptop
  Access: All repositories

IMPORTANT: This key will not be shown again. Store it securely.
```

**Copy the full `mk_...` key** — you will need it in the next step. It is displayed once and cannot be retrieved afterward.

### Optional: Restrict access to specific repositories

```bash
mindkeg api-key create --name "Work Key" --repositories /path/to/repo-a /path/to/repo-b
```

### Manage keys

```bash
mindkeg api-key list            # List all keys (shows prefix + name only)
mindkeg api-key revoke <prefix> # Revoke a key by its prefix
```

---

## Step 3: Choose an Embedding Provider

Mind Keg supports three embedding providers. This controls how `search_learnings` finds relevant results.

### FastEmbed (default) — Free, local, no API key

Semantic search works out of the box. Uses the `BAAI/bge-small-en-v1.5` model (384 dimensions) via local ONNX Runtime.

- **No configuration needed** — this is the default.
- On first use, the model is downloaded automatically (~50MB). This is a one-time download; subsequent starts are instant.
- All processing happens locally. No network calls after the initial download.

### OpenAI — Paid, best semantic quality

Uses `text-embedding-3-small` (1536 dimensions). Best search quality but requires an API key and incurs per-request costs.

Set these environment variables:

```bash
export MINDKEG_EMBEDDING_PROVIDER=openai
export OPENAI_API_KEY=sk-your-key-here
```

Or pass them in your MCP client config (see Step 4).

### None — Keyword search only

Falls back to SQLite FTS5 full-text search. No embeddings generated. All other features (store, update, delete, etc.) work identically.

```bash
export MINDKEG_EMBEDDING_PROVIDER=none
```

Use this if you want zero external dependencies and are fine with exact keyword matching instead of semantic search.

### Which should I pick?

| Provider | Cost | Quality | Setup | Best for |
|----------|------|---------|-------|----------|
| **FastEmbed** | Free | Good | None | Most users (recommended) |
| **OpenAI** | ~$0.02/1M tokens | Best | API key | Teams needing highest accuracy |
| **None** | Free | Basic | None | Minimal installs, air-gapped environments |

---

## Step 4: Connect Your AI Agent

Mind Keg uses the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) and works with any compatible agent. Choose your setup below.

> **Embedding provider note**: The examples below use FastEmbed (the default). To use a different provider, add `MINDKEG_EMBEDDING_PROVIDER` and any required keys (e.g., `OPENAI_API_KEY`) to the `env` block.

### Claude Code

**Option A: CLI command (global)**

```bash
claude mcp add -e MINDKEG_API_KEY=mk_your_key_here -s user mindkeg -- mindkeg serve --stdio
```

**Option B: Per-project `.mcp.json`** (create in your repo root)

```json
{
  "mcpServers": {
    "mindkeg": {
      "command": "mindkeg",
      "args": ["serve", "--stdio"],
      "env": {
        "MINDKEG_API_KEY": "mk_your_key_here"
      }
    }
  }
}
```

> **Claude Code + OpenAI embeddings**: Add `"MINDKEG_EMBEDDING_PROVIDER": "openai"` and `"OPENAI_API_KEY": "sk-..."` to the `env` block.

Verify it was added:

```bash
claude mcp list
```

### Cursor

Add to `.cursor/mcp.json` in your project or your global Cursor MCP settings:

```json
{
  "mcpServers": {
    "mindkeg": {
      "command": "mindkeg",
      "args": ["serve", "--stdio"],
      "env": {
        "MINDKEG_API_KEY": "mk_your_key_here"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "mindkeg": {
      "command": "mindkeg",
      "args": ["serve", "--stdio"],
      "env": {
        "MINDKEG_API_KEY": "mk_your_key_here"
      }
    }
  }
}
```

### Codex CLI / Gemini CLI / Other MCP agents

Use the same stdio config adapted to your agent's MCP settings format:

- **Command**: `mindkeg`
- **Args**: `["serve", "--stdio"]`
- **Env**: `{ "MINDKEG_API_KEY": "mk_your_key_here" }`

### HTTP mode (remote / multi-client)

For agents that connect via HTTP instead of stdio:

```bash
MINDKEG_API_KEY=mk_your_key mindkeg serve --http
# Listening on http://127.0.0.1:52100/mcp
```

Then configure your MCP client:

```json
{
  "mcpServers": {
    "mindkeg": {
      "type": "http",
      "url": "http://127.0.0.1:52100/mcp",
      "headers": {
        "Authorization": "Bearer mk_your_key_here"
      }
    }
  }
}
```

### Running from source (any agent)

If you installed from source instead of npm, replace `mindkeg` with the full path:

```json
{
  "mcpServers": {
    "mindkeg": {
      "command": "node",
      "args": [
        "--experimental-sqlite",
        "/path/to/mindkeg-mcp/dist/cli/index.js",
        "serve",
        "--stdio"
      ],
      "env": {
        "MINDKEG_API_KEY": "mk_your_key_here"
      }
    }
  }
}
```

> **Windows paths**: Use double backslashes in JSON (`C:\\Users\\you\\mindkeg-mcp\\dist\\cli\\index.js`) or forward slashes (`C:/Users/you/mindkeg-mcp/dist/cli/index.js`).

---

## Step 5: Add Agent Instructions to Your Repository

Copy the `AGENTS.md` template to the root of any repository where you want agents to use Mind Keg:

```bash
# If installed globally via npm
cp $(npm root -g)/mindkeg-mcp/templates/AGENTS.md ./AGENTS.md

# If installed from source
cp /path/to/mindkeg-mcp/templates/AGENTS.md ./AGENTS.md
```

`AGENTS.md` is the industry standard — it works natively with Cursor, Windsurf, Codex CLI, Gemini CLI, GitHub Copilot, and 20+ other tools.

### Claude Code only

Claude Code does not auto-load `AGENTS.md`. Add this line to your `CLAUDE.md` (create it if it does not exist):

```markdown
@AGENTS.md
```

This tells Claude Code to import the Mind Keg instructions.

### What do the instructions do?

Without `AGENTS.md`, the MCP tools are available but the agent will not know to:
- Search for learnings at the start of each session
- Offer to save new learnings after discovering something useful
- Use the correct repository/workspace path when storing and searching

---

## Step 6: Verify the Setup

Restart your AI agent (or start a new session) so it picks up the MCP configuration.

Ask your agent:

```
Can you list the tools available from the mindkeg MCP server?
```

You should see these 8 tools:

| Tool | Description |
|------|-------------|
| `store_learning` | Store a new atomic learning |
| `search_learnings` | Semantic/keyword search for relevant learnings |
| `update_learning` | Update content, category, or tags |
| `deprecate_learning` | Mark a learning as deprecated |
| `flag_stale` | Flag a learning as potentially outdated |
| `delete_learning` | Permanently delete a learning |
| `list_repositories` | List all repositories with learning counts |
| `list_workspaces` | List all workspaces with learning counts |

### Quick smoke test

Ask your agent:

```
Store a learning in Mind Keg: "This is a test learning to verify the setup works" — category: debugging, tags: test, setup
```

Then:

```
Search Mind Keg for learnings about setup
```

If the learning is returned, everything is working.

---

## Configuration Reference

All configuration is via environment variables. Set them in your shell or in the MCP client's `env` block.

| Variable | Default | Description |
|----------|---------|-------------|
| `MINDKEG_API_KEY` | (none) | API key for authentication |
| `MINDKEG_EMBEDDING_PROVIDER` | `fastembed` | `fastembed`, `openai`, or `none` |
| `OPENAI_API_KEY` | (none) | Required when provider is `openai` |
| `MINDKEG_SQLITE_PATH` | `~/.mindkeg/brain.db` | SQLite database file path |
| `MINDKEG_HOST` | `127.0.0.1` | HTTP server bind address |
| `MINDKEG_PORT` | `52100` | HTTP server port |
| `MINDKEG_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

---

## Troubleshooting

### "Failed to load node:sqlite" or sqlite-related errors

- Ensure Node.js >= 22: `node --version`
- If running from source, make sure `--experimental-sqlite` is in the args array

### MCP server not found / tools not appearing

- Restart your AI agent after changing MCP configuration
- Verify the server is registered: `claude mcp list` (Claude Code) or check your agent's MCP settings
- Check that the path to `mindkeg` (or `dist/cli/index.js`) is correct

### "AUTH_ERROR: API key is required"

- Confirm `MINDKEG_API_KEY` is set in the MCP client's `env` block
- Verify the key has not been revoked: `mindkeg api-key list`

### First search is slow (FastEmbed)

- On the very first use, FastEmbed downloads the ONNX model (~50MB). This is a one-time download. Subsequent starts load from the local cache instantly.
- If you are behind a firewall or proxy, ensure access to Hugging Face model downloads. Alternatively, switch to `MINDKEG_EMBEDDING_PROVIDER=none` to skip embeddings entirely.

### Search returns 0 results

- **FTS5 (keyword mode)** requires exact word matches — try shorter, single-word queries
- **Semantic search (FastEmbed/OpenAI)** works best with short queries (1-3 keywords), not full sentences
- Ensure you are searching the correct scope — repo, workspace, and global are searched separately

### PowerShell quoting issues (Windows)

When using `claude mcp add` in PowerShell, wrap `--` and flags in single quotes:

```powershell
claude mcp add -e MINDKEG_API_KEY=mk_YOUR_KEY -s user mindkeg '--' mindkeg serve '--stdio'
```

Alternatively, use a `.mcp.json` file instead — it avoids all shell quoting issues.

---

## Uninstall

Remove the MCP server from your agent:

```bash
# Claude Code
claude mcp remove mindkeg -s user

# Other agents: remove the mindkeg entry from your MCP config file
```

Delete the database:

```bash
rm -rf ~/.mindkeg/
```

Uninstall the package:

```bash
npm uninstall -g mindkeg-mcp
```

Remove `AGENTS.md` and the `@AGENTS.md` line from `CLAUDE.md` in any repositories where you added them.
