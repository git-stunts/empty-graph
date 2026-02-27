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

## Horizon Appendix — Post-Cooldown Concept + Concern Pack (2026-02-27)

This appendix is intentionally additive and non-disruptive to current milestone accounting.
These entries are drafted as fully-fleshed candidates for prioritization after review cooldown.

### Concept Vision Pack

#### H1 — Time-Travel Delta Engine (`warp diff --ceiling A --ceiling B`)

**Vision:**
Turn seek/materialize ceilings into a first-class forensic primitive. Users should be able to ask, “what changed between causal horizons A and B?” and get deterministic node/edge/property deltas, optional provenance attribution, and machine-readable output for automation.

**Mini battle plan:**
1. Contract phase:
- Define CLI UX: `warp diff --ceiling <a> --ceiling <b> [--json|--ndjson] [--summary|--full]`.
- Define output schema: `{addedNodes, removedNodes, addedEdges, removedEdges, changedProps}` with stable ordering.
- Define ceiling semantics for edge cases: `A==B`, `A=0`, missing writers, pinned frontiers.
2. MVP phase:
- Reuse existing materialization path with two state snapshots and deterministic diffing.
- Add fast path for `A==B` and zero delta.
- Return compact summary by default; full payload via explicit flag.
3. Hardening phase:
- Integrate optional provenance slices (`--with-provenance`) for changed items.
- Add guardrails for large output (`--max-items`, truncation marker).
- Add performance budget checks in CI for medium-sized graphs.

**Defensive tests:**
- Property test: `diff(A, A)` is always empty.
- Consistency test: `apply(diff(A,B), stateA) == stateB` for supported operations.
- Determinism test: repeated diff calls produce byte-identical JSON after canonical sort.
- Multi-writer edge test: concurrent add/remove/prop updates respect CRDT semantics.

**Primary risks:**
- Memory pressure from dual-state materialization on large graphs.
- User confusion between structural and semantic/provenance diff modes.

---

#### H2 — Trust-Aware Query Mode

**Vision:**
Make trust policy operational at query time, not just verification time. Users can choose whether traversal/query results include all data, only trusted-writer data, or annotated data with trust confidence.

**Mini battle plan:**
1. Contract phase:
- Define modes: `--trust-mode off|annotate|enforce`.
- Define filtering semantics: writer-level inclusion/exclusion and fallback behavior when trust is degraded.
- Define payload shape for annotations (`writerId`, `trustStatus`, `reasonCode`).
2. MVP phase:
- Evaluate trust once per query request, cache per-request assessment.
- Apply writer-based filtering in traversal/query result assembly.
- Emit warnings when mode is `annotate` and untrusted contributors are present.
3. Hardening phase:
- Add explicit degraded state handling (`trust chain unreadable` != `not configured`).
- Add policy knobs for mixed-trust graphs.
- Add metrics for trust-filter impact (dropped results, affected subgraphs).

**Defensive tests:**
- Contract tests for each mode and failure state (configured, not_configured, degraded/error).
- Regression tests ensuring `off` mode behavior matches current baseline exactly.
- Security test: enforce mode must never leak untrusted-writer artifacts.
- Snapshot tests for annotated output payload.

**Primary risks:**
- Breaking user expectations if implicit filtering occurs without clear diagnostics.
- Increased latency if trust evaluation repeats unnecessarily.

---

#### H3 — Provenance Heatmap + Causal Cone Visualizer

**Vision:**
Provide immediate intuition about write hotspots and causal dependency depth. Given a target node/edge/property, render a causal cone and highlight churn intensity to support debugging, incident response, and evolution analysis.

**Mini battle plan:**
1. Contract phase:
- Define API/CLI: `warp provenance heatmap`, `warp provenance cone --target ...`.
- Define visualization payload schema (nodes, edges, weights, timestamps).
- Define deterministic layout seed handling for reproducible diagrams.
2. MVP phase:
- Use existing provenance index to compute cone and patch frequency.
- Export JSON + optional Mermaid/HTML render.
- Provide summary stats: depth, fan-in, high-churn nodes.
3. Hardening phase:
- Add sampling for very large cones.
- Add filters by writer/time range/operation type.
- Add “explain this value” one-shot workflow for support/debug.

**Defensive tests:**
- Cone correctness tests against hand-built miniature patch histories.
- Stability tests: same input and seed yields same output ordering/layout hints.
- Performance tests on synthetic high-fan-in graphs.
- Fuzz tests for malformed target identifiers.

**Primary risks:**
- Large cone explosion without sampling limits.
- Visualization layer becoming a maintenance burden if tightly coupled to core.

---

#### H4 — Checkpoint Policy Advisor

**Vision:**
Shift checkpoint tuning from guesswork to measured policy recommendations. Advisor inspects patch cadence, materialize timings, and cache behavior to propose `checkpointPolicy.every` and optional GC cadence.

**Mini battle plan:**
1. Contract phase:
- Define advisor command: `warp checkpoint advise [--window <n>]`.
- Define output: recommended policy, confidence, expected gains, tradeoffs.
- Define telemetry inputs and privacy boundaries.
2. MVP phase:
- Collect/aggregate core signals already emitted by timing/logger paths.
- Compute heuristic recommendation bands (conservative/balanced/aggressive).
- Expose dry-run simulation: “what if policy X?”.
3. Hardening phase:
- Add workload profiles (read-heavy, write-heavy, mixed).
- Add guardrails to avoid over-checkpointing thrash.
- Store policy-change audit trail.

**Defensive tests:**
- Scenario tests with synthetic workloads and expected recommendation ranges.
- Regression tests: no recommendation when evidence quality is low.
- Safety tests: advisor never suggests invalid/degenerate values.
- Determinism tests for same telemetry window.

**Primary risks:**
- Overfitting heuristics to narrow workload assumptions.
- Recommendation trust erosion if confidence scoring is opaque.

---

#### H5 — Conflict Simulator Mode

**Vision:**
Provide a deterministic sandbox for modeling concurrent writer behavior before production rollout. Teams can simulate interleavings, inspect receipts/conflicts, and validate convergence guarantees under stress.

**Mini battle plan:**
1. Contract phase:
- Define scenario format (`writers`, `ops`, `interleavings`, `seed`).
- Define outputs: final state hash, per-op receipts, conflict report.
- Define replay compatibility with real patch format.
2. MVP phase:
- Build runner that executes scenarios through existing reducer semantics.
- Add deterministic seed-based interleaving generator.
- Emit machine-readable artifacts for CI diffing.
3. Hardening phase:
- Add canned scenarios for known footguns.
- Add minimization helper to shrink failing scenarios.
- Add compatibility mode for historical schema versions.

**Defensive tests:**
- Convergence tests: multiple interleavings produce equivalent final state.
- Differential tests: simulator output matches live engine replay output.
- Flake resistance tests with repeated seeded runs.
- Input validation tests for malformed scenarios.

**Primary risks:**
- Divergence between simulator and real pipeline if abstractions drift.
- Misleading confidence if scenarios are too simplistic.

---

#### H6 — Offline Bundle Export/Import for Air-Gapped Sync

**Vision:**
Enable secure graph/trust transfer where network sync is unavailable. Bundle includes selected refs, trust records, integrity manifests, and optional signatures; import verifies before applying.

**Mini battle plan:**
1. Contract phase:
- Define bundle manifest format and signature envelope.
- Define CLI: `warp bundle export` / `warp bundle import --verify`.
- Define partial export scope (graph-only, trust-only, checkpoint-only).
2. MVP phase:
- Implement deterministic packing of refs + blobs + metadata.
- Implement verification pipeline (hashes, trust chain integrity, manifest schema).
- Add dry-run import report.
3. Hardening phase:
- Add chunking/streaming for large bundles.
- Add compatibility matrix across versions.
- Add replay protection and origin identity metadata.

**Defensive tests:**
- Tamper tests: modified bundle must fail verification deterministically.
- Round-trip tests: export→import yields identical frontier/state hash.
- Backward compatibility tests across supported schema versions.
- Large-bundle stress tests.

**Primary risks:**
- Security footguns in partially verified imports.
- Operational complexity for version negotiation.

---

#### H7 — Query Plan Telemetry + Explain Mode

**Vision:**
Introduce explainability for query/traversal execution: which index path was used, when fallback happened, and where time/memory were spent. Reduce “why is this slow?” debugging time.

**Mini battle plan:**
1. Contract phase:
- Define `--explain` payload for query/traverse commands.
- Define stable telemetry fields (indexUsed, fallbackReason, neighborFetchCount, cacheHits).
- Define redaction policy for sensitive IDs in logs.
2. MVP phase:
- Instrument traversal/query engine at key decision points.
- Emit explain report in JSON/NDJSON.
- Add summary in human-readable CLI output.
3. Hardening phase:
- Add per-phase timings and warning thresholds.
- Add regression benchmark gates to detect performance drift.
- Add trace correlation IDs for distributed workflows.

**Defensive tests:**
- Snapshot tests for explain payload schema stability.
- Unit tests for fallback reason classification.
- Regression tests that telemetry collection does not alter behavior.
- Overhead tests to cap instrumentation cost.

**Primary risks:**
- Telemetry overhead in hot loops.
- Schema churn breaking downstream tooling.

---

#### H8 — Kairos Timeline Command (Branch Event Geometry)

**Vision:**
Expose branch-event structure directly: fork/join timelines, writer divergence windows, and convergence points. Make Chronos (linear patch ticks) and Kairos (branch structure) both inspectable in one tool.

**Mini battle plan:**
1. Contract phase:
- Define output model for event graph: nodes (events), edges (causal/branch links), annotations.
- Define CLI: `warp timeline kairos [--from ... --to ... --format mermaid|json]`.
- Define ordering rules for stable output across runs.
2. MVP phase:
- Build event graph from writer refs + ancestry relationships.
- Render textual summary + JSON graph payload.
- Include quick metrics (fork count, max divergence depth, mean convergence latency).
3. Hardening phase:
- Add filters by writer/subgraph/time.
- Add compact mode for CI/report integration.
- Integrate with provenance cone command for cross-navigation.

**Defensive tests:**
- Determinism tests for event ordering and IDs.
- Correctness tests on synthetic fork/join histories.
- Performance tests on long multi-writer histories.
- Output parser tests for Mermaid and JSON modes.

**Primary risks:**
- Ambiguity in representing complex multi-parent histories.
- User overload if visuals are too dense by default.

---

### Concern Hardening Pack

#### C-H1 — Fragile Error-String Matching for Trust Ref Absence

**Concern:**
`readRecords()` currently infers “ref missing” by substring matching on error messages.
This is adapter-dependent and brittle under localization or message wording changes.

**Mitigation strategy:**
1. Introduce typed persistence error codes (`E_REF_NOT_FOUND`, `E_REF_IO`, etc.).
2. Update trust read path to branch on error code, not string text.
3. Keep temporary compatibility shim with explicit TODO removal milestone.

**Defensive tests:**
- Adapter contract tests that assert standardized error codes.
- Trust read tests with localized/custom error messages to verify no false classification.
- Regression tests for existing adapters to ensure old behavior remains correct until shim removal.

**Exit criteria:**
No trust-path logic depends on raw error message text for control flow.

---

#### C-H2 — Public Materialization Freeze Contract Ambiguity

**Concern:**
Top-level frozen return objects changed identity semantics. Callers may assume returned `state` is the same reference as internal cache and mutate/compare by identity.

**Mitigation strategy:**
1. Document explicit public contract: shallow-frozen wrapper, internal substructures may share references.
2. Add helper API for safe mutable clone when needed (`materializeMutable()` or utility clone call guidance).
3. Add compatibility notes in migration docs/changelog.

**Defensive tests:**
- Contract tests asserting returned state is frozen and top-level identity differs from `_cachedState`.
- Tests ensuring readonly behavior triggers mutation failures in strict mode.
- Tests proving internal cache is not corrupted by attempted public mutation.

**Exit criteria:**
No ambiguity in docs/tests around identity and mutability guarantees of public materialization APIs.

---

#### C-H3 — `CachedValue` Null-Value Semantics

**Concern:**
`_isValid()` treats `null` as “no cache,” so legitimate `null` compute results never cache as valid entries.
This can cause repeated recompute churn and unexpected behavior.

**Mitigation strategy:**
1. Introduce explicit `hasComputedValue` sentinel independent from `_value` content.
2. Preserve existing API shape while allowing `null` to be cached as a valid payload.
3. Add migration note if any behavior changes for callers that used null as “absent”.

**Defensive tests:**
- Test that `compute -> null` is cached within TTL and not recomputed.
- Test invalidate still clears sentinel and forces recompute.
- Test serialization/metadata paths behave correctly for null payloads.

**Exit criteria:**
Cache validity is based on cache state, not payload truthiness/value class.

---

#### C-H4 — Trust Error Payload Assembly Duplication

**Concern:**
Verifier and CLI build similar trust error payloads independently.
This creates drift risk in `source`, `reasonCode`, and response shape.

**Mitigation strategy:**
1. Extract a shared helper factory for trust error/not-configured payload builders.
2. Make source/reason semantics centralized and table-driven.
3. Add schema assertion at boundaries to prevent accidental divergence.

**Defensive tests:**
- Golden tests asserting verifier and CLI produce identical payload structure for equivalent error conditions.
- Schema conformance tests on all trust payload variants.
- Snapshot tests to detect accidental field drift.

**Exit criteria:**
Single-source trust payload composition for common states; CLI and service outputs remain shape-compatible by construction.

---

### Recommended Sequencing (when cooldown ends)

1. `C-H1` and `C-H4` first (trust correctness and consistency foundation).
2. `C-H2` next (contract/documentation hardening around materialization freeze behavior).
3. `C-H3` next (semantic cleanup of cache null handling).
4. `H1` and `H7` as first feature wave (high practical operator value with moderate implementation risk).
5. `H2` and `H5` as second feature wave (policy + simulation leverage).
6. `H3`, `H4`, `H8`, then `H6` based on bandwidth and ecosystem demand.

