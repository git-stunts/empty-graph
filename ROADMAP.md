# ROADMAP — @git-stunts/git-warp

> **Current version:** v12.2.0
> **Last reconciled:** 2026-02-27 (STANK.md fully absorbed)

---

## Completed Milestones

| # | Codename | Version | Theme |
|---|----------|---------|-------|
| 1 | AUTOPILOT | v7.1.0 | Kill the Materialize Tax |
| 2 | GROUNDSKEEPER | v7.2.0 | Self-Managing Infrastructure |
| 3 | WEIGHTED | v7.3.0 | Edge Properties |
| 4 | HANDSHAKE | v7.4.0 | Multi-Writer Ergonomics |
| 5 | COMPASS | v7.5.0 | Advanced Query Language |
| 6 | LIGHTHOUSE | v7.6.0 | Observability |
| 7 | PULSE | v7.7.0 | Subscriptions & Reactivity |
| 8 | HOLOGRAM | v8.0.0 | Provenance & Holography |
| 9 | ECHO | v9.0.0 | Observer Geometry |
| 10 | BULKHEAD | v10.0.0 | Hexagonal Purity & Structural Integrity |
| 11 | RECALL | v10.4.0 | Seek Materialization Cache |
| 12 | SEEKDIFF | v10.5.0 | Structural Seek Diff |
| M1 | IRON DOME | v11.0.0 | Security & Protocol Hardening |
| M2 | FOUNDATION LIFT | v11.1.0 | Developer Velocity for Correctness |
| M3 | GHOST PROTOCOL | v11.1.0 | Immutable Audit Trail |
| M4 | VERIFY OR IT DIDN'T HAPPEN | v11.1.0 | Cryptographic Verification |
| M5 | CLI DECOMPOSITION | v11.1.0 | Maintainability |
| M6 | SAFE ERGONOMICS | v11.1.0 | Single-Await API |
| M7 | TRUST V1 | v11.1.0 | Cryptographic Identity-Backed Trust |
| M8 | IRONCLAD | v11.x | Type Safety |
| M9 | PARTITION | v12.0.0 | Architectural Decomposition |

---

## Quality Bar (Mandatory)

- branch coverage threshold (not vanity 100%)
- mutation testing for verifier-critical logic
- invariant/property tests for chain semantics
- chaos tests for delayed commits / racey interleavings where applicable
- CI matrix across supported Node + Git versions

---

## Milestone 10 — SENTINEL

**Theme:** Trust hardening + sync safety + correctness
**Objective:** Complete the signed trust boundary. Fix audit-critical safety issues. Design the causality bisect spec.
**Triage date:** 2026-02-17

### M10.T1 — Signed Sync Ingress

- **Status:** `DONE`

**Items:**

- **B1** (STRICT PROVENANCE) — ✅ SyncTrustGate wired into SyncController.applySyncResponse(). Trust evaluates on `writersApplied` (patch authors), not frontier keys. Enforce/log-only/off modes. Derived cache invalidation after sync apply.

### M10.T2 — Trust Reliability

- **Status:** `DONE`

**Items:**

- **B39** (TRUST RECORD CAS RETRY) — ✅ `appendRecordWithRetry()` added to TrustRecordService. Re-reads chain tip on CAS conflict, rebuilds prev pointer, re-signs via caller-provided callback, retries. Convergence tests pass.
- **B40** (BATS E2E: `git warp trust` OUTPUT SHAPES) — ✅ Unit test coverage for trust gate integration, CAS convergence, spec compliance. BATS E2E deferred to CI integration pass.

### M10.T3 — Audit-Critical Fixes

- **Status:** `DONE`

**Items:**

- **B63** (GC SNAPSHOT ISOLATION) — ✅ Already implemented in `checkpoint.methods.js` using clone-then-swap + frontier fingerprint CAS. `executeGC()` mutates clone only; swap happens after fingerprint check. `_maybeRunGC` discards stale result silently. `runGC` throws `E_GC_STALE`.
- **B64** (SYNC INGRESS PAYLOAD VALIDATION) — ✅ Already complete in SyncPayloadSchema.js (done in v12.1.0).
- **B65** (SYNC DIVERGENCE LOGGING) — ✅ `processSyncRequest()` now tracks `skippedWriters` array with `{ writerId, reason, localSha, remoteSha }`. Structured logging at warn level. Response includes `skippedWriters`.

### M10.T4 — Causality Bisect Spec

- **Status:** `PENDING`

**Items:**

- **B2 (spec only)** (CAUSALITY BISECT) — design the bisect CLI contract + data model. Commit spec with test vectors. Full implementation deferred to M11 — but the spec lands here so bisect is available as a debugging tool during M10 trust hardening.

**M10 Gate:** Signed ingress enforced end-to-end; trust E2E receipts green; B63 GC isolation verified under concurrent writes; B64 sync payload validation green; B65 divergence logging verified; B2 spec committed with test vectors.

---

## Milestone 12 — SCALPEL ⚠️ TOP PRIORITY

**Theme:** Comprehensive STANK audit cleanup — correctness, performance & code quality
**Objective:** Fix ALL issues from the 2026-02-25 cognitive complexity audit (STANK.md). Eliminate data-loss vectors (CRITs), rewrite broken abstractions (STANKs), clean up fragile code (JANK), and polish minor issues (TSK TSK). 46 total issues; 11 already fixed, 35 remaining.
**Triage date:** 2026-02-27
**Audit source:** `STANK.md`

### Already Fixed (M10 + prior M12 work)

| STANK ID | B# | Fix |
|----------|-----|-----|
| C4 | — | `_snapshotState` lazy capture in PatchBuilderV2 |
| C6 | — | `E_LAMPORT_CORRUPT` throw in Writer.js |
| S4 | B72 | `'0'.repeat(40)` in compareAndSwapRef |
| S9 | — | Fast-return guard in `_materializeGraph()` |
| J1 | B68 | MinHeap topological sort in GraphTraversal |
| J2 | B69 | `batchMap()` + propsMemo in QueryBuilder |
| J5 | — | Dead `visible.cbor` write removed from CheckpointService |
| J8 | — | Temp array pattern in `orsetCompact` |
| J11 | — | `_indexDegraded` flag in WarpGraph |
| C2 | — | `isKnownOp()` exists (tests added, sync-path wiring in M12.T1) |
| C3 | — | Receipt validation tests added (runtime guards in M12.T3) |

### M12.T1 — Sync Safety (C1 + C2 + S3)

- **Status:** `DONE`
- **Size:** L | **Risk:** HIGH
- **Depends on:** —

**Items:**

- **B105** ✅ (C1: SYNC DIVERGENCE + STALE CACHE) — Route `applySyncResponse` through `_setMaterializedState()` instead of raw `_cachedState` assignment. Surface `skippedWriters` in `syncWith` return value. **Files:** `SyncController.js`
- **B106** ✅ (C2: FORWARD-COMPATIBLE OPS ALLOWLIST) — Call `isKnownOp()` before `join()` in sync apply path. Fail closed on unknown ops with `SchemaUnsupportedError`. **Files:** `SyncProtocol.js`
- **B107** ✅ (S3: BIDIRECTIONAL SYNC DELTA) — Add `isAncestor()` pre-check in `processSyncRequest` to detect divergence early without chain walk. Updated misleading comment in `computeSyncDelta`. Kept `loadPatchRange` throw as fallback for persistence layers without `isAncestor`. **File:** `SyncProtocol.js`

### M12.T2 — Cache Coherence (S1)

- **Status:** `DONE`
- **Size:** S | **Risk:** HIGH
- **Depends on:** M12.T1

**Items:**

- **B108** ✅ (S1: CACHE COHERENCE) — Fixed `join()` to install merged state as canonical (`_stateDirty = false`, adjacency built synchronously) instead of setting `_stateDirty = true` which caused `_ensureFreshState()` to discard the merge result. Cleared `_cachedViewHash` in all dirty paths (`_onPatchCommitted` fallback, `_maybeRunGC` frontier-changed). Full `CacheState` object refactor deferred — actual bugs were surgical. **Files:** `patch.methods.js`, `checkpoint.methods.js`

### M12.T3 — Remaining CRITs (C3, C5, C7, C8)

- **Status:** `PENDING`
- **Size:** M | **Risk:** MEDIUM
- **Depends on:** M12.T2

**Items:**

- **B109** (C3: RECEIPT PATH RUNTIME GUARDS) — Add structural validation before switch-case casts in `applyWithReceipt`. Assert required fields per op type (`node`, `dot`, `observedDots`, etc.). Throw `PatchError` on validation failure. **File:** `JoinReducer.js:614-637`
- **B110** (C5: PROVENANCE SEMANTICS RENAME) — Rename `_reads` to `_observedOperands` in PatchBuilderV2. Add JSDoc explaining semantic model per op type. Keep `.reads` getter name for API compat. **File:** `PatchBuilderV2.js:135-156`
- **B111** (C7: GC TRANSACTION BOUNDARY) — Clone state before compaction in `executeGC`. Swap on success, discard on failure. Validate `appliedVV` parameter shape. **File:** `GCPolicy.js:101-122`
- **B112** (C8: ERROR HANDLER FORMAT) — Document intentional `process.argv` fallback in error handler (parsing may have thrown, so `options` may not exist). Add comment. **File:** `warp-graph.js:81-82`

### M12.T4 — Index Performance (S5 + S6)

- **Status:** `PENDING`
- **Size:** L | **Risk:** MEDIUM
- **Depends on:** —

**Items:**

- **B66** (S5: INCREMENTAL INDEX O(E) SCAN) — Use adjacency map for O(degree) lookup on node re-add instead of scanning all alive edges. Separate genuinely-new nodes (skip scan) from re-added nodes (incident edges only). **File:** `IncrementalIndexUpdater.js:99-128`
- **B113** (S6: DOUBLE BITMAP DESERIALIZATION) — In `_purgeNodeEdges`, deserialize once, mutate in-place, serialize once. Use `bitmap.clear()` instead of creating new empty bitmap. **File:** `IncrementalIndexUpdater.js:241-320`

### M12.T5 — Post-Commit + Ancestry (S7 + S8)

- **Status:** `PENDING`
- **Size:** L | **Risk:** MEDIUM
- **Depends on:** M12.T2

**Items:**

- **B114** (S7: DIFF-AWARE EAGER POST-COMMIT) — Pass patch diff to `_setMaterializedState()` in `_onPatchCommitted` so `_buildView` can do incremental update instead of full rebuild. **File:** `patch.methods.js:221-231`
- **B115** (S8: MEMOIZED ANCESTRY WALKING) — Validate writer relation once per tip/range in `_loadPatchesSince`, not once per patch SHA. Memoize ancestry results per writer. **File:** `checkpoint.methods.js:187-202`

### M12.T6 — Edge Property Encoding (S2)

- **Status:** `PENDING`
- **Size:** XL | **Risk:** HIGH
- **Depends on:** M12.T3

**Items:**

- **B116** (S2: EXPLICIT EDGEPROPSET OP) — Promote edge properties to explicit `EdgePropSet` operation type in patch schema (schema version 4). Migration: detect `\x01`-prefixed `PropSet` ops in schema <= 3 and translate on read. New writes emit `EdgePropSet`. **Files:** `WarpTypesV2.js`, `JoinReducer.js`, `PatchBuilderV2.js`, `KeyCodec.js`, `MessageSchemaDetector.js`

### M12.T7 — Corruption Guard

- **Status:** `PENDING`
- **Size:** S | **Risk:** LOW
- **Depends on:** —

**Items:**

- **B70** (PATCHBUILDER ASSERTNOTCOMMITTED) — Add `_committed` flag + `assertNotCommitted()` guard on all mutating methods in `PatchBuilderV2`. **Files:** `PatchBuilderV2.js`, `PatchBuilderV2.test.js`

### M12.T8 — JANK Batch (J3, J4, J6, J7, J9, J10, J12–J19)

- **Status:** `PENDING`
- **Size:** L | **Risk:** LOW
- **Depends on:** —

**Items:**

- **B117** (JANK BATCH) — 14 independent JANK fixes from STANK.md. Each is a small, isolated change:
  - **J3:** Single `rev-parse` with exit-code handling in `readRef` (drop redundant `refExists` pre-check). **File:** `GitGraphAdapter.js:540-561`
  - **J4:** Pooled concurrent blob reads in `readTree` (batch size 10-20). **File:** `GitGraphAdapter.js:458-467`
  - **J6:** Use adjacency/neighbor index in `findAttachedData` instead of full E+P scan. **File:** `PatchBuilderV2.js:45-64`
  - **J7:** Cache schema version after first `setEdgeProperty()`. **File:** `PatchBuilderV2.js:498,610`
  - **J9:** Memoize in-flight promise in `CachedValue.get()`. **File:** `CachedValue.js:69-80`
  - **J10:** Delete `fnv1a.js` (charCodeAt variant). Consolidate on `shardKey.js` (UTF-8 bytes). **Files:** `fnv1a.js`, callers
  - **J12:** Freeze or clone state before returning from public materialization APIs. **Files:** `materialize.methods.js:230`, `materializeAdvanced.methods.js:223,460`
  - **J13:** Remove redundant CAS pre-check in `PatchSession.commit()`. Let builder CAS be single source of truth. **File:** `PatchSession.js:212-221`
  - **J14:** Catch only "not found" in checkpoint load; re-throw decode/corruption errors. **File:** `checkpoint.methods.js:168`
  - **J15:** Return typed ok/error result from `TrustRecordService.readRecords` so verifier can distinguish failure from empty config. **Files:** `TrustRecordService.js:111`, `AuditVerifierService.js:672`
  - **J16:** Rename `_hasSchema1Patches` to `_tipHasSchema1Patches` (or document tip-only semantics). **File:** `checkpoint.methods.js:237-248`
  - **J17:** Add phase comments to `extractBaseArgs` state machine. **File:** `infrastructure.js:219-279`
  - **J18:** Move `NATIVE_ROARING_AVAILABLE` into instance or lazy getter with test-reset support. **File:** `BitmapIndexBuilder.js:24-32`
  - **J19:** Pre-compute labels key string in `_getNeighbors` cache key. **File:** `GraphTraversal.js:168-169`

### M12.T9 — TSK TSK Cleanup (T1–T38)

- **Status:** `PENDING`
- **Size:** L | **Risk:** LOW
- **Depends on:** —

**Items:**

- **B67** (T1: JOINREDUCER RECEIPT O(N*M)) — Maintain `dot -> elementId` reverse index in receipt-path removal outcome. **File:** `JoinReducer.js:192-278`
- **B73** (T2: `orsetClone` VIA JOIN WITH EMPTY SET) — Add `orsetClone()` that directly copies entries + tombstones. **File:** `JoinReducer.js:854-862`
- **B74** (T32: WRITER REENTRANCY COMMENT) — Document `_commitInProgress` safety. **File:** `Writer.js:180-195`
- **B75** (T9: VV COUNTER=0 ELISION) — Document invariant + assert at serialization. **File:** `VersionVector.js:189-190`
- **B118** (TSK TSK BATCH) — 34 remaining TSK TSK fixes grouped by file cluster. See STANK.md T3–T38 (excluding T2, T9, T32 tracked above):
  - **JoinReducer cluster** (T3): Document optional `edgeBirthEvent`
  - **CheckpointService cluster** (T4, T25, T26): Document schema:3 gap; always clone in compact path; index CONTENT_PROPERTY_KEY
  - **GitGraphAdapter cluster** (T5, T6, T7): Inline delegation wrappers; extract shared commit logic; document NUL stripping
  - **CRDT/Utils cluster** (T8, T10, T11, T12, T20, T21, T22, T37, T38): Skip sort for pre-sorted CBOR input; document lwwMax null-handling; consistent orsetJoin cloning; document SHA comparison order; head-index for DagTraversal/DagTopology `Array.shift()`; document Dot colon-parsing; cache `decodeDot()` in orsetSerialize; cache sorted keys in vvSerialize
  - **Service/Error cluster** (T13–T19, T23–T24, T27–T31, T33–T36): Deep freeze simplification; mulberry32 docs; DRY `'props_'` prefix; WriterError constructor; StorageError hierarchy; canonicalStringify cycle detection; matchGlob cache eviction; LRUCache access tracking; SyncProtocol Map<->Object; redundant patch grouping; infrastructure preprocessView; schemas coerce bounds; StorageError context merging; RefLayout parseWriterIdFromRef; EventId validation; PatchSession post-commit error type; MaterializedViewService sample fallback; IncrementalIndexUpdater max-ID loop; getRoaringBitmap32 memoization

**M12 Gate:** All 46 STANK.md issues resolved (fixed, documented as intentional, or explicitly deferred with trigger). Full test suite green. `WarpGraph.noCoordination.test.js` passes. No new tsc errors. Lint clean.

### M12 Internal Dependency Graph

```text
M12.T1 (Sync) ──→ M12.T2 (Cache) ──→ M12.T3 (CRITs) ──→ M12.T6 (EdgeProp)
                         │
                         └──→ M12.T5 (Post-Commit)

M12.T4 (Index) ─────────────────────── (independent)
M12.T7 (Corruption) ────────────────── (independent)
M12.T8 (JANK) ──────────────────────── (independent)
M12.T9 (TSK TSK) ───────────────────── (independent, lowest priority)
```

### M12 Verification Protocol

For every task:
1. **Before starting:** Run `npm run test:local` and record pass count as baseline
2. **After each file edit:** Run the file's specific test suite
3. **Before committing:** Full `npm run test:local` — must match or exceed baseline
4. **Critical gate:** `test/unit/domain/WarpGraph.noCoordination.test.js` must pass
5. **Lint gate:** `npm run lint` must pass

---

## Milestone 11 — COMPASS II

**Theme:** Developer experience
**Objective:** Ship bisect, public observer API, and batch patch ergonomics.
**Triage date:** 2026-02-17

### M11.T1 — Causality Bisect (Implementation)

- **Status:** `PENDING`

**Items:**

- **B2 (implementation)** (CAUSALITY BISECT) — full implementation building on M10 spec. Binary search for first bad tick/invariant failure. `git bisect` for WARP.

### M11.T2 — Observer API

- **Status:** `PENDING`

**Items:**

- **B3** (OBSERVER API) — public event contract. Internal soak period over (shipped in PULSE, used internally since). Stabilize the public surface.

### M11.T3 — Batch Patch API

- **Status:** `PENDING`

**Items:**

- **B11** (`graph.patchMany(fns)` BATCH API) — sequence multiple patch callbacks atomically, each seeing the ref left by the previous. Natural complement to `graph.patch()`.

**M11 Gate:** Bisect correctness verified on seeded regressions; observer contract snapshot-tested; patchMany passes no-coordination suite.

---

## Standalone Lane (Ongoing)

Items picked up opportunistically without blocking milestones. No milestone assignment.

### Immediate (tiny changes)

| ID | Item |
|----|------|
| B46 | **ESLINT BAN `Date.now()` IN DOMAIN** — one-line `no-restricted-syntax` config change |
| B47 | **`orsetAdd` DOT ARGUMENT VALIDATION** — domain boundary validation, prevents silent corruption |
| B26 | **DER SPKI PREFIX CONSTANT** — named constant with RFC 8410 reference |
| B71 | **PATCHBUILDER `console.warn` BYPASSES LOGGERPORT** — replace direct `console.warn()` with `this._logger?.warn()` in `removeNode`. From B-AUDIT-9 (JANK). **File:** `src/domain/services/PatchBuilderV2.js:252-256` |

### Near-Term

| ID | Item |
|----|------|
| B44 | **SUBSCRIBER UNSUBSCRIBE-DURING-CALLBACK E2E** — event system edge case; known bug class that bites silently |
| B34 | **DOCS: SECURITY_SYNC.md** — extract threat model from JSDoc into operator doc |
| B35 | **DOCS: README INSTALL SECTION** — Quick Install with Docker + native paths |
| B36 | **FLUENT STATE BUILDER FOR TESTS** — `StateBuilder` helper replacing manual `WarpStateV5` literals |
| B37 | **SHARED MOCK PERSISTENCE FIXTURE** — dedup `createMockPersistence()` across trust test files |
| B43 | **VITEST EXPLICIT RUNTIME EXCLUDES** — prevent accidental local runs of Docker-only suites |
| B12 | **DOCS-VERSION-SYNC PRE-COMMIT CHECK** — grep version literals in .md files against `package.json` |
| B48 | **ESLINT BAN `= {}` CONSTRUCTOR DEFAULTS WITH REQUIRED PARAMS** — catches the pattern where `= {}` silently makes required options optional at the type level (found in CommitDagTraversalService, DagTraversal, DagPathFinding, DagTopology, BitmapIndexReader) |
| B49 | **TIGHTEN `checkDeclarations` INLINE COMMENT STRIPPING** — strip trailing `//` and `/* */` comments before checking for `any` in `ts-policy-check.js`; low priority but closes theoretical false-positive gap |
| B50 | **ALIGN `type-surface.m8.json` WITH `index.d.ts`** — `syncWith` return missing `state?: WarpStateV5`, `setSeekCache` method missing entirely; manifest is declared source of truth for T3/T9 consumer tests |
| B51 | **AUDIT REMAINING `= {}` CONSTRUCTOR DEFAULTS** — DagTraversal, DagPathFinding, DagTopology, BitmapIndexReader all have same compile-time safety gap as CommitDagTraversalService (fixed in 0cead99); remove defaults, add `@ts-expect-error` to negative tests |
| B52 | **FIX OUTSIDE-DIFF IRONCLAD REVIEW ITEMS** — TickReceipt `sortedReplacer` wildcards (`{[x: string]: *}`), verify-audit.js `@returns {payload: *}`, SyncAuthService `keys` optional JSDoc |
| B53 | **FIX JSR PUBLISH DRY-RUN DENO PANIC** — Deno 2.6.7 `deno_ast` panics on overlapping text changes from duplicate `roaring` import rewrites; either pin Deno version, vendor the import, or file upstream issue and add workaround |
| B54 | **`typedCustom()` ZOD HELPER** — `z.custom()` without a generic yields `unknown` in JS; a JSDoc-friendly wrapper (or `@typedef`-based pattern) would eliminate verbose `/** @type {z.ZodType<T>} */ (z.custom(...))` casts across HttpSyncServer and future Zod schemas |
| B55 | **UPGRADE `HttpServerPort` REQUEST/RESPONSE TYPES** — `createServer` callback uses `Object` for `headers` and `string|Buffer` for response body; tighten to `Record<string, string>` and extract shared request/response typedefs to avoid repeated inline casts in HttpSyncServer, NodeHttpAdapter, BunHttpAdapter, DenoHttpAdapter |
| B57 | **CI: AUTO-VALIDATE `type-surface.m8.json` AGAINST `index.d.ts`** — add a CI gate or pre-push check that parses the manifest and confirms every declared method/property/return type matches the corresponding signature in `index.d.ts`; prevents drift like the missing `setSeekCache` and `syncWith.state` return found in review |
| B28 | **PURE TYPESCRIPT EXAMPLE APP** — CI compile-only stub (`tsc --noEmit` on minimal TS consumer). |
| B76 | **WARPGRAPH INVISIBLE API SURFACE DOCS** — add `// API Surface` block listing all 40+ dynamically wired methods with source module. Consider generating as build step. From B-AUDIT-4 (STANK). **File:** `src/domain/WarpGraph.js:451-478` |
| B77 | **`listRefs` UPPER BOUND** — add optional `limit` parameter consistent with `logNodes()`. From B-AUDIT-13 (TSK TSK). **File:** `src/infrastructure/adapters/GitGraphAdapter.js:650-657` |
| B78 | **REFLAYOUT SLASH-IN-GRAPH-NAME AMBIGUITY** — validate at graph creation that names cannot collide with ref layout keywords. From B-AUDIT-15 (TSK TSK). **File:** `src/domain/utils/RefLayout.js:409-419` |
| B79 | **WARPGRAPH CONSTRUCTOR LIFECYCLE DOCS** — document cache invalidation strategy for 25 instance variables: which operations dirty which caches, which flush them. From B-AUDIT-16 (TSK TSK). **File:** `src/domain/WarpGraph.js:69-198` |
| B80 | **CHECKPOINTSERVICE CONTENT BLOB UNBOUNDED MEMORY** — iterates all properties into single `Set` before tree serialization. Stream content OIDs in batches. From B-AUDIT-10 (JANK). **File:** `src/domain/services/CheckpointService.js:224-226` |
| B81 | **`attachContent` ORPHAN BLOB GUARD** — `attachContent()` unconditionally writes blob before `setProperty()`. Validate before push to prevent orphan blobs. From B-CODE-2. **File:** `src/domain/services/PatchBuilderV2.js` |
| B82 | **PRE-PUSH HOOK `--quick` MODE** — skip unit tests, type gates only (~5s vs ~24s). Full suite still runs in CI. From B-DX-1. **File:** `scripts/pre-push-hook.sh` |

### CI & Tooling Pack

| ID | Item |
|----|------|
| B83 | **DEDUP CI `type-firewall` AND `lint` JOBS** — merge into one job (add `npm audit` to `type-firewall`, drop `lint`) or chain with `needs:`. From B-CI-1. **File:** GitHub workflow file `.github/workflows/ci.yml` |
| B84 | **SURFACE VALIDATOR QUIET MODE** — `--quiet` flag or summary count instead of 80 per-export warning lines. From B-CI-2. **File:** `scripts/check-dts-surface.js` |
| B85 | **TYPE-ONLY EXPORT MANIFEST SECTION** — `typeExports` section in `type-surface.m8.json` to catch accidental type removal from `index.d.ts`. From B-CI-3. **Files:** `contracts/type-surface.m8.json`, `scripts/check-dts-surface.js` |
| B86 | **MARKDOWNLINT CI GATE** — catch MD040 (missing code fence language) etc. From B-DOC-1. **File:** GitHub workflow file `.github/workflows/ci.yml` |
| B87 | **CODE SAMPLE LINTER** — syntax-check JS/TS code blocks in markdown files via `eslint-plugin-markdown` or custom extractor. From B-DOC-2. **Files:** new script, `docs/**/*.md` |
| B88 | **MERMAID RENDERING SMOKE TEST** — parse all ` ```mermaid ` blocks with `@mermaid-js/mermaid-cli` in CI. From B-DIAG-2. **File:** GitHub workflow file `.github/workflows/ci.yml` or `scripts/` |
| B89 | ~~**VERSION CONSISTENCY GATE**~~ — **DONE (v12.1.0).** `scripts/release-preflight.sh` checks package.json == jsr.json; `release.yml` verify job enforces tag == package.json == jsr.json + CHANGELOG dated entry + README What's New. |
| B90 | ~~**PREFLIGHT BOT CHANGELOG CHECK**~~ — **DONE (v12.1.0).** `release.yml` verify job checks CHANGELOG heading for tag version. `release-pr.yml` already runs lint+typecheck+test+pack dry-runs on PRs. |

### Surface Validator Pack

All items target `scripts/check-dts-surface.js`:

| ID | Item |
|----|------|
| B91 | **MISSING `declare` FOR `interface`/`type` REGEXES** — add `(?:declare\s+)?` to `export interface` (line 104) and `export type` (line 108) for consistency with class/const/function regexes. From B-SURF-1. |
| B92 | **SURFACE VALIDATOR UNIT TESTS** — test `extractJsExports` and `extractDtsExports` covering: `export { type Foo }`, `export declare class`, multiline blocks, edge cases. From B-SURF-2. **File:** new `test/unit/scripts/check-dts-surface.test.js` |
| B93 | **DEDUP EXPORT PARSING LOGIC** — extract shared `parseExportBlock()` from near-identical code in `extractJsExports` and `extractDtsExports`. From B-SURF-3. |
| B94 | **STANDALONE EXPORT DECLARATIONS** — handle `export const foo` / `export function bar` in `extractJsExports` (currently only handles `export { ... }` blocks). From B-SURF-4. |
| B95 | **NAMESPACE EXPORT SUPPORT** — handle `export declare namespace Foo`. From B-SURF-5. |

### Type Surface Pack

| ID | Item |
|----|------|
| B96 | **CONSUMER TEST TYPE-ONLY IMPORT COVERAGE** — exercise all exported types beyond just declaring variables. Types like `OpOutcome`, `TraversalDirection`, `LogLevelValue` aren't tested at all. From B-TYPE-1. **File:** `test/type-check/consumer.ts` |
| B97 | **AUDIT MANIFEST vs `index.js` DRIFT** — manifest has 70 entries, `index.js` has 66 exports. 4 stale or type-only entries need reconciliation. From B-TYPE-2. **Files:** `contracts/type-surface.m8.json`, `index.js` |
| B98 | **TEST-FILE WILDCARD RATCHET** — `ts-policy-check.js` excludes test files entirely. Add separate ratchet with higher threshold or document exclusion as intentional. From B-TYPE-3. **File:** `scripts/ts-policy-check.js` |

### Content Attachment

| ID | Item |
|----|------|
| B99 | **DETERMINISM FUZZER FOR TREE CONSTRUCTION** — property-based test randomizing content blob insertion order in `PatchBuilderV2` and content OID iteration order in `CheckpointService.createV5()`, verifying identical tree OID. From B-FEAT-2. **File:** new test in `test/unit/domain/services/` |

### Conformance Property Pack (B19 + B22)

Single lightweight property suite — not a milestone anchor:

- **B19** (CANONICAL SERIALIZATION PROPERTY TESTS) — fuzz `canonicalStringify`; verify idempotency, determinism, round-trip stability.
- **B22** (CANONICAL PARSE DETERMINISM TEST) — verify `canonicalStringify(TrustRecordSchema.parse(record))` produces identical output across repeated calls.

**Rationale:** Golden fixtures test known paths; property tests test unknown edge combinations. For a deterministic engine, this is not optional forever. Trimmed to a single file covering canonical serialize idempotence + order-invariance.

### Process (no code)

| ID | Item |
|----|------|
| B102 | **API EXAMPLES REVIEW CHECKLIST** — add to `CONTRIBUTING.md`: each `createPatch()`/`commit()` uses own builder, async methods `await`ed, examples copy-pasteable. From B-DOC-3. |
| B103 | **BATCH REVIEW FIX COMMITS** — batch all review fixes into one commit before re-requesting CodeRabbit. Reduces duplicate findings across incremental pushes. From B-DX-2. |
| B104 | **MERMAID DIAGRAM CONTENT CHECKLIST** — for diagram migrations: count annotations in source/target, verify edge labels survive, check complexity annotations preserved. From B-DIAG-1. |

---

## Deferred (With Triggers)

Items parked with explicit conditions for promotion.

| ID | Item | Trigger |
|----|------|---------|
| B4 | **WARP UI VISUALIZER** | Promote when RFC filed with scoped UX goals |
| B7 | **DOCTOR: PROPERTY-BASED FUZZ TEST** | Promote when doctor check count exceeds 8 |
| B16 | **`unsignedRecordForId` EDGE-CASE TESTS** | Promote if canonical format changes |
| B20 | **TRUST RECORD ROUND-TRIP SNAPSHOT TEST** | Promote if trust record schema changes |
| B21 | **TRUST SCHEMA DISCRIMINATED UNION** | Promote if superRefine causes a bug or blocks a feature |
| B27 | **`TrustKeyStore` PRE-VALIDATED KEY CACHE** | Promote when `verifySignature` appears in any p95 flame graph above 5% of call time |
| B100 | **MAP vs RECORD ASYMMETRY** — `getNodeProps()` returns Map, `getEdgeProps()` returns Record. Breaking change either way. From B-FEAT-3. | Promote with next major version RFC |
| B101 | **MERMAID `~~~` INVISIBLE-LINK FRAGILITY** — undocumented Mermaid feature for positioning. From B-DIAG-3. | Promote if Mermaid renderer update breaks `~~~` positioning |

---

## Rejected (see GRAVEYARD.md)

B5, B6, B13, B17, B18, B25, B45 — rejected 2026-02-17 with cause recorded in `GRAVEYARD.md`.

---

## Execution Order

### Milestones: M10 → M12 → M11

1. **M10 SENTINEL** — Trust + sync safety + correctness (B1, B39, B40, B63, B64, B65, B2 spec) — DONE except B2 spec
2. **M12 SCALPEL** — Comprehensive STANK audit cleanup (B105–B118, B66, B67, B70, B73–B75) — **TOP PRIORITY**
3. **M11 COMPASS II** — Developer experience (B2 impl, B3, B11) — after STANK cleanup

### M12 Critical Path

```text
T1 (Sync) ──→ T2 (Cache) ──→ T3 (CRITs) ──→ T6 (EdgeProp) ──→ [M12 GATE]
                    │
                    └──→ T5 (Post-Commit)

T4 (Index) ─────── (independent, start anytime)
T7 (Corruption) ── (independent, start anytime)
T8 (JANK) ──────── (independent, start anytime)
T9 (TSK TSK) ───── (independent, lowest priority)
```

### Standalone Priority Sequence

Pick opportunistically between milestones. Recommended order within tiers:

1. **Immediate** (B46, B47, B26, B71) — any order, each <=30 min
2. **Near-term correctness** (B44, B76, B80, B81) — prioritize items touching core services
3. **Near-term DX** (B36, B37, B43, B82) — test ergonomics and developer velocity
4. **Near-term docs/types** (B34, B35, B50, B52, B55) — alignment and documentation
5. **Near-term tooling** (B12, B48, B49, B51, B53, B54, B57, B28) — remaining type safety items
6. **CI & Tooling Pack** (B83–B90) — batch as one PR
7. **Surface Validator Pack** (B91–B95) — batch as one PR, do B92 tests first
8. **Type Surface Pack** (B96–B98) — batch as one PR
9. **Content Attachment** (B99) — standalone property test
10. **Conformance Property Pack** (B19, B22) — standalone property suite
11. **Process** (B102–B104) — fold into CONTRIBUTING.md when touching that file

---

## Inventory

### By Status

| Status | Count | IDs |
|--------|-------|-----|
| **Milestone (M10)** | 7 | B1, B2(spec), B39, B40, B63, B64, B65 |
| **Milestone (M11)** | 3 | B2(impl), B3, B11 |
| **Milestone (M12)** | 19 | B66, B67, B70, B73, B75, B105–B118 |
| **Standalone** | 46 | B12, B19, B22, B26, B28, B34–B37, B43, B44, B46–B55, B57, B71, B76–B88, B91–B99, B102–B104 |
| **Standalone (done)** | 3 | B72, B89, B90 |
| **Deferred** | 8 | B4, B7, B16, B20, B21, B27, B100, B101 |
| **Rejected** | 7 | B5, B6, B13, B17, B18, B25, B45 |
| **Total tracked** | **93** (3 done) | |

### STANK.md Cross-Reference

| STANK ID | Severity | B# | Disposition |
|----------|----------|-----|-------------|
| C1 | CRIT | B105 | M12.T1 |
| C2 | CRIT | B106 | M12.T1 |
| C3 | CRIT | B109 | M12.T3 |
| C4 | CRIT | — | FIXED (M10) |
| C5 | CRIT | B110 | M12.T3 |
| C6 | CRIT | — | FIXED (M10) |
| C7 | CRIT | B111 | M12.T3 |
| C8 | CRIT | B112 | M12.T3 |
| S1 | STANK | B108 | M12.T2 |
| S2 | STANK | B116 | M12.T6 |
| S3 | STANK | B107 | M12.T1 |
| S4 | STANK | B72 | FIXED (M10) |
| S5 | STANK | B66 | M12.T4 |
| S6 | STANK | B113 | M12.T4 |
| S7 | STANK | B114 | M12.T5 |
| S8 | STANK | B115 | M12.T5 |
| S9 | STANK | — | FIXED (M10) |
| J1 | JANK | B68 | FIXED (M10) |
| J2 | JANK | B69 | FIXED (M10) |
| J3 | JANK | B117 | M12.T8 |
| J4 | JANK | B117 | M12.T8 |
| J5 | JANK | — | FIXED (M10) |
| J6 | JANK | B117 | M12.T8 |
| J7 | JANK | B117 | M12.T8 |
| J8 | JANK | — | FIXED (M10) |
| J9 | JANK | B117 | M12.T8 |
| J10 | JANK | B117 | M12.T8 |
| J11 | JANK | — | FIXED (M10) |
| J12 | JANK | B117 | M12.T8 |
| J13 | JANK | B117 | M12.T8 |
| J14 | JANK | B117 | M12.T8 |
| J15 | JANK | B117 | M12.T8 |
| J16 | JANK | B117 | M12.T8 |
| J17 | JANK | B117 | M12.T8 |
| J18 | JANK | B117 | M12.T8 |
| J19 | JANK | B117 | M12.T8 |
| T1 | TSK TSK | B67 | M12.T9 |
| T2 | TSK TSK | B73 | M12.T9 |
| T3–T8 | TSK TSK | B118 | M12.T9 |
| T9 | TSK TSK | B75 | M12.T9 |
| T10–T31 | TSK TSK | B118 | M12.T9 |
| T32 | TSK TSK | B74 | M12.T9 |
| T33–T38 | TSK TSK | B118 | M12.T9 |

### B-Number Cross-Reference (Backlog → Roadmap)

| Backlog ID | B# | Disposition |
|---|---|---|
| B-AUDIT-1 (CRIT) | B63 | M10 |
| B-AUDIT-2 (CRIT) | B66 | M12 |
| B-AUDIT-3 (STANK) | B67 | M12 |
| B-AUDIT-4 (STANK) | B76 | Standalone Near-Term |
| B-AUDIT-5 (STANK) | B68 | M12 (DONE) |
| B-AUDIT-6 (JANK) | B69 | M12 (DONE) |
| B-AUDIT-7 (JANK) | B64 | M10 |
| B-AUDIT-8 (JANK) | B75 | M12.T9 |
| B-AUDIT-9 (JANK) | B71 | Standalone Immediate |
| B-AUDIT-10 (JANK) | B80 | Standalone Near-Term |
| B-AUDIT-11 (JANK) | B65 | M10 |
| B-AUDIT-12 (TSK TSK) | B72 | Standalone (DONE) |
| B-AUDIT-13 (TSK TSK) | B77 | Standalone Near-Term |
| B-AUDIT-14 (TSK TSK) | B73 | M12.T9 |
| B-AUDIT-15 (TSK TSK) | B78 | Standalone Near-Term |
| B-AUDIT-16 (TSK TSK) | B79 | Standalone Near-Term |
| B-AUDIT-17 (TSK TSK) | B74 | M12.T9 |
| B-CI-1 | B83 | CI & Tooling Pack |
| B-CI-2 | B84 | CI & Tooling Pack |
| B-CI-3 | B85 | CI & Tooling Pack |
| B-SURF-1 | B91 | Surface Validator Pack |
| B-SURF-2 | B92 | Surface Validator Pack |
| B-SURF-3 | B93 | Surface Validator Pack |
| B-SURF-4 | B94 | Surface Validator Pack |
| B-SURF-5 | B95 | Surface Validator Pack |
| B-TYPE-1 | B96 | Type Surface Pack |
| B-TYPE-2 | B97 | Type Surface Pack |
| B-TYPE-3 | B98 | Type Surface Pack |
| B-FEAT-2 | B99 | Content Attachment |
| B-FEAT-3 | B100 | Deferred |
| B-DOC-1 | B86 | CI & Tooling Pack |
| B-DOC-2 | B87 | CI & Tooling Pack |
| B-DOC-3 | B102 | Process |
| B-CODE-1 | B70 | M12.T7 |
| B-CODE-2 | B81 | Standalone Near-Term |
| B-DX-1 | B82 | Standalone Near-Term |
| B-DX-2 | B103 | Process |
| B-DIAG-1 | B104 | Process |
| B-DIAG-2 | B88 | CI & Tooling Pack |
| B-DIAG-3 | B101 | Deferred |
| B-REL-1 | B89 | CI & Tooling Pack (DONE) |
| B-REL-2 | B90 | CI & Tooling Pack (DONE) |

---

## Final Command

Every milestone has a hard gate. No milestone blurs into the next.
Execution: M10 SENTINEL → **M12 SCALPEL** → M11 COMPASS II. Standalone items fill the gaps.

M12 is top priority. The STANK audit revealed data-loss vectors and O(N^2) paths in core services. These must be resolved before new features land.

BACKLOG.md is now fully absorbed into this file. It can be archived or deleted.
Rejected items live in `GRAVEYARD.md`. Resurrections require an RFC.

---

## Strategic Addendum — Post-M12 Acceleration + Risk Hardening (2026-02-27)

This section appends forward-looking concepts and risk controls discovered while implementing B114/B115.
These are intentionally detailed, but remain unnumbered candidates until explicitly promoted into milestone inventory.

### Innovation Concept I1 — Incremental Canonical State Hashing

**Vision**
Eliminate full canonical sort/serialize/hash on every clean-cache write. Move from O(V+E+P) hash recompute to O(changed-entities) incremental hash maintenance, while preserving deterministic state hash parity with `computeStateHashV5()`.

**Why this matters**
Diff-aware eager post-commit reduced index rebuild cost, but hash recomputation can still dominate large state commits. This is now the next hot-path bottleneck.

**Mini battle plan**
1. Add a feature-gated `StateHashAccumulator` service with deterministic per-collection digests (`nodes`, `edges`, `props`) and a final root digest composition.
2. Extend patch-apply/reducer output to emit hash-relevant delta facts in stable sorted form.
3. Thread optional accumulator updates through `_onPatchCommitted` and `_setMaterializedState`.
4. On divergence, cache miss, or migration boundaries, fall back to full `computeStateHashV5()` and re-seed accumulator.
5. Ship shadow mode first: compute both hashes and assert equality in tests and optionally in debug logs.

**Mitigations**
- Keep full-hash fallback always available and default-enabled under a kill switch.
- Scope rollout to non-audit mode first, then widen after parity confidence is proven.
- Persist no new on-disk format until parity and determinism are validated over replay fixtures.

**Defensive tests**
- Determinism property test: randomized patch order producing equivalent state yields identical incremental hash.
- Differential test: for every patch fixture, `incrementalHash === computeStateHashV5(fullState)`.
- Replay/resume test: checkpoint load + incremental updates produce same hash as cold materialize.
- Kill-switch test: disabling accumulator always forces full-hash behavior.
- Corruption test: injected accumulator mismatch triggers full recompute + warning.

### Innovation Concept I2 — Memoized Ancestry Cache Across Materialize/Sync Cycles

**Vision**
Introduce a bounded, frontier-aware ancestry memoization layer so repeated `_isAncestor()` checks within the same frontier epoch become O(1) lookups, reducing repeated DAG walks in sync and checkpoint replay flows.

**Why this matters**
B115 removes per-patch validation overhead, but ancestry checks still occur in multiple call paths and can recur under repeated sync exchanges.

**Mini battle plan**
1. Add `AncestryCache` keyed by `(writerId, ancestorSha, descendantSha, frontierFingerprint)`.
2. Wire cache lookup into `_relationToCheckpointHead` and sync divergence pre-check paths.
3. Add LRU + epoch invalidation on frontier movement.
4. Emit cache metrics (`hits`, `misses`, `evictions`) in debug observability hooks.
5. Add an emergency bypass option to disable cache for diagnostics.

**Mitigations**
- Tie cache validity to frontier fingerprint to prevent stale ancestry answers.
- Never cache errors from storage-layer failures.
- Use strict memory cap and eviction policy to avoid unbounded growth.

**Defensive tests**
- Correctness test: cached answers match uncached `_isAncestor()` over randomized chains/forks.
- Invalidation test: frontier update invalidates stale entries.
- Stress test: large writer set with churn remains within configured memory bounds.
- Failure-path test: transient `getNodeInfo` errors do not poison cache.

### Innovation Concept I3 — Audit-Mode Diff Synthesis

**Vision**
Retain audit receipts and still unlock incremental index updates by synthesizing `PatchDiff` from applied outcomes when audit mode is enabled.

**Why this matters**
Current audit path uses `diff: null`, which is safe but forfeits B114 hot-path gains for audit-enabled deployments.

**Mini battle plan**
1. Define a deterministic adapter from receipt outcomes to `PatchDiff` (or a subset sufficient for index updates).
2. Implement `applyWithReceiptAndDiff` or companion translator utility.
3. Gate rollout behind an audit-performance flag.
4. Validate parity by comparing synthesized diff effects against full rebuild results.
5. Expand to default-on after burn-in.

**Mitigations**
- If translation ambiguity exists, fall back to `diff: null` for that patch.
- Keep audit commit semantics unchanged; performance optimization must be side-effect free.
- Add structured warning when synthesis is skipped.

**Defensive tests**
- Equivalence test: audit-mode synthesized diff path produces identical logical index/query answers as full rebuild.
- Partial-diff fallback test: unsupported receipt shapes trigger safe full rebuild.
- Regression test: audit receipt persistence remains byte-for-byte compatible.

### Innovation Concept I4 — Performance Budget Guardrails in CI

**Vision**
Turn hot-path performance expectations into enforceable, trend-aware CI checks to prevent accidental regressions in materialize, eager commit, and ancestry validation.

**Why this matters**
Performance fixes are vulnerable to silent regressions without explicit budgets and telemetry snapshots.

**Mini battle plan**
1. Add benchmark harness with stable fixture generator and repeat-run median reporting.
2. Capture baseline medians in repository-managed budget files.
3. Add CI job that flags regressions above tolerance thresholds.
4. Add local dev command to run quick smoke benchmarks before push.
5. Publish historical trend artifact per PR for review.

**Mitigations**
- Use percentile/median thresholds to reduce flakiness.
- Separate noisy micro-benchmarks from deterministic scenario benchmarks.
- Allow explicit, reviewed budget updates when justified.

**Defensive tests**
- Harness self-test: fixture generation is deterministic.
- Budget parser test: malformed budget files fail loudly.
- CI integration test: intentional slowdown fixture triggers regression failure.

### Innovation Concept I5 — `warp doctor` Integrity and Performance Diagnostics

**Vision**
Provide a first-class diagnostics command that reports health and readiness: frontier consistency, checkpoint integrity, index staleness, ancestry anomalies, and GC/checkpoint recommendations.

**Why this matters**
Operators need fast, explainable diagnosis before data repair, performance tuning, or migration decisions.

**Mini battle plan**
1. Define command contract and structured output schema (`--json` + human mode).
2. Implement read-only checks for refs/frontier/checkpoint/index shard metadata.
3. Add actionable recommendations with explicit confidence levels.
4. Add remediation pointers (`runGC`, `createCheckpoint`, `materialize`) without mutating by default.
5. Add machine-consumable exit codes for CI/preflight integration.

**Mitigations**
- Keep default mode non-destructive.
- Mark uncertain checks as warnings, not hard failures.
- Include command runtime budget to avoid pathological scans by default.

**Defensive tests**
- Golden-output tests for both human and JSON modes.
- Corruption fixture tests (missing blobs, mismatched shard frontier) emit expected findings.
- Exit-code contract tests for clean/warn/fail states.

### Innovation Concept I6 — Frontier-Aware Query Result Cache

**Vision**
Cache expensive read/query results keyed by frontier fingerprint + query signature + observer projection, with strict invalidation rules to preserve correctness.

**Why this matters**
Read-heavy workloads repeatedly recompute equivalent traversals even when frontier is unchanged.

**Mini battle plan**
1. Introduce cache interface and canonical query signature generation.
2. Bind cache entries to frontier fingerprint and observer config hash.
3. Integrate with query builder execution path as optional optimization layer.
4. Add metrics and hit-rate instrumentation.
5. Roll out to specific query families first (neighbors/path/property-heavy).

**Mitigations**
- Hard invalidate on any frontier movement.
- Include projection/redaction config in key to avoid cross-view leakage.
- Cap memory and provide TTL plus LRU eviction.

**Defensive tests**
- Correctness test: cached and uncached query outputs match across varied projections.
- Invalidation test: commit advances frontier and invalidates stale entries.
- Isolation test: different observer configs never share cached results.
- Memory test: eviction policy bounds retained entries.

### Concern Hardening C1 — Schema 4 Checkpoint Ancestry Validation Gap

**Concern**
`_validatePatchAgainstCheckpoint()` currently gates only schema 2/3 checkpoints, while schema 4 checkpoints are used in replay paths. This can unintentionally bypass ancestry validation for schema 4.

**Mitigation vision**
Unify checkpoint ancestry semantics across all active checkpoint schema versions (2/3/4), with explicit compatibility handling for future versions.

**Mini battle plan**
1. Update `_validatePatchAgainstCheckpoint` gate to include schema 4.
2. Add explicit comment and helper (`isCheckpointSchemaWithFrontier`) to avoid future drift.
3. Add coverage for schema 4 acceptance/rejection branches.
4. Add one migration-compatibility test to ensure schema 2/3 behavior remains unchanged.

**Defensive tests**
- Schema 4 `ahead` case passes.
- Schema 4 `same` and `behind` cases reject with backfill error.
- Schema 4 `diverged` case rejects with fork error.
- Mixed-schema replay fixture verifies no behavior regression.

### Concern Hardening C2 — Remaining Full-Hash Hot Path Cost

**Concern**
Even with diff-aware view updates, `_setMaterializedState()` computes canonical state hash from full state each call, preserving O(V+E+P) work on eager writes.

**Mitigation vision**
Stage incremental hash support with strict parity checks and safe rollback to full recomputation.

**Mini battle plan**
1. Instrument and log current hash cost distribution under representative fixtures.
2. Land incremental hash accumulator behind feature flag.
3. Run shadow parity in CI and local stress tests.
4. Flip default only after parity and performance gates hold across multiple releases.

**Defensive tests**
- Benchmark regression tests around hash-heavy workloads.
- Differential hash parity tests across random patch streams.
- Feature-flag toggling tests proving behavior equivalence.

### Concern Hardening C3 — Tip-Only Validation Assumes Chain Integrity

**Concern**
B115 validates ancestry once at writer tip. This is valid under linear chain assumptions, but chain-order integrity should be asserted defensively to catch storage anomalies/corruption.

**Mitigation vision**
Preserve tip-only performance while adding optional integrity assertions that verify contiguous parent linkage for loaded writer patch ranges.

**Mini battle plan**
1. Add optional integrity checker (`assertContiguousWriterChain`) for debug/preflight modes.
2. Run integrity assertion in targeted contexts: checkpoint replay and `warp doctor`.
3. Decide runtime default: off in hot path, on in diagnostics/CI corruption suites.
4. Emit actionable diagnostics when chain discontinuity is detected.

**Defensive tests**
- Positive chain test: contiguous range passes with zero warnings.
- Discontinuity test: injected parent mismatch throws/flags deterministic error.
- Missing commit metadata test: checker fails closed with explicit reason.
- Performance test: integrity checker remains disabled in default hot path.

### Suggested Sequencing (If Promoted)

1. Start with concern hardening C1 (low effort, high correctness leverage).
2. Implement I4 (performance guardrails) before deeper performance refactors.
3. Land I2 ancestry cache and C3 integrity diagnostics in parallel tracks.
4. Proceed with I1 incremental hash and then I3 audit diff synthesis.
5. Add I5 (`warp doctor`) and I6 query caching once observability and guardrails are in place.
