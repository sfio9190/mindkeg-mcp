/**
 * Unit tests for AuditLogger.
 * Traces to ESH-AC-5, ESH-AC-6, ESH-AC-7, ESH-AC-8.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { AuditLogger, createNoopAuditLogger } from '../../src/audit/audit-logger.js';
import type { AuditEntry } from '../../src/audit/audit-logger.js';

function makeSampleEntry(overrides?: Partial<AuditEntry>): AuditEntry {
  return {
    timestamp: '2024-01-01T00:00:00.000Z',
    action: 'store_learning',
    actor: 'mk_abc123',
    resource_id: 'uuid-1234',
    result: 'success',
    client: { transport: 'stdio', pid: 12345 },
    ...overrides,
  };
}

describe('AuditLogger — file destination (ESH-AC-5, ESH-AC-7, ESH-AC-8)', () => {
  const testPath = '/tmp/mindkeg-test-audit.jsonl';

  beforeEach(() => {
    // Remove test file before each test
    try { fs.unlinkSync(testPath); } catch { /* ok */ }
  });

  afterEach(() => {
    try { fs.unlinkSync(testPath); } catch { /* ok */ }
  });

  it('writes a JSON line to the configured file', () => {
    const logger = new AuditLogger(testPath);
    const entry = makeSampleEntry();

    logger.log(entry);

    const content = fs.readFileSync(testPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]!);
    expect(parsed.action).toBe('store_learning');
    expect(parsed.actor).toBe('mk_abc123');
    expect(parsed.result).toBe('success');
    expect(parsed.timestamp).toBe('2024-01-01T00:00:00.000Z');
  });

  it('appends multiple entries as separate JSON lines (ESH-AC-8)', () => {
    const logger = new AuditLogger(testPath);

    logger.log(makeSampleEntry({ action: 'store_learning' }));
    logger.log(makeSampleEntry({ action: 'search_learnings' }));
    logger.log(makeSampleEntry({ action: 'delete_learning' }));

    const content = fs.readFileSync(testPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);

    const actions = lines.map((l) => JSON.parse(l).action);
    expect(actions).toEqual(['store_learning', 'search_learnings', 'delete_learning']);
  });

  it('entry includes all required fields (ESH-AC-6)', () => {
    const logger = new AuditLogger(testPath);
    const entry: AuditEntry = {
      timestamp: '2024-01-01T12:00:00.000Z',
      action: 'update_learning',
      actor: 'mk_prefix',
      resource_id: 'resource-uuid',
      result: 'error',
      error_code: 'NOT_FOUND_ERROR',
      client: { transport: 'http', ip: '192.168.1.1' },
      metadata: { repository: '/repo' },
    };

    logger.log(entry);

    const parsed = JSON.parse(fs.readFileSync(testPath, 'utf8').trim());
    expect(parsed.timestamp).toBe('2024-01-01T12:00:00.000Z');
    expect(parsed.action).toBe('update_learning');
    expect(parsed.actor).toBe('mk_prefix');
    expect(parsed.resource_id).toBe('resource-uuid');
    expect(parsed.result).toBe('error');
    expect(parsed.error_code).toBe('NOT_FOUND_ERROR');
    expect(parsed.client.transport).toBe('http');
    expect(parsed.client.ip).toBe('192.168.1.1');
    expect(parsed.metadata.repository).toBe('/repo');
  });

  it('does NOT include content or embedding in entries (ESH-AC-9)', () => {
    const logger = new AuditLogger(testPath);
    // The entry schema does not have content/embedding fields at all
    const entry = makeSampleEntry({
      metadata: { category: 'gotchas', result_count: 5 },
    });

    logger.log(entry);

    const parsed = JSON.parse(fs.readFileSync(testPath, 'utf8').trim());
    expect(parsed).not.toHaveProperty('content');
    expect(parsed).not.toHaveProperty('embedding');
    // metadata should only have allowed fields
    expect(parsed.metadata.category).toBe('gotchas');
    expect(parsed.metadata.result_count).toBe(5);
  });
});

describe('AuditLogger — stderr destination (ESH-AC-7)', () => {
  it('writes to stderr with audit:true marker when destination is "stderr"', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = new AuditLogger('stderr');

    logger.log(makeSampleEntry());

    expect(writeSpy).toHaveBeenCalledOnce();
    const written = writeSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed.audit).toBe(true);
    expect(parsed.action).toBe('store_learning');

    writeSpy.mockRestore();
  });
});

describe('AuditLogger — none destination (ESH-AC-7)', () => {
  it('does not throw and does not write to stderr when destination is "none"', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = new AuditLogger('none');

    // Should not throw
    expect(() => logger.log(makeSampleEntry())).not.toThrow();

    // Must not write to stderr
    expect(stderrSpy).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
  });

  it('does not create a file when destination is "none"', () => {
    // 'none' is not a file path — no file should ever be written
    const logger = new AuditLogger('none');
    logger.log(makeSampleEntry());
    // If no exception thrown and no fs side effect, the logger is properly no-op
    expect(fs.existsSync('none')).toBe(false);
  });
});

describe('AuditLogger.logEntry', () => {
  const testPath = '/tmp/mindkeg-test-audit-logentry.jsonl';

  afterEach(() => {
    try { fs.unlinkSync(testPath); } catch { /* ok */ }
  });

  it('logs the provided AuditEntry directly', () => {
    const logger = new AuditLogger(testPath);
    const entry = makeSampleEntry({ action: 'get_context' });

    logger.logEntry(entry);

    const parsed = JSON.parse(fs.readFileSync(testPath, 'utf8').trim());
    expect(parsed.action).toBe('get_context');
    expect(parsed.timestamp).toBe('2024-01-01T00:00:00.000Z');
  });
});

describe('createNoopAuditLogger', () => {
  it('does not throw when logging', () => {
    const noop = createNoopAuditLogger();
    expect(() => noop.log(makeSampleEntry())).not.toThrow();
    expect(() => noop.logEntry(makeSampleEntry())).not.toThrow();
  });
});
