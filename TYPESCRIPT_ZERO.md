# TYPESCRIPT_ZERO — Zero TS Errors Checklist

> Mantra: "Fast commits, strict pushes, ruthless CI, zero drift."

Starting errors: **src: 1,513 | test: 7,123 | total: 7,461**
Current src errors: **0** (1,513 fixed)
Current test errors: **5,862** (1,261 cascade-fixed from src typing)

## Stage A — Infrastructure

- [x] **A1. Split typecheck configs**
  - [x] `tsconfig.base.json` — shared compiler options
  - [x] `tsconfig.src.json` — strictest, `src/` + `bin/` + `scripts/`
  - [x] `tsconfig.test.json` — extends base, adds `test/`
  - [x] Keep existing `tsconfig.json` as the "everything" config (extends base)

- [x] **A2. npm scripts**
  - [x] `"typecheck": "tsc --noEmit"`
  - [x] `"typecheck:src": "tsc --noEmit -p tsconfig.src.json"`
  - [x] `"typecheck:test": "tsc --noEmit -p tsconfig.test.json"`

- [x] **A3. Error baseline + ratchet**
  - [x] `scripts/ts-ratchet.js` — parse `tsc --pretty false`, count errors by config
  - [x] `ts-error-baseline.json` — `{ "src": 0, "test": 5862, "total": 5861 }`
  - [x] CI step: fail if error count > baseline

- [x] **A4. Git hooks**
  - [x] pre-commit: ESLint staged files only (no change needed)
  - [x] pre-push: add `npm run typecheck:ratchet` step

- [x] **A5. CI enforcement**
  - [x] `.github/workflows/ci.yml` lint job: add typecheck ratchet step
  - [x] `.github/workflows/release-pr.yml`: add typecheck step

## Stage B — Source Cleanup (`src/` + `bin/` + `scripts/`)

- [x] **B1. Shared type foundations**
  - [x] JSDoc `@typedef` for key types defined inline across files

- [x] **B2. Source files** (0 remaining)
  - [x] `src/domain/services/` batch (0 errors)
  - [x] `src/domain/crdt/` batch (0 errors)
  - [x] `src/domain/entities/` batch (0 errors)
  - [x] `src/domain/errors/` batch (0 errors)
  - [x] `src/domain/utils/` batch (0 errors)
  - [x] `src/domain/warp/` batch (0 errors)
  - [x] `src/domain/types/` batch (0 errors)
  - [x] `src/domain/WarpGraph.js` (0 errors)
  - [x] `src/ports/` batch (0 errors)
  - [x] `src/infrastructure/` batch (0 errors)
  - [x] `src/visualization/` batch (0 errors)
  - [x] `bin/warp-graph.js` (0 errors)
  - [x] `scripts/` batch (0 errors)

- [ ] **B3. Policy enforcement**
  - [ ] `@ts-expect-error` over `@type {*}` for intentional edge cases
  - [ ] Any `@type {*}` MUST have `// TODO(ts-cleanup): reason`
  - [ ] CI grep fails on untracked wildcard casts

## Stage C — Test Cleanup (`test/`)

- [ ] **C1. Test helper typing**
  - [ ] Type `createMockPersistence()`, `createTestRepo()`, etc.
  - [ ] Cascade-fix test errors from helper improvements

- [ ] **C2. Test files** (~146 files, 5,862 errors remaining)
  - [ ] `test/unit/domain/services/` batch
  - [ ] `test/unit/domain/crdt/` batch
  - [ ] `test/unit/domain/` (root-level test files)
  - [ ] `test/unit/infrastructure/` batch
  - [ ] `test/unit/visualization/` batch
  - [ ] `test/integration/` batch
  - [ ] `test/benchmark/` batch

## Stage D — Final Gate

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` passes
- [x] `npm run test:local` passes
- [ ] Pre-push hook works
- [ ] CI pipeline passes
- [ ] Remove baseline ratchet (zero is absolute)
- [ ] Hard gate: `tsc --noEmit` exit code in CI
