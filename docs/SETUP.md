# Setup Guide

Requires **Node.js 22+** (`node --version` to check).

## 1. Install

**Option A: npm (recommended)**

```bash
npm install -g mindkeg-mcp
```

**Option B: From source**

```bash
git clone https://github.com/carloluisito/mindkeg-mcp.git
cd mindkeg-mcp && npm install && npm run build
```

## 2. Create an API Key

If installed via npm:
```bash
mindkeg api-key create --name "My Laptop"
```

If installed from source:
```bash
node --experimental-sqlite dist/cli/index.js api-key create --name "My Laptop"
```

Copy the `mk_...` key — it's shown once and can't be retrieved later.

## 3. Connect Your Agent

Add the MCP config to your agent, replacing the API key with yours.

**If installed via npm:**

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

**If installed from source** (replace the path with your actual clone location):

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

> **Windows paths**: Use forward slashes (`C:/Users/you/mindkeg-mcp/dist/cli/index.js`) or double backslashes (`C:\\Users\\you\\...`) in JSON.

**Where to put it:**

| Agent | Config file |
|-------|-------------|
| Claude Code | `.mcp.json` in project root (per-project) or `~/.claude.json` (global) |
| Cursor | `.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Others | See your agent's MCP docs |

<details>
<summary><strong>Claude Code CLI alternative</strong></summary>

If installed via npm:

Bash / zsh:
```bash
claude mcp add -e MINDKEG_API_KEY=mk_your_key -s user mindkeg -- mindkeg serve --stdio
```

PowerShell:
```powershell
claude mcp add -e MINDKEG_API_KEY=mk_your_key -s user mindkeg '--' mindkeg serve '--stdio'
```

CMD:
```cmd
claude mcp add -e MINDKEG_API_KEY=mk_your_key -s user mindkeg "--" mindkeg serve "--stdio"
```

If installed from source:

Bash / zsh:
```bash
claude mcp add -e MINDKEG_API_KEY=mk_your_key -s user mindkeg -- node --experimental-sqlite /path/to/mindkeg-mcp/dist/cli/index.js serve --stdio
```

PowerShell:
```powershell
claude mcp add -e MINDKEG_API_KEY=mk_your_key_here -s user mindkeg '--' node '--experimental-sqlite' C:\path\to\mindkeg-mcp\dist\cli\index.js serve '--stdio'
```

CMD:
```cmd
claude mcp add -e MINDKEG_API_KEY=mk_your_key -s user mindkeg "--" node "--experimental-sqlite" C:\path\to\mindkeg-mcp\dist\cli\index.js serve "--stdio"
```

</details>

## 4. Add Agent Instructions

Copy `templates/AGENTS.md` to any repo where you want agents to use Mind Keg:

```bash
# If installed via npm
cp $(npm root -g)/mindkeg-mcp/templates/AGENTS.md ./AGENTS.md

# If installed from source
cp /path/to/mindkeg-mcp/templates/AGENTS.md ./AGENTS.md
```

**Claude Code only** — also add `@AGENTS.md` to your `CLAUDE.md` file (Claude Code doesn't auto-load `AGENTS.md`).

## 5. Verify

Restart your agent and ask:

> "Store a learning: 'Test learning to verify setup' — category: debugging, tags: test"

Then: "Search Mind Keg for test". If it returns your learning, you're set.

---

## Embedding Providers

Semantic search works out of the box with **FastEmbed** (free, local, no config needed). On first use it downloads ~50MB — subsequent starts are instant.

To use a different provider, add to the `env` block in your MCP config:

**OpenAI** (best quality, paid):
```json
"MINDKEG_EMBEDDING_PROVIDER": "openai",
"OPENAI_API_KEY": "sk-..."
```

**None** (keyword search only, zero dependencies):
```json
"MINDKEG_EMBEDDING_PROVIDER": "none"
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| MCP server fails to start | If installed from source, make sure you ran `npm run build` and the config points to the correct `dist/cli/index.js` path. |
| "Failed to load node:sqlite" | Ensure Node.js >= 22. If running from source, include `--experimental-sqlite` in args. |
| Tools not appearing | Restart your agent. Check `claude mcp list` or your config file. |
| "AUTH_ERROR: API key is required" | Check `MINDKEG_API_KEY` in your MCP env block. Verify key isn't revoked: `mindkeg api-key list` |
| First search is slow | FastEmbed downloads the model (~50MB) on first use. One-time only. |
| Search returns 0 results | Use short queries (1-3 keywords). Check you're searching the right scope (repo/workspace/global). |
| `claude mcp add` fails on Windows | PowerShell and CMD interpret `--` and `--stdio` as their own flags. Wrap them in quotes: `'--'` and `'--stdio'` (PowerShell) or `"--"` and `"--stdio"` (CMD). Or use a `.mcp.json` file instead. |
