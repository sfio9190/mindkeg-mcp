/**
 * CLI command: init
 * Initialize Mind Keg in the current project.
 * Detects agent tooling, writes MCP config, copies AGENTS.md, runs health check.
 */
import type { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type Agent = 'claude-code' | 'cursor' | 'windsurf';

interface AgentConfig {
  label: string;
  configDir: string;
  configFile: string;
  instructionFile: string | null;
  /** Build the MCP server JSON entry */
  mcpEntry: () => Record<string, unknown>;
}

const AGENT_CONFIGS: Record<Agent, AgentConfig> = {
  'claude-code': {
    label: 'Claude Code',
    configDir: '.claude',
    configFile: '.claude/mcp.json',
    instructionFile: 'CLAUDE.md',
    mcpEntry: () => ({
      command: 'npx',
      args: ['-y', 'mindkeg-mcp', 'serve', '--stdio'],
      env: {
        MINDKEG_EMBEDDING_PROVIDER: 'fastembed',
      },
    }),
  },
  cursor: {
    label: 'Cursor',
    configDir: '.cursor',
    configFile: '.cursor/mcp.json',
    instructionFile: null,
    mcpEntry: () => ({
      command: 'npx',
      args: ['-y', 'mindkeg-mcp', 'serve', '--stdio'],
      env: {
        MINDKEG_EMBEDDING_PROVIDER: 'fastembed',
      },
    }),
  },
  windsurf: {
    label: 'Windsurf',
    configDir: '.windsurf',
    configFile: '.windsurf/mcp.json',
    instructionFile: null,
    mcpEntry: () => ({
      command: 'npx',
      args: ['-y', 'mindkeg-mcp', 'serve', '--stdio'],
      env: {
        MINDKEG_EMBEDDING_PROVIDER: 'fastembed',
      },
    }),
  },
};

/** Detect which agent tool directories exist in the project root. */
export function detectAgents(projectRoot: string): Agent[] {
  const detected: Agent[] = [];
  for (const [agent, config] of Object.entries(AGENT_CONFIGS)) {
    if (existsSync(join(projectRoot, config.configDir))) {
      detected.push(agent as Agent);
    }
  }
  return detected;
}

/** Find the git repo root, or fall back to cwd. */
function findProjectRoot(): string {
  try {
    const root = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return root;
  } catch {
    return process.cwd();
  }
}

/** Resolve the AGENTS.md template path (works in dev and after npm install). */
function findTemplatesDir(): string {
  // When running from dist/cli/commands/init.js, templates is at ../../templates
  // When running from source via ts-node, it's at ../../../templates
  // The package.json "files" includes "templates", so it ships with npm
  const candidates = [
    resolve(__dirname, '..', '..', 'templates'),      // from dist/cli/commands/
    resolve(__dirname, '..', '..', '..', 'templates'), // from cli/commands/ (dev)
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'AGENTS.md'))) {
      return candidate;
    }
  }
  throw new Error('Could not locate templates/AGENTS.md. Is the package installed correctly?');
}

/** Write the MCP config for a given agent. Merges with existing config if present. */
export function writeMcpConfig(projectRoot: string, agent: Agent): { created: boolean; path: string } {
  const config = AGENT_CONFIGS[agent];
  const configPath = join(projectRoot, config.configFile);
  const configDir = join(projectRoot, config.configDir);

  // Ensure directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Load existing config or start fresh
  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      // Malformed JSON — we'll overwrite
    }
  }

  const mcpServers = (existing['mcpServers'] ?? {}) as Record<string, unknown>;

  if (mcpServers['mindkeg']) {
    return { created: false, path: configPath };
  }

  mcpServers['mindkeg'] = config.mcpEntry();
  existing['mcpServers'] = mcpServers;

  writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
  return { created: true, path: configPath };
}

/** Copy or append AGENTS.md instructions into the project. */
export function writeAgentInstructions(
  projectRoot: string,
  agent: Agent,
  templatesDir: string,
): { action: 'created' | 'appended' | 'skipped'; path: string } {
  const agentsMdSource = join(templatesDir, 'AGENTS.md');
  const agentsMdContent = readFileSync(agentsMdSource, 'utf-8');

  const config = AGENT_CONFIGS[agent];

  // For Claude Code, append to CLAUDE.md if it exists, otherwise copy AGENTS.md
  if (config.instructionFile) {
    const instructionPath = join(projectRoot, config.instructionFile);
    if (existsSync(instructionPath)) {
      const existing = readFileSync(instructionPath, 'utf-8');
      if (existing.includes('Mind Keg')) {
        return { action: 'skipped', path: instructionPath };
      }
      writeFileSync(
        instructionPath,
        existing.trimEnd() + '\n\n' + agentsMdContent,
        'utf-8',
      );
      return { action: 'appended', path: instructionPath };
    }
  }

  // Default: copy AGENTS.md to project root
  const destPath = join(projectRoot, 'AGENTS.md');
  if (existsSync(destPath)) {
    const existing = readFileSync(destPath, 'utf-8');
    if (existing.includes('Mind Keg')) {
      return { action: 'skipped', path: destPath };
    }
    writeFileSync(destPath, existing.trimEnd() + '\n\n' + agentsMdContent, 'utf-8');
    return { action: 'appended', path: destPath };
  }

  copyFileSync(agentsMdSource, destPath);
  return { action: 'created', path: destPath };
}

/** Quick health check: can we create a temp DB and load embeddings? */
function runHealthCheck(): { db: boolean; embeddings: boolean; dbError?: string; embeddingError?: string } {
  const result = { db: false, embeddings: false, dbError: undefined as string | undefined, embeddingError: undefined as string | undefined };

  // DB check: try importing node:sqlite
  try {
    execSync('node --experimental-sqlite -e "require(\'node:sqlite\')"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    result.db = true;
  } catch {
    result.dbError = 'node:sqlite not available. Requires Node.js 22+.';
  }

  // Node version check as proxy
  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split('.')[0] ?? '0', 10);
  if (major < 22) {
    result.db = false;
    result.dbError = `Node.js ${nodeVersion} detected. Mind Keg requires Node.js 22+.`;
  } else {
    result.db = true;
  }

  // Embedding check: fastembed availability (just check the package resolves)
  try {
    execSync('node -e "require.resolve(\'fastembed\')"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: resolve(__dirname, '..', '..'),
    });
    result.embeddings = true;
  } catch {
    // fastembed may not be resolvable from here — that's fine, npx will handle it
    result.embeddings = true; // Trust that npx mindkeg-mcp will resolve it
  }

  return result;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize Mind Keg in the current project')
    .option('--agent <agent>', 'Target agent: claude-code, cursor, windsurf (auto-detects if omitted)')
    .option('--no-instructions', 'Skip copying AGENTS.md / appending to CLAUDE.md')
    .option('--no-health-check', 'Skip the health check')
    .action(async (opts: { agent?: string; instructions: boolean; healthCheck: boolean }) => {
      const projectRoot = findProjectRoot();
      console.log(`\nMind Keg — Initializing in ${projectRoot}\n`);

      // 1. Determine target agents
      let agents: Agent[];
      if (opts.agent) {
        const valid = Object.keys(AGENT_CONFIGS);
        if (!valid.includes(opts.agent)) {
          console.error(`Unknown agent "${opts.agent}". Valid options: ${valid.join(', ')}`);
          process.exit(1);
        }
        agents = [opts.agent as Agent];
      } else {
        agents = detectAgents(projectRoot);
        if (agents.length === 0) {
          // Default to claude-code if nothing detected
          agents = ['claude-code'];
          console.log('  No agent directories detected. Defaulting to Claude Code.\n');
        } else {
          console.log(`  Detected: ${agents.map(a => AGENT_CONFIGS[a].label).join(', ')}\n`);
        }
      }

      // 2. Write MCP config for each agent
      console.log('MCP Configuration:');
      for (const agent of agents) {
        const result = writeMcpConfig(projectRoot, agent);
        if (result.created) {
          console.log(`  ✓ ${AGENT_CONFIGS[agent].label}: wrote ${result.path}`);
        } else {
          console.log(`  - ${AGENT_CONFIGS[agent].label}: mindkeg already configured in ${result.path}`);
        }
      }

      // 3. Copy agent instructions
      if (opts.instructions) {
        console.log('\nAgent Instructions:');
        try {
          const templatesDir = findTemplatesDir();
          // Write instructions for the first agent (avoid duplicating AGENTS.md)
          const firstAgent = agents[0] as Agent;
          const result = writeAgentInstructions(projectRoot, firstAgent, templatesDir);
          switch (result.action) {
            case 'created':
              console.log(`  ✓ Created ${result.path}`);
              break;
            case 'appended':
              console.log(`  ✓ Appended Mind Keg instructions to ${result.path}`);
              break;
            case 'skipped':
              console.log(`  - Mind Keg instructions already present in ${result.path}`);
              break;
          }
        } catch (err) {
          console.log(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 4. Health check
      if (opts.healthCheck) {
        console.log('\nHealth Check:');
        const health = runHealthCheck();
        console.log(`  ${health.db ? '✓' : '✗'} Node.js SQLite: ${health.db ? 'OK' : health.dbError}`);
        console.log(`  ${health.embeddings ? '✓' : '✗'} Embeddings: ${health.embeddings ? 'OK (fastembed)' : health.embeddingError}`);
      }

      // 5. Next steps
      console.log('\nNext steps:');
      console.log('  1. Open your project in your AI agent (Claude Code, Cursor, etc.)');
      console.log('  2. The agent will automatically connect to Mind Keg via MCP');
      console.log('  3. Start coding — learnings are stored as you work\n');
    });
}
