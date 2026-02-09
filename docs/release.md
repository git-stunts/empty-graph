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

## Steps

1. Update `package.json` and `jsr.json` versions to the target version.
2. Merge to `main` (all checks green).
3. Tag the release:
   - Stable: `git tag -s vX.Y.Z -m "release: vX.Y.Z"`
   - RC: `git tag -s vX.Y.Z-rc.N -m "release: vX.Y.Z-rc.N"`
4. Push the tag:
   ```bash
   git push origin vX.Y.Z
   ```
5. Watch the Actions pipeline:
   - **CI** -- full test suite (lint, Docker tests, BATS CLI)
   - **verify** -- version match, dry-run pack, dry-run JSR
   - **publish_npm** -- publishes to npm via OIDC with provenance
   - **publish_jsr** -- publishes to JSR via OIDC
   - **github_release** -- creates GitHub Release with auto-generated notes
6. If one registry fails, re-run only that job from the Actions UI.
7. Confirm:
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
