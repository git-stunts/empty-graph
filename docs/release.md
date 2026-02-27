# Release Runbook

## First-time setup

Both registries use OIDC trusted publishing -- no stored tokens.

### npm

1. Publish the first version locally:
   ```bash
   npm login
   npm publish --access public
   ```
2. On [npmjs.com](https://www.npmjs.com): package settings → Trusted Publisher → GitHub Actions.
   - Organization/user: `git-stunts`
   - Repository: `git-warp`
   - Workflow filename: `release.yml`
3. On GitHub: create an environment called `npm` (no secrets needed).

### JSR

1. Publish the first version locally:
   ```bash
   npx jsr publish
   ```
2. On [jsr.io](https://jsr.io): package settings → link the GitHub repository.
3. On GitHub: create an environment called `jsr` (no secrets needed).

## Prerequisites

- You have push access to `main` and can create tags.
- GitHub environments `npm` and `jsr` exist (OIDC -- no secrets required).
- npm and JSR trusted publisher connections are configured (see above).

## Preflight checklist

Run the local preflight before tagging:

```bash
npm run release:preflight
```

This script (`scripts/release-preflight.sh`) checks:

| # | Check | Blocking? |
|---|-------|-----------|
| 1 | `package.json` version == `jsr.json` version | Yes |
| 2 | Clean working tree (no uncommitted changes) | Yes |
| 3 | On `main` branch | Warning |
| 4 | CHANGELOG has a dated `[X.Y.Z] — YYYY-MM-DD` entry | Yes |
| 5 | README "What's New" section updated for version | Yes |
| 6 | ESLint clean | Yes |
| 7 | Type firewall (tsc + IRONCLAD policy + consumer + surface) | Yes |
| 8 | Unit tests pass | Yes |
| 9 | `npm pack --dry-run` + `jsr publish --dry-run` | Yes |
| 10 | `npm audit` (runtime deps, high/critical) | Warning |

If all checks pass, the script prints the exact tag + push commands.

## Steps

1. Prepare the release content:
   - Bump version in **both** `package.json` and `jsr.json`.
   - Move `[Unreleased]` items in `CHANGELOG.md` to a dated `[X.Y.Z] — YYYY-MM-DD` section.
   - Update the `## What's New in vX.Y.Z` section in `README.md`.
   - Commit: `git commit -m "release: vX.Y.Z"`
2. Run preflight:
   ```bash
   npm run release:preflight
   ```
3. Merge to `main` (all CI checks green).
4. Tag the release:
   - Stable: `git tag -s vX.Y.Z -m "release: vX.Y.Z"`
   - RC: `git tag -s vX.Y.Z-rc.N -m "release: vX.Y.Z-rc.N"`
5. Push the tag:
   ```bash
   git push origin vX.Y.Z
   ```
6. Watch the Actions pipeline:
   - **tag-guard** -- validates tag format (`vX.Y.Z` or `vX.Y.Z-(rc|beta|alpha).N`)
   - **CI** -- full test suite (type firewall, lint, Docker tests across Node/Bun/Deno)
   - **verify** -- version match (package.json == jsr.json == tag), CHANGELOG entry, README What's New, dry-run pack, dry-run JSR
   - **publish_npm** -- publishes to npm via OIDC with provenance
   - **publish_jsr** -- publishes to JSR via OIDC
   - **github_release** -- creates GitHub Release with auto-generated notes
7. If one registry fails, re-run only that job from the Actions UI.
8. Confirm:
   - npm dist-tag is correct (`latest` for stable, `next`/`beta`/`alpha` for prereleases)
   - JSR version is visible
   - GitHub Release notes are generated

## Dist-tag mapping

| Tag pattern       | npm dist-tag |
| ----------------- | ------------ |
| `vX.Y.Z`          | `latest`     |
| `vX.Y.Z-rc.N`     | `next`       |
| `vX.Y.Z-beta.N`   | `beta`       |
| `vX.Y.Z-alpha.N`  | `alpha`      |
