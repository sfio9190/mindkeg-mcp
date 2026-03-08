/**
 * Unit tests for the workspace derivation utility.
 * Traces to WS-AC-1, WS-AC-2, WS-AC-3, WS-AC-21.
 */
import { describe, it, expect } from 'vitest';
import { deriveWorkspace } from '../../src/utils/workspace.js';

describe('deriveWorkspace (WS-AC-1, WS-AC-2, WS-AC-3)', () => {
  // -------------------------------------------------------------------------
  // Unix paths (WS-AC-1, WS-AC-2)
  // -------------------------------------------------------------------------

  it('derives workspace from a standard Unix path', () => {
    expect(deriveWorkspace('/home/dev/repos/personal/my-app')).toBe('/home/dev/repos/personal/');
  });

  it('derives workspace from a two-level Unix path', () => {
    expect(deriveWorkspace('/repos/my-app')).toBe('/repos/');
  });

  it('derives workspace from a root-level Unix repo (edge case)', () => {
    expect(deriveWorkspace('/my-app')).toBe('/');
  });

  it('strips trailing slash from input before deriving', () => {
    // "/repos/my-app/" should be treated the same as "/repos/my-app"
    expect(deriveWorkspace('/repos/my-app/')).toBe('/repos/');
  });

  it('derives workspace from a deeply nested Unix path', () => {
    expect(deriveWorkspace('/home/carlo/projects/work/client/acme/api-service')).toBe(
      '/home/carlo/projects/work/client/acme/'
    );
  });

  // -------------------------------------------------------------------------
  // Windows paths (WS-AC-3) — backslashes normalized to forward slashes
  // -------------------------------------------------------------------------

  it('derives workspace from a Windows path with backslashes', () => {
    expect(deriveWorkspace('C:\\Users\\dev\\repos\\work\\api')).toBe('C:/Users/dev/repos/work/');
  });

  it('derives workspace from a Windows path preserving drive letter', () => {
    expect(deriveWorkspace('C:\\Users\\carlo\\Desktop\\repositories\\personal\\my-app')).toBe(
      'C:/Users/carlo/Desktop/repositories/personal/'
    );
  });

  it('handles Windows paths with mixed slashes', () => {
    expect(deriveWorkspace('C:/Users/dev/repos/work\\api')).toBe('C:/Users/dev/repos/work/');
  });

  it('handles Windows trailing backslash', () => {
    expect(deriveWorkspace('C:\\Users\\dev\\repos\\personal\\my-app\\')).toBe(
      'C:/Users/dev/repos/personal/'
    );
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('always produces a trailing slash on the workspace path', () => {
    const workspace = deriveWorkspace('/home/user/proj');
    expect(workspace.endsWith('/')).toBe(true);
  });

  it('produces forward slashes only (no backslashes) in the result', () => {
    const workspace = deriveWorkspace('C:\\Users\\dev\\my-repo');
    expect(workspace).not.toContain('\\');
  });

  it('two repos in the same parent directory yield the same workspace', () => {
    const ws1 = deriveWorkspace('/repos/personal/app-a');
    const ws2 = deriveWorkspace('/repos/personal/app-b');
    expect(ws1).toBe(ws2);
    expect(ws1).toBe('/repos/personal/');
  });

  it('two repos in different parent directories yield different workspaces', () => {
    const ws1 = deriveWorkspace('/repos/personal/app');
    const ws2 = deriveWorkspace('/repos/work/app');
    expect(ws1).not.toBe(ws2);
    expect(ws1).toBe('/repos/personal/');
    expect(ws2).toBe('/repos/work/');
  });
});
