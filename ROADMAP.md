# ROADMAP — @git-stunts/git-warp

> **Current version:** v12.2.0
> **Last reconciled:** 2026-02-26 (backlog fully absorbed)

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

## Milestone 12 — SCALPEL

**Theme:** Algorithmic performance & correctness guards
**Objective:** Fix CRIT/STANK hotspots from the 2026-02-25 cognitive complexity audit. Eliminate O(N^2) and O(N*E) paths in core services.
**Triage date:** 2026-02-25

### M12.T1 — Critical Performance Fix

- **Status:** `PENDING`

**Items:**

- **B66** (INCREMENTAL INDEX O(E) SCAN) — `IncrementalIndexUpdater.apply()` scans every alive edge on node re-add. O(N * E) with batch re-adds on a 1M-edge graph. Fix: use adjacency map (already in materialized state) for O(degree) lookup. Promoted from B-AUDIT-2 (CRIT). **File:** `src/domain/services/IncrementalIndexUpdater.js:107-127`

### M12.T2 — Corruption Guard

- **Status:** `PENDING`

**Items:**

- **B70** (PATCHBUILDER ASSERTNOTCOMMITTED) — `PatchBuilderV2` silently allows method calls after `commit()`, producing corrupt patches or silent no-ops. Add `_committed` flag + `assertNotCommitted()` guard on all mutating methods. From B-CODE-1. **Files:** `src/domain/services/PatchBuilderV2.js`, `test/unit/domain/services/PatchBuilderV2.test.js`

### M12.T3 — Algorithmic Rewrites

- **Status:** `PENDING`

**Items:**

- **B67** (JOINREDUCER RECEIPT O(N*M)) — `nodeRemoveOutcome()`/`edgeRemoveOutcome()` scan all OR-Set entries per observed dot. Fix: maintain persistent `dot → elementId` reverse index populated during `orsetAdd`. Promoted from B-AUDIT-3 (STANK). **Files:** `src/domain/services/JoinReducer.js:192-212, 258-278`
- **B68** (TOPOLOGICALSORT O(N^2)) — ✅ Replaced sorted-array merge with MinHeap ready queue. O(N log N). Removed dead `_insertSorted` method. Promoted from B-AUDIT-5 (STANK). **File:** `src/domain/services/GraphTraversal.js`
- **B69** (QUERYBUILDER UNBOUNDED FAN-OUT) — ✅ Added `batchMap()` (bounded concurrency, limit=100) + per-run `propsMemo` cache. Where-clause, result-building, and aggregation paths all use both. Promoted from B-AUDIT-6 (JANK). **File:** `src/domain/services/QueryBuilder.js`

**M12 Gate:** B66 uses adjacency map (benchmark proves O(degree)); B67 reverse index passes receipt correctness tests; B68 topologicalSort benchmarks O(N log N); B69 fused where-pass green; B70 PatchBuilder throws on post-commit mutation.

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
| B72 | **ZERO-OID CONSTRUCTION FRAGILE** — `'0'.repeat(newOid.length)` assumes SHA-1. Replace with `ZERO_OID` constant + length assert. From B-AUDIT-12 (TSK TSK). **File:** `src/infrastructure/adapters/GitGraphAdapter.js:579` |
| B73 | **`orsetClone` VIA JOIN WITH EMPTY SET** — add `orsetClone()` that directly copies entries + tombstones instead of joining with empty set. From B-AUDIT-14 (TSK TSK). **File:** `src/domain/services/JoinReducer.js:854-862` |
| B74 | **WRITER `commitPatch` REENTRANCY COMMENT** — document why `_commitInProgress` check-and-set is safe (JS single-threaded, synchronous check cannot be preempted). From B-AUDIT-17 (TSK TSK). **File:** `src/domain/warp/Writer.js:180-195` |
| B75 | **VV COUNTER=0 ELISION** — document invariant ("VV entries with counter=0 are equivalent to absent entries") and assert at serialization time. From B-AUDIT-8 (JANK). **File:** `src/domain/crdt/VersionVector.js:189-190` |

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

### Milestones: M10 → M11 → M12

1. **M10 SENTINEL** — Trust + sync safety + correctness (B1, B39, B40, B63, B64, B65, B2 spec)
2. **M11 COMPASS II** — Developer experience (B2 impl, B3, B11)
3. **M12 SCALPEL** — Algorithmic performance + corruption guards (B66, B67, B68, B69, B70)

### Critical Path

```text
B1  ──→ [M10 GATE] ──→ B2(impl) ──→ [M11 GATE] ──→ B66 ──→ [M12 GATE]
B39 ──┘      │          B3                            B70
B40 ──┘      │          B11                           B67
B63 ──┘      │                                        B68
B64 ──┘      │                                        B69
B65 ──┘      │
B2(spec) ────┘
```

### Standalone Priority Sequence

Pick opportunistically between milestones. Recommended order within tiers:

1. **Immediate** (B46, B47, B26, B71–B75) — any order, each ≤30 min
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
| **Milestone (M12)** | 5 | B66, B67, B68, B69, B70 |
| **Standalone** | 52 | B12, B19, B22, B26, B28, B34–B37, B43, B44, B46–B55, B57, B71–B88, B91–B99, B102–B104 |
| **Standalone (done)** | 2 | B89, B90 |
| **Deferred** | 8 | B4, B7, B16, B20, B21, B27, B100, B101 |
| **Rejected** | 7 | B5, B6, B13, B17, B18, B25, B45 |
| **Total tracked** | **84** (2 done) | |

### B-Number Cross-Reference (Backlog → Roadmap)

| Backlog ID | B# | Disposition |
|---|---|---|
| B-AUDIT-1 (CRIT) | B63 | M10 |
| B-AUDIT-2 (CRIT) | B66 | M12 |
| B-AUDIT-3 (STANK) | B67 | M12 |
| B-AUDIT-4 (STANK) | B76 | Standalone Near-Term |
| B-AUDIT-5 (STANK) | B68 | M12 |
| B-AUDIT-6 (JANK) | B69 | M12 |
| B-AUDIT-7 (JANK) | B64 | M10 |
| B-AUDIT-8 (JANK) | B75 | Standalone Immediate |
| B-AUDIT-9 (JANK) | B71 | Standalone Immediate |
| B-AUDIT-10 (JANK) | B80 | Standalone Near-Term |
| B-AUDIT-11 (JANK) | B65 | M10 |
| B-AUDIT-12 (TSK TSK) | B72 | Standalone Immediate |
| B-AUDIT-13 (TSK TSK) | B77 | Standalone Near-Term |
| B-AUDIT-14 (TSK TSK) | B73 | Standalone Immediate |
| B-AUDIT-15 (TSK TSK) | B78 | Standalone Near-Term |
| B-AUDIT-16 (TSK TSK) | B79 | Standalone Near-Term |
| B-AUDIT-17 (TSK TSK) | B74 | Standalone Immediate |
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
| B-CODE-1 | B70 | M12 |
| B-CODE-2 | B81 | Standalone Near-Term |
| B-DX-1 | B82 | Standalone Near-Term |
| B-DX-2 | B103 | Process |
| B-DIAG-1 | B104 | Process |
| B-DIAG-2 | B88 | CI & Tooling Pack |
| B-DIAG-3 | B101 | Deferred |
| B-REL-1 | B89 | CI & Tooling Pack |
| B-REL-2 | B90 | CI & Tooling Pack |

---

## Final Command

Every milestone has a hard gate. No milestone blurs into the next.
Execution: M10 SENTINEL → M11 COMPASS II → M12 SCALPEL. Standalone items fill the gaps.

BACKLOG.md is now fully absorbed into this file. It can be archived or deleted.
Rejected items live in `GRAVEYARD.md`. Resurrections require an RFC.
