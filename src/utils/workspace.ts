/**
 * Workspace utility: derives the workspace path from a repository path.
 * The workspace is the immediate parent directory of the repository.
 * Traces to WS-AC-1, WS-AC-2, WS-AC-3.
 */

/**
 * Normalize a path for consistent storage and comparison.
 *
 * Converts all backslashes to forward slashes and ensures the path ends
 * with a trailing slash. This matches the normalization applied by
 * `deriveWorkspace()`, so stored workspace values and derived workspace
 * values are always comparable.
 *
 * Examples:
 *   "C:\\Users\\dev\\repos\\my-workspace\\" → "C:/Users/dev/repos/my-workspace/"
 *   "/home/dev/repos/personal/"              → "/home/dev/repos/personal/"
 *   "/home/dev/repos/personal"               → "/home/dev/repos/personal/"
 *
 * @param path - An absolute directory path (workspace or repository).
 * @returns The path with forward slashes only and a guaranteed trailing slash.
 */
export function normalizePath(path: string): string {
  const forwardSlash = path.replace(/\\/g, '/');
  return forwardSlash.endsWith('/') ? forwardSlash : forwardSlash + '/';
}

/**
 * Derive the workspace path from a repository path.
 *
 * The workspace is the immediate parent directory of the repository. The
 * result is normalized to forward slashes and always ends with a trailing
 * slash, so it works identically on Windows and Unix (WS-AC-3).
 *
 * Examples:
 *   "/home/dev/repos/personal/my-app"   → "/home/dev/repos/personal/"
 *   "C:\\Users\\dev\\repos\\work\\api"  → "C:/Users/dev/repos/work/"
 *   "/repos/my-app/"                    → "/repos/"
 *   "/my-app"                           → "/"
 *
 * @param repositoryPath - Absolute path to a repository directory.
 * @returns Absolute path to the parent workspace directory, with trailing slash.
 */
export function deriveWorkspace(repositoryPath: string): string {
  // Step 1: Normalize backslashes to forward slashes (WS-AC-3)
  const normalized = repositoryPath.replace(/\\/g, '/');

  // Step 2: Remove trailing slash if present, so dirname works consistently
  const stripped = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;

  // Step 3: Extract parent directory — find the last '/' and take the prefix
  const lastSlash = stripped.lastIndexOf('/');
  if (lastSlash === -1) {
    // No slash at all — treat as root-relative, return root
    return '/';
  }

  // Step 4: The parent is everything up to (but not including) the last '/'
  // If lastSlash is 0, the parent is the root directory "/"
  const parent = lastSlash === 0 ? '' : stripped.slice(0, lastSlash);

  // Step 5: Ensure trailing slash
  return parent + '/';
}
