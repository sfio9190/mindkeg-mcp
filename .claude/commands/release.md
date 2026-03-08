You are performing a release for the mindkeg-mcp project. The user will provide the version as $ARGUMENTS (e.g., "0.2.0" or "patch" or "minor" or "major").

Follow these steps exactly:

## 1. Determine the new version

- Read `package.json` to get the current version.
- If the user provided a semver keyword ("patch", "minor", "major"), compute the next version:
  - patch: 0.1.0 → 0.1.1
  - minor: 0.1.0 → 0.2.0
  - major: 0.1.0 → 1.0.0
- If the user provided an explicit version (e.g., "0.2.0"), use that directly.
- If no argument was provided, ask the user what version to release.

## 2. Collect changes since the last release

- Run `git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline` to get all commits since the last tag.
- If there are no commits since the last tag, stop and tell the user there's nothing to release.

## 3. Update CHANGELOG.md

- Read the current `CHANGELOG.md`.
- Add a new section at the top (below the header), formatted as:

```
## [X.Y.Z] - YYYY-MM-DD

### Added
- (new features from commit log)

### Changed
- (modifications from commit log)

### Fixed
- (bug fixes from commit log)
```

- Only include sections (Added/Changed/Fixed) that have entries. Categorize commits by reading their messages:
  - `feat:` → Added
  - `fix:` → Fixed
  - `refactor:`, `perf:`, `docs:`, `ci:`, `chore:` → Changed
- Write concise, user-facing descriptions (not raw commit messages). Group related commits.
- Today's date should be used for the release date.

## 4. Bump version in package.json

- Update the `"version"` field in `package.json` to the new version.
- Do NOT run `npm version` (it creates its own commit/tag which conflicts with our flow).

## 5. Run checks

- Run `npm run typecheck` — stop if it fails.
- Run `npm run lint` — stop if it fails.
- Run `npm test` — stop if it fails.
- Run `npm run build` — stop if it fails.

If any check fails, tell the user what failed and do NOT proceed with the commit/tag/push.

## 6. Commit the release

- Stage only `package.json` and `CHANGELOG.md`.
- Commit with message: `release: vX.Y.Z`
- Do NOT use `--no-verify`.

## 7. Create the git tag

- Run `git tag vX.Y.Z` to create a lightweight tag on the release commit.

## 8. Push to GitHub

- Ask the user for confirmation before pushing.
- Run `git push origin main --follow-tags` to push the commit and tag together.

## 9. Create GitHub release

- Run:
  ```
  gh release create vX.Y.Z --title "vX.Y.Z" --notes "$(changelog_section)"
  ```
  where `changelog_section` is the new CHANGELOG section content you just wrote (the entries under `## [X.Y.Z]`, not the heading itself).

## 10. Summary

Print a summary:
- Version: X.Y.Z
- Tag: vX.Y.Z
- GitHub release URL
- Remind the user that the `publish.yml` workflow will automatically publish to npm once the release is created.

## Important rules

- NEVER skip the checks in step 5.
- NEVER force push.
- ALWAYS ask for confirmation before pushing (step 8).
- If anything fails, stop and report — do not try to work around failures.
