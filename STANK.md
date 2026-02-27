# STANK.md — Weirdness & Cognitive Complexity Audit

**Codebase:** `@git-stunts/git-warp` v12.0.0
**Date:** 2026-02-26
**Method:** Static audit, 9 parallel agents + second-opinion pass, deduplicated
**Scope:** All domain services, CRDT primitives, infrastructure adapters, CLI, utilities

---

## Severity Key

| Label | Meaning |
|-------|---------|
| **CRIT** | Immediately fix this. Race conditions, silent data loss, or logic that will inevitably break under load. |
| **STANK** | WTF — rewrite this. Fundamentally broken mental models, convoluted spaghetti, or blatant O(N^2) in hot paths. |
| **JANK** | Works but... ooof. Fragile house-of-cards logic, hidden side effects, difficult to maintain. |
| **TSK TSK** | Kinda bad; we'll point it out, but it can stay. Minor style issues or slightly suboptimal logic. |

CLS = Cognitive Load Score (1-10). 1-3: needs a comment. 4-7: prone to logic errors during maintenance. 8-10: wizard code, dangerous to touch.

---

## CRIT — Immediately Fix This

### C1. Silent Sync Divergence Skip + Stale Cache After Sync Apply

**Location:** `SyncProtocol.js:419-431` / `processSyncRequest`; `SyncController.js:286` / `applySyncResponse`
**CLS:** 9/10

**Diagnosis:** Two compounding problems in the sync path:

1. When a writer's chain forks, the error is caught, logged as a warning, and `continue`d. The requester receives fewer patches than expected with **no indication sync is incomplete** — no error in the response, no "skipped writers" list. Silent data loss.

2. Sync apply mutates `_cachedState`, `_lastFrontier`, and `_stateDirty` directly, but **skips the canonical state-install path** (`_setMaterializedState`). Query fast paths in `query.methods.js:47` and `query.methods.js:143` can then read stale index/provider data against a newer state. Classic spooky action at a distance.

**Un-Stank Plan:**
- Return explicit `{ skippedWriters: [...] }` in sync response. Fail closed on divergence by default.
- Route sync-applied state through `_setMaterializedState()` (or hard-invalidate `_logicalIndex/_propertyReader/_materializedGraph.provider` + mark dirty).
- Update `_maxObservedLamport` from received patches.

---

### C2. Forward-Compatible Ops Silently Dropped

**Location:** `SyncProtocol.js:517` / `applySyncResponse`; `MessageSchemaDetector.js:85` / `assertOpsCompatible`; `JoinReducer.js:121` default case
**CLS:** 8/10

**Diagnosis:** `assertOpsCompatible` is effectively a no-op for v3 readers, and the reducer's default case silently ignores unknown ops. Net effect: forward ops from a newer writer can be **dropped with no hard failure**. Combined with C1's silent skip, a requester can lose data from both known and unknown op types without any signal.

**Un-Stank Plan:** Add explicit op allowlist validation before `join()` in sync apply path. Fail closed by default; add opt-in compatibility mode if desired.

---

### C3. Type Casts Without Runtime Guards in Receipt Path

**Location:** `JoinReducer.js:614-637` / `applyWithReceipt`
**CLS:** 7/10

**Diagnosis:** `op` is cast to per-operation shapes (`{node: string, dot: Dot}`) inside switch cases with **no structural validation**. If `op.node` is missing, the cast lies and downstream crashes. Violates IRONCLAD ratchet rules ("no cast-to-shut-up").

**Un-Stank Plan:** Add runtime type guards before each cast, or validate op shape at patch decode time and reject malformed ops early.

---

### C4. `getCurrentState()` Callback — Time-of-Call Race Condition

**Location:** `PatchBuilderV2.js:80,216,333,421`
**CLS:** 8/10

**Diagnosis:** The builder calls `getCurrentState()` on-demand during operation queueing. If the callback re-materializes, the state read in `removeNode()` differs from the state read in `setEdgeProperty()`. In multi-writer scenarios with concurrent patches, cascade deletions succeed or fail **non-deterministically** based on when the callback is invoked.

**Un-Stank Plan:** Snapshot state once at builder construction time. Document the contract: "state is frozen at builder creation, not at op-queue time."

---

### C5. Backwards Provenance Semantics

**Location:** `PatchBuilderV2.js:135-156,183,299-302,435-436`
**CLS:** 8/10

**Diagnosis:** `_reads` means "operands I consulted in a remove," NOT "state I read before acting." `addEdge` marks endpoint nodes as reads (line 299) but `addNode` doesn't read anything. Undocumented semantic; anyone extending op types will get this wrong, corrupting provenance queries (`patchesFor`, `materializeSlice`).

**Un-Stank Plan:** Rename `_reads` to `_removeDependencies` or `_observedOperands`. Add inline JSDoc block explaining the semantic model for each op type.

---

### C6. Lamport Counter Silently Resets on Malformed Commit

**Location:** `Writer.js:127-138` / `beginPatch`
**CLS:** 9/10

**Diagnosis:** If the previous commit message is corrupted, the catch block silently resets the Lamport counter to 1. This **breaks the monotonicity invariant** of Lamport clocks — future patches may have lower timestamps than earlier ones, corrupting LWW property resolution across the entire graph.

**Un-Stank Plan:** Throw on malformed commit message. If recovery is desired, scan backwards for the last valid lamport. Never allow a clock to go backwards.

---

### C7. GC Mutates State In-Place With No Transaction Boundary

**Location:** `GCPolicy.js:101-122` / `executeGC`
**CLS:** 7/10

**Diagnosis:** Mutates the input `state` directly via `orsetCompact()`. No transaction boundary — if compaction throws halfway, state is left **partially mutated** with some tombstones removed but others intact. No validation of `appliedVV` parameter. Callers who don't expect mutation get corrupted state.

**Un-Stank Plan:** Clone state before compaction, or wrap in try/catch that restores original on failure. Add runtime validation of `appliedVV`.

---

### C8. Error Handler Re-parses `process.argv`

**Location:** `warp-graph.js:81-82` / error handler
**CLS:** 5/10

**Diagnosis:** Error handler uses `process.argv.includes('--json')` instead of the already-parsed `options` object. If parsing throws early, the error handler's argv scan may disagree with what the main parser would have produced, emitting the **wrong output format**.

**Un-Stank Plan:** Use `options.json` / `options.ndjson` from the parsed state. If parsing itself fails, default to text (not JSON).

---

## STANK — WTF, Rewrite This

### S1. 8+ Independent Caches With No Unified Invalidation

**Location:** `WarpGraph.js:83-197` (cache fields); `patch.methods.js:487-531` / `join()`
**CLS:** 8/10

**Diagnosis:** `_cachedState`, `_stateDirty`, `_materializedGraph`, `_adjacencyCache`, `_lastFrontier`, `_cachedFrontier`, `_cachedViewHash`, `_cachedIndexTree`, `_logicalIndex`, `_propertyReader` — all updated at different times, in different methods, with a single boolean `_stateDirty` as the only coherence mechanism.

Compounding: `join(otherState)` at `patch.methods.js:531` updates `_cachedState` directly and skips cache/index/materialized-graph refresh. `_cachedViewHash` survives `_stateDirty = true`, so index rebuilds use stale hashes.

**Un-Stank Plan:** Replace independent fields with a `CacheState` object carrying per-component dirty bits (`{ state, adjacency, index, frontier }`). Single `invalidate(component)` method. Route `join()` and sync-apply through `_setMaterializedState()`.

---

### S2. Edge Properties Encoded as `\x01`-Prefixed Node Properties

**Location:** `PatchBuilderV2.js:417-437` / `setEdgeProperty`
**CLS:** 9/10

**Diagnosis:** Instead of a dedicated `EdgePropSet` operation, edge props are smuggled through `PropSet` by prepending `\x01` to the "node" field. The discriminator is scattered across 4+ files using three different syntaxes (`charCodeAt(0) === 1`, `.startsWith(EDGE_PROP_PREFIX)`, raw string check). If a node ID ever starts with `\x01`, silent corruption.

**Un-Stank Plan:** Promote edge properties to an explicit `EdgePropSet` operation type in the patch schema. Migration: detect schema <= 3 and translate on read.

---

### S3. Sync Delta Assumes Remote Is Always Ahead

**Location:** `SyncProtocol.js:246-257` / `computeSyncDelta`
**CLS:** 8/10

**Diagnosis:** When local and remote SHAs differ, the delta unconditionally puts the range in `needFromRemote`. If local is actually ahead, the direction is backwards. A boolean guard on line 273 masks this by preventing double-entry, but correctness relies on `loadPatchRange()` throwing `E_SYNC_DIVERGENCE` — **exception handling as control flow**.

**Un-Stank Plan:** Replace with bidirectional ancestry check using `isAncestor()`. Compute direction explicitly before building delta.

---

### S4. Zero-Pad CAS Uses `newOid.length` Instead of Fixed 40

**Location:** `GitGraphAdapter.js:579` / `compareAndSwapRef`
**CLS:** 7/10

**Diagnosis:** `'0'.repeat(newOid.length)` generates a wrong-length null ref if `newOid` is a short SHA. Git interprets `'0000000'` (7 chars) as "update only if ref currently points to OID 0000000" instead of "update only if ref doesn't exist." Silent CAS semantics corruption.

**Un-Stank Plan:** Change to `'0'.repeat(40)` or use the Git constant `0000000000000000000000000000000000000000`. Validate `newOid` is full-length.

---

### S5. O(E x nodesAdded) Edge Rescan in Incremental Indexing

**Location:** `IncrementalIndexUpdater.js:99-128` / `computeDirtyShards`
**CLS:** 7/10
**Complexity:** Current O(E) per qualifying diff -> O(E x |nodesAdded|). Best: O(sum(deg(node))) with endpoint index.

**Diagnosis:** When nodes are re-added (dead -> alive transition), the entire alive edge set is rescanned per node to find edges that now become visible. Adding 1,000 nodes triggers 1,000 full scans. The code itself documents this as "deferred for future optimization."

**Un-Stank Plan:** Maintain reverse adjacency index (`node -> edgeKeys`) so reactivation only touches incident edges.

---

### S6. Double Bitmap Deserialization in `_purgeNodeEdges`

**Location:** `IncrementalIndexUpdater.js:241-320` / `_purgeNodeEdges`
**CLS:** 6/10

**Diagnosis:** When purging a dead node's edges, each bitmap is deserialized to find targets, then deserialized again to zero it out, then serialized back. For each target, the peer's bitmap is also deserialized and re-serialized. 2-4x the necessary work. `bitmap.clear()` would be O(1).

**Un-Stank Plan:** Deserialize once, mutate in-place, serialize once. Use `bitmap.clear()` instead of replacing with a new empty bitmap.

---

### S7. Eager Post-Commit Full State Recomputation

**Location:** `patch.methods.js:231` / `_onPatchCommitted`; `StateSerializerV5.js:81`; `materializeAdvanced.methods.js:149`
**CLS:** 8/10
**Complexity:** Current ~O((V+E+P) log N) per commit. Best: O(delta).

**Diagnosis:** After every successful write, the eager post-commit path calls `_setMaterializedState`, which recomputes canonical state hash via full sort/serialize and can trigger view rebuild. Expensive whole-state work is attached to every successful write when cache is clean.

**Un-Stank Plan:** Use diff-aware incremental update in eager path (pass patch diff). Defer full hash/index rebuild to explicit materialization checkpoints.

---

### S8. Quadratic Ancestry Walking in `_loadPatchesSince`

**Location:** `checkpoint.methods.js:187` / `_loadPatchesSince`; `fork.methods.js:237,271`
**CLS:** 7/10
**Complexity:** Current O(P x L) per writer, worst O(P^2) for linear chains. Best: O(P) with memoized ancestry.

**Diagnosis:** For each patch since checkpoint, code re-runs ancestry relation checks that walk chains via `_isAncestor`. This compounds into quadratic-ish chain walking under long tails.

**Un-Stank Plan:** Validate writer relation once per tip/range, not once per patch SHA. Memoize ancestry results per writer.

---

### S9. `_materializeGraph` Always Re-materializes Even on Clean State

**Location:** `materialize.methods.js:244` / `_materializeGraph`
**CLS:** 8/10
**Complexity:** Current ~O(W + deltaP + rebuild). Best: O(1) cache hit or O(W) frontier fingerprint check.

**Diagnosis:** `_materializeGraph()` always calls `materialize()`, even on clean state, so read-heavy flows can repeatedly enter writer discovery and patch load/reduce paths. Hidden perf tax in a read API.

**Un-Stank Plan:** Add fast-return when `_cachedState` exists, `!_stateDirty`, and frontier fingerprint is unchanged.

---

## JANK — Works But Ooof

### J1. O(N^2) Topological Sort (splice + insertSorted in Kahn's Loop)

**Location:** `GraphTraversal.js:862-871` / `topologicalSort`
**CLS:** 6/10
**Complexity:** O(N^2) on top of Kahn's O(N+E). Best: O(N+E) with priority queue.

**Diagnosis:** Ready-queue maintained via array splice (O(N) shift) + sorted merge (O(N) per insertion) inside the tight loop.

**Un-Stank Plan:** Use a priority queue or deque. Eliminate O(N) splice + _insertSorted.

---

### J2. Unbounded `Promise.all` in Query Execution (3 sites)

**Location:** `QueryBuilder.js:651,660-676,721-736,776-793` / `run`, `_runAggregate`
**CLS:** 6/10

**Diagnosis:** `match('*')` on a large graph fires N concurrent `getNodeProps()` calls with no backpressure. Pattern appears in where-clause filtering (line 660), result building (line 721), and aggregation (line 776 — sequential triple loop with no parallelization). Props are re-fetched at each stage with no per-run memo.

**Un-Stank Plan:** Add per-run `nodeId -> props` memo. Batch `Promise.all` with concurrency limit (~100). Use pattern-specific seed shortcuts (exact/prefix/ID path).

---

### J3. Two Git I/O Calls in `readRef`

**Location:** `GitGraphAdapter.js:540-561` / `readRef`
**CLS:** 4/10

**Diagnosis:** `refExists()` (show-ref --verify) followed by `rev-parse`. The second call can still fail for dangling refs, so the first check is incomplete. +50ms latency per readRef.

**Un-Stank Plan:** Use `rev-parse` alone with explicit exit-code handling (like `isAncestor` already does).

---

### J4. Sequential Blob Reads in `readTree`

**Location:** `GitGraphAdapter.js:458-467` / `readTree`
**CLS:** 4/10

**Diagnosis:** For-await loop reads blobs one at a time. 100-blob tree = 100 serial round-trips. Comment says "avoid spawning too many concurrent reads" but provides no concurrency pool.

**Un-Stank Plan:** Replace with pooled concurrency (semaphore, batch size 10-20).

---

### J5. Dead Write: `visible.cbor` Serialized But Never Loaded

**Location:** `CheckpointService.js:161-165` / `createV5`
**CLS:** 4/10

**Diagnosis:** Two different serialization functions produce two different outputs. `visible.cbor` is written every checkpoint but never loaded during `loadCheckpoint()`. Dead I/O on every checkpoint creation.

**Un-Stank Plan:** Delete the `visible.cbor` write path.

---

### J6. O(E+P) Linear Scan Per Cascade Delete

**Location:** `PatchBuilderV2.js:45-64` / `findAttachedData`
**CLS:** 5/10
**Complexity:** O(E+P) per removeNode. Deleting N nodes = O(N*(E+P)).

**Diagnosis:** Scans ALL edges and ALL properties to find ones touching a node. No index. Should use adjacency/neighbor index.

**Un-Stank Plan:** Use GraphTraversal's neighbor index instead of full scans.

---

### J7. Schema Version Computed 3x Per Write, Never Cached

**Location:** `PatchBuilderV2.js:498,610`; `MessageSchemaDetector.js:48-57`
**CLS:** 4/10

**Diagnosis:** `.some()` scan in `build()`, again in `commit()`, and again in `detectSchemaVersion()`. Ops array is not frozen between calls.

**Un-Stank Plan:** Compute once and cache when ops are finalized (after first `setEdgeProperty()` call).

---

### J8. Mutating Set While Iterating in `orsetCompact`

**Location:** `ORSet.js:292-306` / `orsetCompact`
**CLS:** 5/10

**Diagnosis:** Deletes from `dots` Set inside its own `for...of` loop. Works in V8 but technically undefined per ECMAScript spec. If iterator implementation changes, this breaks silently.

**Un-Stank Plan:** Collect deletions in a temporary array, then apply after iteration.

---

### J9. Async Cache Race Condition in `CachedValue`

**Location:** `CachedValue.js:69-80` / `get()`
**CLS:** 6/10

**Diagnosis:** Two concurrent `get()` calls both pass `_isValid()`, both call `_compute()`, second write silently overwrites first. No promise memoization or locking.

**Un-Stank Plan:** Memoize the in-flight promise: if `_computing` is set, return it instead of spawning a new computation.

---

### J10. Dual FNV-1a Implementations With Different Semantics

**Location:** `src/domain/utils/shardKey.js:11-18` (UTF-8 bytes); `src/domain/utils/fnv1a.js:13-20` (charCodeAt)
**CLS:** 6/10

**Diagnosis:** `shardKey.js` uses `TextEncoder` for UTF-8 bytes. `fnv1a.js` uses `charCodeAt` on the raw string. They produce **different hashes for non-ASCII input**. If callers use the wrong function, shard placement is silently inconsistent.

**Un-Stank Plan:** Single implementation. Choose UTF-8 bytes (correct for internationalization). Delete the charCodeAt variant or alias it.

---

### J11. View/Index Build Failures Silently Swallowed

**Location:** `materializeAdvanced.methods.js:149,175` / `_buildView`
**CLS:** 7/10

**Diagnosis:** Build failures are caught and system silently falls back to linear scans. Read behavior shifts in distant modules (`query.methods.js:47`, `query.methods.js:189`) without explicit caller signal. Degrades from O(1) indexed lookups to O(E) scans.

**Un-Stank Plan:** Promote to structured degraded mode with explicit status bit + optional strict throw. Make callers choose fallback policy.

---

### J12. Public APIs Return Live Internal State References

**Location:** `materialize.methods.js:230`; `materializeAdvanced.methods.js:223,460`
**CLS:** 7/10

**Diagnosis:** Materialized state, adjacency maps, and provider objects are returned as live references. External mutation can corrupt internal invariants with zero dirty-flag signaling.

**Un-Stank Plan:** Return frozen or cloned state for public APIs. Keep mutable state private.

---

### J13. Redundant CAS Pre-Check in PatchSession

**Location:** `PatchSession.js:212-221` / `commit()`
**CLS:** 4/10

**Diagnosis:** Reads the ref, checks against expected head, then `PatchBuilderV2.commit()` does its own CAS. Double I/O + TOCTOU window between the two checks.

**Un-Stank Plan:** Remove the pre-check. Let the builder's CAS be the single source of truth.

---

### J14. Checkpoint Load Failure Silently Falls Back to Full Replay

**Location:** `checkpoint.methods.js:168` / `_loadLatestCheckpoint`
**CLS:** 6/10

**Diagnosis:** Any checkpoint read/decode failure becomes `null`, silently changing execution mode from incremental to full replay. Debugging requires knowing hidden swallow behavior.

**Un-Stank Plan:** Catch only not-found conditions. Log and surface decode/corruption errors (or strict-mode throw).

---

### J15. Trust Record Read Errors Conflated With Empty Config

**Location:** `TrustRecordService.js:111` / `readRecords`; `AuditVerifierService.js:672`
**CLS:** 6/10

**Diagnosis:** Trust chain read errors return `[]`, and verifier maps that to "not configured." Operational failure and true empty trust config are conflated. Verifier emits "not configured" verdict instead of "degraded" or "error."

**Un-Stank Plan:** Return typed ok/error result (or throw typed `TrustError`) so verifier can emit degraded/error trust verdict.

---

### J16. `_hasSchema1Patches` Checks Tips Only, Not Full History

**Location:** `checkpoint.methods.js:237-248`
**CLS:** 6/10

**Diagnosis:** Docs say "any schema:1 patches," implementation checks only current writer tips. Older schema-1 history can slip through migration boundary checks.

**Un-Stank Plan:** Either rename to tip-only heuristic or scan back to migration boundary/checkpoint marker. Or persist migration metadata flag.

---

### J17. Mutable `pastCommand` State Machine Without Documented Phases

**Location:** `infrastructure.js:219-279` / `extractBaseArgs`
**CLS:** 4/10

**Diagnosis:** Once the first non-flag arg is seen, all remaining args silently change classification behavior. No explicit phase documentation. Easy to misread when adding new base flags.

**Un-Stank Plan:** Document the state machine phases: `0 = pre-command, 1 = found-command, 2 = reading command args`.

---

### J18. Global Mutable `NATIVE_ROARING_AVAILABLE` Export

**Location:** `BitmapIndexBuilder.js:24-32`
**CLS:** 4/10

**Diagnosis:** Module-level mutable singleton state exported to callers. Test isolation issue if tests toggle native/WASM bindings. Not thread-safe.

**Un-Stank Plan:** Move flag inside instance, or make it a lazy getter with test-reset support.

---

### J19. JSON.stringify + Sort on Every Cache Key Lookup

**Location:** `GraphTraversal.js:168-169` / `_getNeighbors`
**CLS:** 4/10

**Diagnosis:** If `options.labels` is a Set, it's sorted and JSON-stringified on **every** call, even cache hits. Cache key generation should be cheap.

**Un-Stank Plan:** Pre-compute and cache the labels key string. Or use a composite key structure.

---

## TSK TSK — Kinda Bad, But It Can Stay

| # | Location | One-liner |
|---|----------|-----------|
| T1 | `JoinReducer.js:192-278` | Receipt-path removal outcome scans O(|dots| x |entries|) — diff path already has `buildDotToElement` index |
| T2 | `JoinReducer.js:854-862` | Cloning OR-Sets via `orsetJoin(x, empty)` — works but cognitively backwards |
| T3 | `JoinReducer.js:103-108` | `edgeBirthEvent` treated as optional with no explanation why |
| T4 | `CheckpointService.js:243-244` | Schema version = `indexTree ? 4 : 2`; schema:3 exists in load path but never created |
| T5 | `GitGraphAdapter.js:609-622` | One-liner validation wrappers that just delegate to imports |
| T6 | `GitGraphAdapter.js:273-306` | `commitNode` / `commitNodeWithTree` — 70% code duplication |
| T7 | `GitGraphAdapter.js:399-413` | `logNodesStream` silently strips NUL from user format string |
| T8 | `CborCodec.js:96-129` | O(n log n) key-sort on every encode, even pre-sorted input |
| T9 | `VersionVector.js:182-195` | `vvDeserialize` silently drops zero counters — intentional but undocumented |
| T10 | `LWW.js:128-144` | `lwwMax()` null-handling is defensive but unused in practice |
| T11 | `ORSet.js:221-250` | `orsetJoin()` inconsistent cloning strategy between a and b branches |
| T12 | `EventId.js:56-78` | SHA comparison is lexicographic (arbitrary order) but not documented as such |
| T13 | `QueryBuilder.js:183-250` | Deep freeze + structuredClone + JSON fallback on every query result |
| T14 | `MaterializedViewService.js:111-118` | `mulberry32` bit manipulation with unexplained magic numbers |
| T15 | `MaterializedViewService.js:65-103` | Hardcoded `'props_'` prefix in two places (DRY violation) |
| T16 | `WriterError.js:27-39` | Inverted constructor signature breaks error pattern used by 18+ other error classes |
| T17 | `StorageError.js:30` | Extends `IndexError` instead of `WarpError` — wrong hierarchy level |
| T18 | `canonicalStringify.js:13-43` | No cycle detection — stack overflow on circular refs |
| T19 | `matchGlob.js:1-49` | Unbounded regex cache with no eviction |
| T20 | `LRUCache.js:33-42` | Delete-reinsert pattern for access tracking (2x Map ops per get) |
| T21 | `DagTraversal.js:103`; `DagTopology.js:153` | `Array.shift()` as queue pop — O(N^2) traversal; use head-index pointer |
| T22 | `Dot.js:105-134` | WriterIds with colons parsed via `lastIndexOf(':')` — fragile, no escape mechanism |
| T23 | `SyncProtocol.js:341-352,436-441` | Scattered Map <-> Object conversions for frontier serialization |
| T24 | `SyncProtocol.js:498-505` | Redundant grouping of already-grouped patches |
| T25 | `CheckpointService.js:154-159` | Conditional clone (compact=true only) violates immutability contract |
| T26 | `CheckpointService.js:195-203` | O(P) scan for CONTENT_PROPERTY_KEY; no index |
| T27 | `infrastructure.js:172-190` | `preprocessView` injects synthetic 'ascii' then validates; confusing error UX |
| T28 | `schemas.js:105,184-185` | `z.coerce.number()` can produce Infinity; error messages unclear |
| T29 | `StorageError.js:38-42` | Implicit context merging, silent key overwrites |
| T30 | `RefLayout.js:389-430` | `parseWriterIdFromRef()` returns null for all failure modes — can't distinguish "not a writer ref" from "malformed" |
| T31 | `EventId.js:24-46` | `createEventId()` writerId validation too loose (doesn't match RefLayout rules) |
| T32 | `Writer.js:180-195` | Silent `_commitInProgress` flag reset in finally block hides error classification |
| T33 | `PatchSession.js:252-256` | Post-commit ops throw generic `Error` instead of `WriterError` |
| T34 | `MaterializedViewService.js:128-141` | `sampleNodes()` fallback when sample is empty changes distribution |
| T35 | `IncrementalIndexUpdater.js:349-361` | `_ensureLabel` loops to find max ID — O(L) per new label, O(L^2) amortized |
| T36 | `IncrementalIndexUpdater.js:755-764` | `getRoaringBitmap32()` called on every `_deserializeBitmap` (memoized, but wasteful pattern) |
| T37 | `ORSet.js:321-340` | `orsetSerialize` calls `decodeDot()` on every sort comparison — O(N log N) decodes |
| T38 | `VersionVector.js:160-173` | `vvSerialize` creates + sorts key array on every call |

---

## Top 5 Un-Stank Plans (Highest ROI)

1. **Fix C1+S3 (SyncProtocol):** Return explicit `{ skippedWriters }` in sync response. Replace "assume remote ahead" delta with bidirectional ancestry check. Remove silent `continue` on divergence. Route sync-applied state through `_setMaterializedState()`.

2. **Fix S1 (Cache coherence):** Replace 8 independent fields with a `CacheState` object carrying per-component dirty bits. Single `invalidate(component)` method. Route `join()` and sync-apply through canonical state-install path.

3. **Fix C6 (Lamport reset):** Throw on malformed commit message. If recovery is desired, scan backwards for the last valid lamport. Never allow a clock to go backwards.

4. **Fix S2 (Edge property hack):** Promote to explicit `EdgePropSet` operation type. Migration: detect schema <= 3 and translate on read.

5. **Fix S5+S6 (Incremental index):** Replace O(E) edge rescan with per-node adjacency index lookup. In `_purgeNodeEdges`, deserialize once, mutate in-place, serialize once.

---

## Methodology

- 9 parallel audit agents covering all source files (~15,000 LOC)
- Second-opinion pass on WarpGraph method files, sync path, and trust services
- Findings deduplicated and cross-referenced
- Static analysis only; no fault-injection or runtime reproduction
