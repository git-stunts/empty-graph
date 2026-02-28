# Complexity & Cognitive Load Audit (February 2026)

**Codebase:** `@git-stunts/git-warp` v12.0.0 (audit baseline)
**Date:** 2026-02-26
**Method:** Static audit, 9 parallel agents + second-opinion pass, deduplicated
**Scope:** All domain services, CRDT primitives, infrastructure adapters, CLI, utilities

**Reconciled:** 2026-02-28 against v12.2.1 release. All 46 items resolved except S2 (deferred to M13).

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

**Status:** ✅ FIXED (v12.2.1, M12.T1, B105)
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

**Status:** ✅ FIXED (v12.2.1, M12.T1, B106)
**Location:** `SyncProtocol.js:517` / `applySyncResponse`; `MessageSchemaDetector.js:85` / `assertOpsCompatible`; `JoinReducer.js:121` default case
**CLS:** 8/10

**Diagnosis:** `assertOpsCompatible` is effectively a no-op for v3 readers, and the reducer's default case silently ignores unknown ops. Net effect: forward ops from a newer writer can be **dropped with no hard failure**. Combined with C1's silent skip, a requester can lose data from both known and unknown op types without any signal.

**Un-Stank Plan:** Add explicit op allowlist validation before `join()` in sync apply path. Fail closed by default; add opt-in compatibility mode if desired.

---

### C3. Type Casts Without Runtime Guards in Receipt Path

**Status:** ✅ FIXED (v12.2.1, M12.T3, B109)
**Location:** `JoinReducer.js:614-637` / `applyWithReceipt`
**CLS:** 7/10

**Diagnosis:** `op` is cast to per-operation shapes (`{node: string, dot: Dot}`) inside switch cases with **no structural validation**. If `op.node` is missing, the cast lies and downstream crashes. Violates IRONCLAD ratchet rules ("no cast-to-shut-up").

**Un-Stank Plan:** Add runtime type guards before each cast, or validate op shape at patch decode time and reject malformed ops early.

---

### C4. `getCurrentState()` Callback — Time-of-Call Race Condition

**Status:** ✅ FIXED (v12.2.0, pre-M12 — `_snapshotState` lazy capture in PatchBuilderV2)
**Location:** `PatchBuilderV2.js:80,216,333,421`
**CLS:** 8/10

**Diagnosis:** The builder calls `getCurrentState()` on-demand during operation queueing. If the callback re-materializes, the state read in `removeNode()` differs from the state read in `setEdgeProperty()`. In multi-writer scenarios with concurrent patches, cascade deletions succeed or fail **non-deterministically** based on when the callback is invoked.

**Un-Stank Plan:** Snapshot state once at builder construction time. Document the contract: "state is frozen at builder creation, not at op-queue time."

---

### C5. Backwards Provenance Semantics

**Status:** ✅ FIXED (v12.2.1, M12.T3, B110 — renamed `_reads` → `_observedOperands`)
**Location:** `PatchBuilderV2.js:135-156,183,299-302,435-436`
**CLS:** 8/10

**Diagnosis:** `_reads` means "operands I consulted in a remove," NOT "state I read before acting." `addEdge` marks endpoint nodes as reads (line 299) but `addNode` doesn't read anything. Undocumented semantic; anyone extending op types will get this wrong, corrupting provenance queries (`patchesFor`, `materializeSlice`).

**Un-Stank Plan:** Rename `_reads` to `_removeDependencies` or `_observedOperands`. Add inline JSDoc block explaining the semantic model for each op type.

---

### C6. Lamport Counter Silently Resets on Malformed Commit

**Status:** ✅ FIXED (v12.2.0, pre-M12 — throws `E_LAMPORT_CORRUPT`)
**Location:** `Writer.js:127-138` / `beginPatch`
**CLS:** 9/10

**Diagnosis:** If the previous commit message is corrupted, the catch block silently resets the Lamport counter to 1. This **breaks the monotonicity invariant** of Lamport clocks — future patches may have lower timestamps than earlier ones, corrupting LWW property resolution across the entire graph.

**Un-Stank Plan:** Throw on malformed commit message. If recovery is desired, scan backwards for the last valid lamport. Never allow a clock to go backwards.

---

### C7. GC Mutates State In-Place With No Transaction Boundary

**Status:** ✅ FIXED (v12.2.1, M12.T3, B111 — hardened GC transaction boundary with input validation)
**Location:** `GCPolicy.js:101-122` / `executeGC`
**CLS:** 7/10

**Diagnosis:** Mutates the input `state` directly via `orsetCompact()`. No transaction boundary — if compaction throws halfway, state is left **partially mutated** with some tombstones removed but others intact. No validation of `appliedVV` parameter. Callers who don't expect mutation get corrupted state.

**Un-Stank Plan:** Clone state before compaction, or wrap in try/catch that restores original on failure. Add runtime validation of `appliedVV`.

---

### C8. Error Handler Re-parses `process.argv`

**Status:** ✅ FIXED (v12.2.1, M12.T3, B112 — intentional fallback documented)
**Location:** `warp-graph.js:81-82` / error handler
**CLS:** 5/10

**Diagnosis:** Error handler uses `process.argv.includes('--json')` instead of the already-parsed `options` object. If parsing throws early, the error handler's argv scan may disagree with what the main parser would have produced, emitting the **wrong output format**.

**Un-Stank Plan:** Use `options.json` / `options.ndjson` from the parsed state. If parsing itself fails, default to text (not JSON).

---

## STANK — WTF, Rewrite This

### S1. 8+ Independent Caches With No Unified Invalidation

**Status:** ✅ FIXED (v12.2.1, M12.T2, B108 — surgical fixes to `join()` + `_cachedViewHash` leak; full `CacheState` refactor deferred)
**Location:** `WarpGraph.js:83-197` (cache fields); `patch.methods.js:487-531` / `join()`
**CLS:** 8/10

**Diagnosis:** `_cachedState`, `_stateDirty`, `_materializedGraph`, `_adjacencyCache`, `_lastFrontier`, `_cachedFrontier`, `_cachedViewHash`, `_cachedIndexTree`, `_logicalIndex`, `_propertyReader` — all updated at different times, in different methods, with a single boolean `_stateDirty` as the only coherence mechanism.

Compounding: `join(otherState)` at `patch.methods.js:531` updates `_cachedState` directly and skips cache/index/materialized-graph refresh. `_cachedViewHash` survives `_stateDirty = true`, so index rebuilds use stale hashes.

**Un-Stank Plan:** Replace independent fields with a `CacheState` object carrying per-component dirty bits (`{ state, adjacency, index, frontier }`). Single `invalidate(component)` method. Route `join()` and sync-apply through `_setMaterializedState()`.

---

### S2. Edge Properties Encoded as `\x01`-Prefixed Node Properties

**Status:** ⏳ DEFERRED → M13 (SCALPEL II, B116 — schema v4 migration requires multi-writer CRDT design phase)
**Location:** `PatchBuilderV2.js:417-437` / `setEdgeProperty`
**CLS:** 9/10

**Diagnosis:** Instead of a dedicated `EdgePropSet` operation, edge props are smuggled through `PropSet` by prepending `\x01` to the "node" field. The discriminator is scattered across 4+ files using three different syntaxes (`charCodeAt(0) === 1`, `.startsWith(EDGE_PROP_PREFIX)`, raw string check). If a node ID ever starts with `\x01`, silent corruption.

**Un-Stank Plan:** Promote edge properties to an explicit `EdgePropSet` operation type in the patch schema. Migration: detect schema <= 3 and translate on read.

---

### S3. Sync Delta Assumes Remote Is Always Ahead

**Status:** ✅ FIXED (v12.2.1, M12.T1, B107 — `isAncestor()` pre-check with chain-walk fallback)
**Location:** `SyncProtocol.js:246-257` / `computeSyncDelta`
**CLS:** 8/10

**Diagnosis:** When local and remote SHAs differ, the delta unconditionally puts the range in `needFromRemote`. If local is actually ahead, the direction is backwards. A boolean guard on line 273 masks this by preventing double-entry, but correctness relies on `loadPatchRange()` throwing `E_SYNC_DIVERGENCE` — **exception handling as control flow**.

**Un-Stank Plan:** Replace with bidirectional ancestry check using `isAncestor()`. Compute direction explicitly before building delta.

---

### S4. Zero-Pad CAS Uses `newOid.length` Instead of Fixed 40

**Status:** ✅ FIXED (v12.0.0, M10, B72 — `'0'.repeat(40)`)
**Location:** `GitGraphAdapter.js:579` / `compareAndSwapRef`
**CLS:** 7/10

**Diagnosis:** `'0'.repeat(newOid.length)` generates a wrong-length null ref if `newOid` is a short SHA. Git interprets `'0000000'` (7 chars) as "update only if ref currently points to OID 0000000" instead of "update only if ref doesn't exist." Silent CAS semantics corruption.

**Un-Stank Plan:** Change to `'0'.repeat(40)` or use the Git constant `0000000000000000000000000000000000000000`. Validate `newOid` is full-length.

---

### S5. O(E x nodesAdded) Edge Rescan in Incremental Indexing

**Status:** FIXED (M12.T4)
**Location:** `IncrementalIndexUpdater.js:99-128` / `computeDirtyShards`
**CLS:** 7/10
**Complexity:** Current O(E) per qualifying diff -> O(E x |nodesAdded|). Best: O(sum(deg(node))) with endpoint index.

**Diagnosis:** When nodes are re-added (dead -> alive transition), the entire alive edge set is rescanned per node to find edges that now become visible. Adding 1,000 nodes triggers 1,000 full scans. The code itself documents this as "deferred for future optimization."

**Un-Stank Plan:** Maintain reverse adjacency index (`node -> edgeKeys`) so reactivation only touches incident edges.

---

### S6. Double Bitmap Deserialization in `_purgeNodeEdges`

**Status:** FIXED (M12.T4)
**Location:** `IncrementalIndexUpdater.js:241-320` / `_purgeNodeEdges`
**CLS:** 6/10

**Diagnosis:** When purging a dead node's edges, each bitmap is deserialized to find targets, then deserialized again to zero it out, then serialized back. For each target, the peer's bitmap is also deserialized and re-serialized. 2-4x the necessary work. `bitmap.clear()` would be O(1).

**Un-Stank Plan:** Deserialize once, mutate in-place, serialize once. Use `bitmap.clear()` instead of replacing with a new empty bitmap.

---

### S7. Eager Post-Commit Full State Recomputation

**Status:** ✅ FIXED (v12.2.1, M12.T5, B114 — diff-aware eager path via `applyWithDiff()`)
**Location:** `patch.methods.js:231` / `_onPatchCommitted`; `StateSerializerV5.js:81`; `materializeAdvanced.methods.js:149`
**CLS:** 8/10
**Complexity:** Current ~O((V+E+P) log N) per commit. Best: O(delta).

**Diagnosis:** After every successful write, the eager post-commit path calls `_setMaterializedState`, which recomputes canonical state hash via full sort/serialize and can trigger view rebuild. Expensive whole-state work is attached to every successful write when cache is clean.

**Un-Stank Plan:** Use diff-aware incremental update in eager path (pass patch diff). Defer full hash/index rebuild to explicit materialization checkpoints.

---

### S8. Quadratic Ancestry Walking in `_loadPatchesSince`

**Status:** ✅ FIXED (v12.2.1, M12.T5, B115 — tip-only ancestry validation per writer)
**Location:** `checkpoint.methods.js:187` / `_loadPatchesSince`; `fork.methods.js:237,271`
**CLS:** 7/10
**Complexity:** Current O(P x L) per writer, worst O(P^2) for linear chains. Best: O(P) with memoized ancestry.

**Diagnosis:** For each patch since checkpoint, code re-runs ancestry relation checks that walk chains via `_isAncestor`. This compounds into quadratic-ish chain walking under long tails.

**Un-Stank Plan:** Validate writer relation once per tip/range, not once per patch SHA. Memoize ancestry results per writer.

---

### S9. `_materializeGraph` Always Re-materializes Even on Clean State

**Status:** ✅ FIXED (v12.2.0, M10 — fast-return guard when `!_stateDirty && _materializedGraph`)
**Location:** `materialize.methods.js:244` / `_materializeGraph`
**CLS:** 8/10
**Complexity:** Current ~O(W + deltaP + rebuild). Best: O(1) cache hit or O(W) frontier fingerprint check.

**Diagnosis:** `_materializeGraph()` always calls `materialize()`, even on clean state, so read-heavy flows can repeatedly enter writer discovery and patch load/reduce paths. Hidden perf tax in a read API.

**Un-Stank Plan:** Add fast-return when `_cachedState` exists, `!_stateDirty`, and frontier fingerprint is unchanged.

---

## JANK — Works But Ooof

### J1. O(N^2) Topological Sort (splice + insertSorted in Kahn's Loop)

**Status:** ✅ FIXED (v12.2.0, M10, B68 — MinHeap-backed ready queue)
**Location:** `GraphTraversal.js:862-871` / `topologicalSort`
**CLS:** 6/10
**Complexity:** O(N^2) on top of Kahn's O(N+E). Best: O(N+E) with priority queue.

**Diagnosis:** Ready-queue maintained via array splice (O(N) shift) + sorted merge (O(N) per insertion) inside the tight loop.

**Un-Stank Plan:** Use a priority queue or deque. Eliminate O(N) splice + _insertSorted.

---

### J2. Unbounded `Promise.all` in Query Execution (3 sites)

**Status:** ✅ FIXED (v12.2.0, M10, B69 — `batchMap()` chunks of 100 + per-run `propsMemo`)
**Location:** `QueryBuilder.js:651,660-676,721-736,776-793` / `run`, `_runAggregate`
**CLS:** 6/10

**Diagnosis:** `match('*')` on a large graph fires N concurrent `getNodeProps()` calls with no backpressure. Pattern appears in where-clause filtering (line 660), result building (line 721), and aggregation (line 776 — sequential triple loop with no parallelization). Props are re-fetched at each stage with no per-run memo.

**Un-Stank Plan:** Add per-run `nodeId -> props` memo. Batch `Promise.all` with concurrency limit (~100). Use pattern-specific seed shortcuts (exact/prefix/ID path).

---

### J3. Two Git I/O Calls in `readRef`

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — single `rev-parse --verify --quiet`)
**Location:** `GitGraphAdapter.js:540-561` / `readRef`
**CLS:** 4/10

**Diagnosis:** `refExists()` (show-ref --verify) followed by `rev-parse`. The second call can still fail for dangling refs, so the first check is incomplete. +50ms latency per readRef.

**Un-Stank Plan:** Use `rev-parse` alone with explicit exit-code handling (like `isAncestor` already does).

---

### J4. Sequential Blob Reads in `readTree`

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — pooled concurrent reads, batch size 16)
**Location:** `GitGraphAdapter.js:458-467` / `readTree`
**CLS:** 4/10

**Diagnosis:** For-await loop reads blobs one at a time. 100-blob tree = 100 serial round-trips. Comment says "avoid spawning too many concurrent reads" but provides no concurrency pool.

**Un-Stank Plan:** Replace with pooled concurrency (semaphore, batch size 10-20).

---

### J5. Dead Write: `visible.cbor` Serialized But Never Loaded

**Status:** ✅ FIXED (v12.2.0, M10 — dead `visible.cbor` write removed)
**Location:** `CheckpointService.js:161-165` / `createV5`
**CLS:** 4/10

**Diagnosis:** Two different serialization functions produce two different outputs. `visible.cbor` is written every checkpoint but never loaded during `loadCheckpoint()`. Dead I/O on every checkpoint creation.

**Un-Stank Plan:** Delete the `visible.cbor` write path.

---

### J6. O(E+P) Linear Scan Per Cascade Delete

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — string prefix/infix checks instead of split+compare)
**Location:** `PatchBuilderV2.js:45-64` / `findAttachedData`
**CLS:** 5/10
**Complexity:** O(E+P) per removeNode. Deleting N nodes = O(N*(E+P)).

**Diagnosis:** Scans ALL edges and ALL properties to find ones touching a node. No index. Should use adjacency/neighbor index.

**Un-Stank Plan:** Use GraphTraversal's neighbor index instead of full scans.

---

### J7. Schema Version Computed 3x Per Write, Never Cached

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — `_hasEdgeProps` boolean cache)
**Location:** `PatchBuilderV2.js:498,610`; `MessageSchemaDetector.js:48-57`
**CLS:** 4/10

**Diagnosis:** `.some()` scan in `build()`, again in `commit()`, and again in `detectSchemaVersion()`. Ops array is not frozen between calls.

**Un-Stank Plan:** Compute once and cache when ops are finalized (after first `setEdgeProperty()` call).

---

### J8. Mutating Set While Iterating in `orsetCompact`

**Status:** ✅ FIXED (v12.2.0, pre-M12 — temp array pattern)
**Location:** `ORSet.js:292-306` / `orsetCompact`
**CLS:** 5/10

**Diagnosis:** Deletes from `dots` Set inside its own `for...of` loop. Works in V8 but technically undefined per ECMAScript spec. If iterator implementation changes, this breaks silently.

**Un-Stank Plan:** Collect deletions in a temporary array, then apply after iteration.

---

### J9. Async Cache Race Condition in `CachedValue`

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — memoize in-flight promise)
**Location:** `CachedValue.js:69-80` / `get()`
**CLS:** 6/10

**Diagnosis:** Two concurrent `get()` calls both pass `_isValid()`, both call `_compute()`, second write silently overwrites first. No promise memoization or locking.

**Un-Stank Plan:** Memoize the in-flight promise: if `_computing` is set, return it instead of spawning a new computation.

---

### J10. Dual FNV-1a Implementations With Different Semantics

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — deleted `fnv1a.js` charCodeAt variant)
**Location:** `src/domain/utils/shardKey.js:11-18` (UTF-8 bytes); `src/domain/utils/fnv1a.js:13-20` (charCodeAt)
**CLS:** 6/10

**Diagnosis:** `shardKey.js` uses `TextEncoder` for UTF-8 bytes. `fnv1a.js` uses `charCodeAt` on the raw string. They produce **different hashes for non-ASCII input**. If callers use the wrong function, shard placement is silently inconsistent.

**Un-Stank Plan:** Single implementation. Choose UTF-8 bytes (correct for internationalization). Delete the charCodeAt variant or alias it.

---

### J11. View/Index Build Failures Silently Swallowed

**Status:** ✅ FIXED (v12.2.0, M10 — `_indexDegraded` flag tracks build failure status)
**Location:** `materializeAdvanced.methods.js:149,175` / `_buildView`
**CLS:** 7/10

**Diagnosis:** Build failures are caught and system silently falls back to linear scans. Read behavior shifts in distant modules (`query.methods.js:47`, `query.methods.js:189`) without explicit caller signal. Degrades from O(1) indexed lookups to O(E) scans.

**Un-Stank Plan:** Promote to structured degraded mode with explicit status bit + optional strict throw. Make callers choose fallback policy.

---

### J12. Public APIs Return Live Internal State References

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — freeze state from public materialization APIs)
**Location:** `materialize.methods.js:230`; `materializeAdvanced.methods.js:223,460`
**CLS:** 7/10

**Diagnosis:** Materialized state, adjacency maps, and provider objects are returned as live references. External mutation can corrupt internal invariants with zero dirty-flag signaling.

**Un-Stank Plan:** Return frozen or cloned state for public APIs. Keep mutable state private.

---

### J13. Redundant CAS Pre-Check in PatchSession

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — removed pre-check, builder CAS is single source of truth)
**Location:** `PatchSession.js:212-221` / `commit()`
**CLS:** 4/10

**Diagnosis:** Reads the ref, checks against expected head, then `PatchBuilderV2.commit()` does its own CAS. Double I/O + TOCTOU window between the two checks.

**Un-Stank Plan:** Remove the pre-check. Let the builder's CAS be the single source of truth.

---

### J14. Checkpoint Load Failure Silently Falls Back to Full Replay

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — catch only "not found"; corruption errors propagate)
**Location:** `checkpoint.methods.js:168` / `_loadLatestCheckpoint`
**CLS:** 6/10

**Diagnosis:** Any checkpoint read/decode failure becomes `null`, silently changing execution mode from incremental to full replay. Debugging requires knowing hidden swallow behavior.

**Un-Stank Plan:** Catch only not-found conditions. Log and surface decode/corruption errors (or strict-mode throw).

---

### J15. Trust Record Read Errors Conflated With Empty Config

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — typed ok/error result from `readRecords`)
**Location:** `TrustRecordService.js:111` / `readRecords`; `AuditVerifierService.js:672`
**CLS:** 6/10

**Diagnosis:** Trust chain read errors return `[]`, and verifier maps that to "not configured." Operational failure and true empty trust config are conflated. Verifier emits "not configured" verdict instead of "degraded" or "error."

**Un-Stank Plan:** Return typed ok/error result (or throw typed `TrustError`) so verifier can emit degraded/error trust verdict.

---

### J16. `_hasSchema1Patches` Checks Tips Only, Not Full History

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — JSDoc clarifying tip-only heuristic)
**Location:** `checkpoint.methods.js:237-248`
**CLS:** 6/10

**Diagnosis:** Docs say "any schema:1 patches," implementation checks only current writer tips. Older schema-1 history can slip through migration boundary checks.

**Un-Stank Plan:** Either rename to tip-only heuristic or scan back to migration boundary/checkpoint marker. Or persist migration metadata flag.

---

### J17. Mutable `pastCommand` State Machine Without Documented Phases

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — phase comments documenting state machine)
**Location:** `infrastructure.js:219-279` / `extractBaseArgs`
**CLS:** 4/10

**Diagnosis:** Once the first non-flag arg is seen, all remaining args silently change classification behavior. No explicit phase documentation. Easy to misread when adding new base flags.

**Un-Stank Plan:** Document the state machine phases: `0 = pre-command, 1 = found-command, 2 = reading command args`.

---

### J18. Global Mutable `NATIVE_ROARING_AVAILABLE` Export

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — instance-level with test-reset support)
**Location:** `BitmapIndexBuilder.js:24-32`
**CLS:** 4/10

**Diagnosis:** Module-level mutable singleton state exported to callers. Test isolation issue if tests toggle native/WASM bindings. Not thread-safe.

**Un-Stank Plan:** Move flag inside instance, or make it a lazy getter with test-reset support.

---

### J19. JSON.stringify + Sort on Every Cache Key Lookup

**Status:** ✅ FIXED (v12.2.1, M12.T8, B117 — pre-computed labels key string)
**Location:** `GraphTraversal.js:168-169` / `_getNeighbors`
**CLS:** 4/10

**Diagnosis:** If `options.labels` is a Set, it's sorted and JSON-stringified on **every** call, even cache hits. Cache key generation should be cheap.

**Un-Stank Plan:** Pre-compute and cache the labels key string. Or use a composite key structure.

---

## TSK TSK — Kinda Bad, But It Can Stay

**Status:** ✅ ALL FIXED (v12.2.1, M12.T9 — B67, B73, B74, B75, B118)

| # | Status | Location | One-liner | Fix |
|---|--------|----------|-----------|-----|
| T1 | ✅ B67 | `JoinReducer.js:192-278` | Receipt-path removal outcome scans O(\|dots\| x \|entries\|) | `buildDotToElement` reverse index |
| T2 | ✅ B73 | `JoinReducer.js:854-862` | Cloning OR-Sets via `orsetJoin(x, empty)` | Dedicated `orsetClone()` |
| T3 | ✅ B118 | `JoinReducer.js:103-108` | `edgeBirthEvent` treated as optional with no explanation why | JSDoc |
| T4 | ✅ B118 | `CheckpointService.js:243-244` | Schema version = `indexTree ? 4 : 2`; schema:3 exists in load path but never created | JSDoc |
| T5 | ✅ B118 | `GitGraphAdapter.js:609-622` | One-liner validation wrappers that just delegate to imports | JSDoc |
| T6 | ✅ B118 | `GitGraphAdapter.js:273-306` | `commitNode` / `commitNodeWithTree` — 70% code duplication | `_createCommit` helper |
| T7 | ✅ B118 | `GitGraphAdapter.js:399-413` | `logNodesStream` silently strips NUL from user format string | JSDoc |
| T8 | ✅ B118 | `CborCodec.js:96-129` | O(n log n) key-sort on every encode, even pre-sorted input | JSDoc |
| T9 | ✅ B75 | `VersionVector.js:182-195` | `vvDeserialize` silently drops zero counters — intentional but undocumented | JSDoc + debug assertion |
| T10 | ✅ B118 | `LWW.js:128-144` | `lwwMax()` null-handling is defensive but unused in practice | JSDoc |
| T11 | ✅ B118 | `ORSet.js:221-250` | `orsetJoin()` inconsistent cloning strategy between a and b branches | b-branch clone via `new Set()` |
| T12 | ✅ B118 | `EventId.js:56-78` | SHA comparison is lexicographic (arbitrary order) but not documented as such | JSDoc |
| T13 | ✅ B118 | `QueryBuilder.js:183-250` | Deep freeze + structuredClone + JSON fallback on every query result | JSDoc |
| T14 | ✅ B118 | `MaterializedViewService.js:111-118` | `mulberry32` bit manipulation with unexplained magic numbers | JSDoc |
| T15 | ✅ B118 | `MaterializedViewService.js:65-103` | Hardcoded `'props_'` prefix in two places (DRY violation) | `PROPS_PREFIX` constant |
| T16 | ✅ B118 | `WriterError.js:27-39` | Inverted constructor signature breaks error pattern used by 18+ other error classes | JSDoc |
| T17 | ✅ B118 | `StorageError.js:30` | Extends `IndexError` instead of `WarpError` — wrong hierarchy level | JSDoc |
| T18 | ✅ B118 | `canonicalStringify.js:13-43` | No cycle detection — stack overflow on circular refs | `WeakSet` cycle detection |
| T19 | ✅ B118 | `matchGlob.js:1-49` | Unbounded regex cache with no eviction | Cache clears at 1000 entries |
| T20 | ✅ B118 | `LRUCache.js:33-42` | Delete-reinsert pattern for access tracking (2x Map ops per get) | JSDoc |
| T21 | ✅ B118 | `DagTraversal.js:103`; `DagTopology.js:153` | `Array.shift()` as queue pop — O(N^2) traversal; use head-index pointer | JSDoc |
| T22 | ✅ B118 | `Dot.js:105-134` | WriterIds with colons parsed via `lastIndexOf(':')` — fragile, no escape mechanism | JSDoc |
| T23 | ✅ B118 | `SyncProtocol.js:341-352,436-441` | Scattered Map \<-\> Object conversions for frontier serialization | `frontierToObject`/`objectToFrontier` helpers |
| T24 | ✅ B118 | `SyncProtocol.js:498-505` | Redundant grouping of already-grouped patches | JSDoc |
| T25 | ✅ B118 | `CheckpointService.js:154-159` | Conditional clone (compact=true only) violates immutability contract | JSDoc |
| T26 | ✅ B118 | `CheckpointService.js:195-203` | O(P) scan for CONTENT_PROPERTY_KEY; no index | JSDoc |
| T27 | ✅ B118 | `infrastructure.js:172-190` | `preprocessView` injects synthetic 'ascii' then validates; confusing error UX | JSDoc |
| T28 | ✅ B118 | `schemas.js:105,184-185` | `z.coerce.number()` can produce Infinity; error messages unclear | `Number.isFinite` refinement |
| T29 | ✅ B118 | `StorageError.js:38-42` | Implicit context merging, silent key overwrites | JSDoc |
| T30 | ✅ B118 | `RefLayout.js:389-430` | `parseWriterIdFromRef()` returns null for all failure modes | JSDoc |
| T31 | ✅ B118 | `EventId.js:24-46` | `createEventId()` writerId validation too loose | JSDoc |
| T32 | ✅ B74 | `Writer.js:180-195` | Silent `_commitInProgress` flag reset in finally block | JSDoc |
| T33 | ✅ B118 | `PatchSession.js:252-256` | Post-commit ops throw generic `Error` instead of `WriterError` | `WriterError` with `SESSION_COMMITTED` |
| T34 | ✅ B118 | `MaterializedViewService.js:128-141` | `sampleNodes()` fallback when sample is empty changes distribution | JSDoc |
| T35 | ✅ B118 | `IncrementalIndexUpdater.js:349-361` | `_ensureLabel` loops to find max ID — O(L) per new label | Cached `_nextLabelId` |
| T36 | ✅ B118 | `IncrementalIndexUpdater.js:755-764` | `getRoaringBitmap32()` called on every `_deserializeBitmap` | JSDoc |
| T37 | ✅ B118 | `ORSet.js:321-340` | `orsetSerialize` calls `decodeDot()` on every sort comparison | Pre-decode all dots before sorting |
| T38 | ✅ B118 | `VersionVector.js:160-173` | `vvSerialize` creates + sorts key array on every call | JSDoc |

---

## Top 5 Un-Stank Plans (Highest ROI) — Status

1. ✅ **C1+S3 (SyncProtocol):** Done (M12.T1). `skippedWriters` in sync response, `isAncestor()` pre-check, state routed through `_setMaterializedState()`.

2. ✅ **S1 (Cache coherence):** Done (M12.T2). Surgical `join()` fix + `_cachedViewHash` leak plugged. Full `CacheState` refactor deferred.

3. ✅ **C6 (Lamport reset):** Done (pre-M12). Throws `E_LAMPORT_CORRUPT`.

4. ⏳ **S2 (Edge property hack):** Deferred to M13 (SCALPEL II). Schema v4 migration requires multi-writer CRDT design phase.

5. ✅ **S5+S6 (Incremental index):** Done (M12.T4). Adjacency cache for re-add restoration, single deserialize-mutate-serialize in purge.

---

## Methodology

- 9 parallel audit agents covering all source files (~15,000 LOC)
- Second-opinion pass on WarpGraph method files, sync path, and trust services
- Findings deduplicated and cross-referenced
- Static analysis only; no fault-injection or runtime reproduction
