 Plan to implement                                                                                                                                                                           │
│                                                                                                                                                                                             │
│ MaterializedView Architectural Overhaul — Enhanced Plan                                                                                                                                     │
│                                                                                                                                                                                             │
│ Context                                                                                                                                                                                     │
│                                                                                                                                                                                             │
│ git-warp has four disconnected systems for persisting/caching graph state: Checkpoints, Seek Cache, Bitmap Index (commit DAG only), and in-memory adjacency. None know about each other.    │
│ The logical graph adjacency — what queries and traversals actually use — is never persisted. Properties are O(N) linear scans. ObserverView rebuilds filtered adjacency from scratch. Topo  │
│ sort, Dijkstra, and A* exist on the commit DAG but not on the logical graph.                                                                                                                │
│                                                                                                                                                                                             │
│ This overhaul unifies them into a single MaterializedView concept. Clean break — semver major bump to 12.0.0. Four phases, each shipping independently.                                     │
│                                                                                                                                                                                             │
│ Full problem statement: THE_PROBLEM.md.                                                                                                                                                     │
│                                                                                                                                                                                             │
│ ---                                                                                                                                                                                         │
│ Determinism Invariants (enforced everywhere)                                                                                                                                                │
│                                                                                                                                                                                             │
│ Documented as header blocks in GraphTraversal.js and MaterializedViewService.js.                                                                                                            │
│                                                                                                                                                                                             │
│ 1. BFS: Nodes at equal depth visited in lexicographic nodeId order                                                                                                                          │
│ 2. DFS: Nodes visited in lexicographic nodeId order (leftmost first via reverse-push)                                                                                                       │
│ 3. PQ/Dijkstra/A*: Equal-priority tie-break by lexicographic nodeId (ascending). Equal-cost path tie-break: update predecessor when altCost === bestCost && candidatePredecessorId <        │
│ currentPredecessorId (lex compare). Same rule for goal node with multiple equal-cost entries.                                                                                               │
│ 4. Kahn (topoSort): Zero-indegree nodes dequeued in lexicographic nodeId order                                                                                                              │
│ 5. Neighbor lists: Every NeighborProviderPort returns edges sorted by (neighborId, label). Use strict codepoint comparison (a < b ? -1 : a > b ? 1 : 0), never localeCompare.               │
│ 6. Numeric IDs: Globally unique via (shardByte << 24) | localId. Sorted within shard, append-only, never renumbered. localId overflow (>= 2^24) throws E_SHARD_ID_OVERFLOW with migration   │
│ guidance.                                                                                                                                                                                   │
│ 7. Label registry: Append-only, IDs never reused                                                                                                                                            │
│ 8. Unlabeled edges: Use label = '' (empty string) as sentinel. Commit DAG edges and any graph without labels use this. Sorting and filtering work uniformly.                                │
│ 9. Direction 'both': Defined as union(out, in) deduped by (neighborId, label). Intentionally lossy about direction — a consumer cannot tell if an edge was outgoing or incoming.            │
│ 10. Lexicographic ordering: Always strict codepoint comparison, never localeCompare                                                                                                         │
│ 11. Never rely on JS Map/Set iteration order for determinism — always explicit sort                                                                                                         │
│ 12. Canonical CBOR: All CBOR writes use sorted map keys. Equivalence tests compare decoded semantics (deep-equal), not raw bytes. Build receipts contain only deterministic fields          │
│ (stateHash, schema, buildVersion, maxLamport) — no timestamps.                                                                                                                              │
│ 13. Roaring bitmaps stored as CBOR byte strings (Uint8Array/Buffer), never base64 strings. Base64-in-CBOR bloats 33% and wastes CPU.                                                        │
│ 14. all bitmap correctness on delete: When any edge for a node is deleted, recompute all(node) = OR(byLabel[labelId] for all labelIds) for that node. Never naively remove from all —       │
│ another label may still have that neighbor.                                                                                                                                                 │
│ 15. Label-set query semantics: options.labels with multiple labels returns the union of those labels. One NeighborEdge per label edge — same neighborId can appear multiple times with      │
│ different labels. Dedup for 'both' direction is by (neighborId, label).                                                                                                                     │
│ 16. Atomicity: MaterializedView updates are immutable-swap. Build new view tree → write updated shards + receipt → swap root OID atomically. Readers see either old or new view, never a    │
│ partial write.                                                                                                                                                                              │
│ 17. Shard format version: Every shard contains version: 1. Enforced on load (E_UNKNOWN_SHARD_VERSION). Future format changes become a version bump, not archaeology.                        │
│ 18. Null-prototype objects: Any structure keyed by nodeId (e.g., nodeIdToLocalId, prop shards) uses Map<string, T> or Object.create(null). Never plain {} — prototype pollution via         │
│ __proto__, constructor, etc. is a correctness + security hole.                                                                                                                              │
│ 19. Canonical CBOR: Implement one encodeCanonicalCbor() utility used everywhere. Sorts map/object keys by strict codepoint order. Never leaks JS insertion-order as serialization order.    │
│ This is real, not aspirational.                                                                                                                                                             │
│ 20. hasNode() semantics: "alive in this view" (visible projection), NOT "ever existed." Meta shards are append-only so tombstoned nodes still have IDs. Keep an aliveLocalIds Roaring       │
│ bitmap (or boolean array) per meta shard, built from visible projection, to answer hasNode() in O(1).                                                                                       │
│ 21. Label cardinality guardrail: If label count exceeds threshold (default 1024), throw E_LABEL_LIMIT_EXCEEDED or switch to sparse per-label storage (byLabel[labelId] = { localIds:        │
│ uint32[], bitmaps: Uint8Array[] }) instead of dense arrays.                                                                                                                                 │
│ 22. Unknown label behavior: If options.labels includes a label not in labels.cbor, return [] immediately. Never create registry entries during reads.                                       │
│ 23. weightFn/heuristicFn purity: Document in GraphTraversal header: these functions must be pure and deterministic for a given (from, to, label) / (nodeId, goalId) within a traversal run, │
│  or determinism is impossible.                                                                                                                                                              │
│ 24. Error taxonomy: Consistent error codes across the system: E_SHARD_ID_OVERFLOW, E_UNKNOWN_SHARD_VERSION, E_LABEL_LIMIT_EXCEEDED, E_ABORTED, E_MAX_NODES_EXCEEDED, E_MAX_DEPTH_EXCEEDED,  │
│ ERR_GRAPH_HAS_CYCLES, E_NODE_NOT_FOUND.                                                                                                                                                     │
│ 25. computeShardKey hex regex case-insensitive: /^[0-9a-f]{40,64}$/i to prevent shard instability from uppercase hex.                                                                       │
│                                                                                                                                                                                             │
│ ---                                                                                                                                                                                         │
│ Phase 1: NeighborProvider + Unified GraphTraversal                                                                                                                                          │
│                                                                                                                                                                                             │
│ Goal                                                                                                                                                                                        │
│                                                                                                                                                                                             │
│ Extract a NeighborProviderPort interface with native label support. Build a single GraphTraversal engine that subsumes both LogicalTraversal and DagTraversal/DagPathFinding/DagTopology.   │
│ Ship algorithms incrementally.                                                                                                                                                              │
│                                                                                                                                                                                             │
│ 1.1 — MinHeap tie-breaking                                                                                                                                                                  │
│                                                                                                                                                                                             │
│ Modify: src/domain/utils/MinHeap.js                                                                                                                                                         │
│                                                                                                                                                                                             │
│ Add optional tieBreaker comparator to constructor:                                                                                                                                          │
│ constructor({ tieBreaker } = {})                                                                                                                                                            │
│ // tieBreaker: (a: T, b: T) => number  (negative = a wins)                                                                                                                                  │
│                                                                                                                                                                                             │
│ _bubbleUp/_bubbleDown: when priorities are equal, delegate to tieBreaker. No tieBreaker = current behavior (backward compat).                                                               │
│                                                                                                                                                                                             │
│ Test: test/unit/domain/utils/MinHeap.tieBreaker.test.js                                                                                                                                     │
│                                                                                                                                                                                             │
│ 1.2 — NeighborProviderPort                                                                                                                                                                  │
│                                                                                                                                                                                             │
│ New: src/ports/NeighborProviderPort.js                                                                                                                                                      │
│                                                                                                                                                                                             │
│ /** @typedef {'out' | 'in' | 'both'} Direction */                                                                                                                                           │
│ /** @typedef {{ labels?: Set<string> }} NeighborOptions */                                                                                                                                  │
│ /** @typedef {{ neighborId: string, label: string }} NeighborEdge */                                                                                                                        │
│                                                                                                                                                                                             │
│ export default class NeighborProviderPort {                                                                                                                                                 │
│   /** @returns {Promise<NeighborEdge[]>} Sorted by (neighborId, label) via codepoint comparison */                                                                                          │
│   async getNeighbors(nodeId, direction, options) { throw new Error('not implemented'); }                                                                                                    │
│                                                                                                                                                                                             │
│   /** @returns {Promise<boolean>} */                                                                                                                                                        │
│   async hasNode(nodeId) { throw new Error('not implemented'); }                                                                                                                             │
│                                                                                                                                                                                             │
│   /** @returns {'sync' | 'async-local' | 'async-remote'} */                                                                                                                                 │
│   get latencyClass() { return 'async-local'; }                                                                                                                                              │
│ }                                                                                                                                                                                           │
│                                                                                                                                                                                             │
│ Labels are native to the interface so bitmap providers can hit per-label shards directly (not fetch-all-then-filter).                                                                       │
│                                                                                                                                                                                             │
│ Unlabeled graphs (commit DAG) use label = '' (empty string sentinel). Sorting and filtering work uniformly.                                                                                 │
│                                                                                                                                                                                             │
│ 1.3 — AdjacencyNeighborProvider                                                                                                                                                             │
│                                                                                                                                                                                             │
│ New: src/domain/services/AdjacencyNeighborProvider.js                                                                                                                                       │
│                                                                                                                                                                                             │
│ Wraps existing { outgoing, incoming } Maps from _buildAdjacency(). Label filtering via Set.has() in-memory. Returns latencyClass: 'sync'.                                                   │
│                                                                                                                                                                                             │
│ Pre-sort at construction: Adjacency lists are sorted once at provider construction (or at _buildAdjacency() time), not on every getNeighbors() call. The contract is that stored lists are  │
│ already sorted by (neighborId, label). For 'both' direction, merges two pre-sorted lists (same logic as current getNeighbors() in LogicalTraversal.js). Dedup by (neighborId, label).       │
│                                                                                                                                                                                             │
│ Test: test/unit/domain/services/AdjacencyNeighborProvider.test.js                                                                                                                           │
│                                                                                                                                                                                             │
│ 1.4 — GraphTraversal engine                                                                                                                                                                 │
│                                                                                                                                                                                             │
│ New: src/domain/services/GraphTraversal.js (~400-500 LOC)                                                                                                                                   │
│                                                                                                                                                                                             │
│ Constructor:                                                                                                                                                                                │
│ constructor({ provider, logger = nullLogger, neighborCacheSize = 256 })                                                                                                                     │
│                                                                                                                                                                                             │
│ Neighbor memoization: Bounded per-run LRU cache (reuse src/domain/utils/LRUCache.js). Cache key: ${nodeId}\0${direction}\0${sortedLabelsOrStar}. Avoids repeated disk reads for Dijkstra/A* │
│  re-expansions. Skipped when provider.latencyClass === 'sync' (no benefit for in-memory).                                                                                                   │
│                                                                                                                                                                                             │
│ Internal sections (one file, clear comment headers):                                                                                                                                        │
│ // ==== Section 1: Configuration & Neighbor Cache ====                                                                                                                                      │
│ // ==== Section 2: Primitive Traversals (BFS, DFS) ====                                                                                                                                     │
│ // ==== Section 3: Path-Finding (shortestPath, Dijkstra, A*, bidirectional A*) ====                                                                                                         │
│ // ==== Section 4: Topology & Components (topoSort, CC, weightedLongestPath) ====                                                                                                           │
│                                                                                                                                                                                             │
│ Direction: 'out' | 'in' | 'both' everywhere. Old 'forward'/'reverse' mapped at adapter boundaries only.                                                                                     │
│                                                                                                                                                                                             │
│ All methods accept:                                                                                                                                                                         │
│ - signal: AbortSignal — checked every N iterations (1000 for BFS/DFS, every expansion for Dijkstra/A*)                                                                                      │
│ - maxNodes: number (default 100000) — hard limit on visited set size                                                                                                                        │
│ - maxDepth: number (default 1000) — depth limit                                                                                                                                             │
│ - hooks: { onVisit, onExpand } — optional instrumentation for debugging                                                                                                                     │
│                                                                                                                                                                                             │
│ Non-breaking compat: In the compat facades (LogicalTraversal delegation), pass through Infinity for maxNodes/maxDepth to match legacy "walk entire graph" behavior. New GraphTraversal      │
│ callers get safe defaults.                                                                                                                                                                  │
│                                                                                                                                                                                             │
│ GraphTraversalStats: All methods return a stats object alongside results: { nodesVisited, edgesTraversed, cacheHits, cacheMisses, elapsedMs }.                                              │
│                                                                                                                                                                                             │
│ Weighted/pathfinding API shape:                                                                                                                                                             │
│ weightedShortestPath({ start, goal, direction, weightFn, signal, maxNodes })                                                                                                                │
│ // weightFn: (fromId, toId, label) => number | Promise<number>                                                                                                                              │
│                                                                                                                                                                                             │
│ aStarSearch({ start, goal, direction, weightFn, heuristicFn, signal, maxNodes })                                                                                                            │
│ // heuristicFn: (nodeId, goalId) => number                                                                                                                                                  │
│                                                                                                                                                                                             │
│ bidirectionalAStar({ start, goal, weightFn, forwardHeuristic, backwardHeuristic, signal })                                                                                                  │
│                                                                                                                                                                                             │
│ Both obey the equal-cost predecessor rule deterministically.                                                                                                                                │
│                                                                                                                                                                                             │
│ topoSort accepts multiple starts: topologicalSort({ start: string | string[], ... }). Discovers reachable nodes from all starts via DFS, then runs Kahn on the union subgraph.              │
│                                                                                                                                                                                             │
│ Add to ESLint relaxation: second block in eslint.config.js (algorithm-heavy file).                                                                                                          │
│                                                                                                                                                                                             │
│ 1.5 — Incremental algorithm shipping order                                                                                                                                                  │
│                                                                                                                                                                                             │
│ Each is its own commit with dedicated tests. Test each "like a psycho."                                                                                                                     │
│                                                                                                                                                                                             │
│ #: 1                                                                                                                                                                                        │
│ Algorithm: bfs                                                                                                                                                                              │
│ Port from: LogicalTraversal                                                                                                                                                                 │
│ Key detail: Async generator. Sorted frontier = deterministic order                                                                                                                          │
│ ────────────────────────────────────────                                                                                                                                                    │
│ #: 2                                                                                                                                                                                        │
│ Algorithm: dfs                                                                                                                                                                              │
│ Port from: LogicalTraversal                                                                                                                                                                 │
│ Key detail: Reverse-push for leftmost-first                                                                                                                                                 │
│ ────────────────────────────────────────                                                                                                                                                    │
│ #: 3                                                                                                                                                                                        │
│ Algorithm: shortestPath                                                                                                                                                                     │
│ Port from: LogicalTraversal                                                                                                                                                                 │
│ Key detail: BFS-based unweighted                                                                                                                                                            │
│ ────────────────────────────────────────                                                                                                                                                    │
│ #: 4                                                                                                                                                                                        │
│ Algorithm: connectedComponent                                                                                                                                                               │
│ Port from: LogicalTraversal                                                                                                                                                                 │
│ Key detail: Delegates to bfs({ direction: 'both' })                                                                                                                                         │
│ ────────────────────────────────────────                                                                                                                                                    │
│ #: 5                                                                                                                                                                                        │
│ Algorithm: isReachable                                                                                                                                                                      │
│ Port from: DagTraversal                                                                                                                                                                     │
│ Key detail: BFS with early termination                                                                                                                                                      │
│ ────────────────────────────────────────                                                                                                                                                    │
│ #: 6                                                                                                                                                                                        │
│ Algorithm: weightedShortestPath                                                                                                                                                             │
│ Port from: DagPathFinding                                                                                                                                                                   │
│ Key detail: Dijkstra. weightFn(from, to, label) => number. Tie-breaking MinHeap + equal-cost predecessor rule                                                                               │
│ ────────────────────────────────────────                                                                                                                                                    │
│ #: 7                                                                                                                                                                                        │
│ Algorithm: aStarSearch                                                                                                                                                                      │
│ Port from: DagPathFinding                                                                                                                                                                   │
│ Key detail: weightFn + heuristicFn(nodeId, goalId) => number. Replace EPSILON trick with nodeId tie-break. Optional explain: true emits compact trace (expansions, f-score progression,     │
│   predecessor updates)                                                                                                                                                                      │
│ ────────────────────────────────────────                                                                                                                                                    │
│ #: 8                                                                                                                                                                                        │
│ Algorithm: bidirectionalAStar                                                                                                                                                               │
│ Port from: DagPathFinding                                                                                                                                                                   │
│ Key detail: forwardHeuristic + backwardHeuristic. Same tie-break rules                                                                                                                      │
│ ────────────────────────────────────────                                                                                                                                                    │
│ #: 9                                                                                                                                                                                        │
│ Algorithm: topologicalSort                                                                                                                                                                  │
│ Port from: DagTopology                                                                                                                                                                      │
│ Key detail: Kahn's. Ready queue sorted by nodeId. `start: string                                                                                                                            │
│ ────────────────────────────────────────                                                                                                                                                    │
│ #: 10                                                                                                                                                                                       │
│ Algorithm: commonAncestors                                                                                                                                                                  │
│ Port from: DagTopology                                                                                                                                                                      │
│ Key detail: Multi-source ancestor intersection                                                                                                                                              │
│ ────────────────────────────────────────                                                                                                                                                    │
│ #: 11                                                                                                                                                                                       │
│ Algorithm: weightedLongestPath                                                                                                                                                              │
│ Port from: NEW                                                                                                                                                                              │
│ Key detail: Calls topoSort first with throwOnCycle: true. Throws ERR_GRAPH_HAS_CYCLES on cycles. DP over reverse topo order                                                                 │
│                                                                                                                                                                                             │
│ Test files: test/unit/domain/services/GraphTraversal.{algorithm}.test.js                                                                                                                    │
│                                                                                                                                                                                             │
│ Strict-mode tests: Assert exact node visit sequences on known graphs with tied frontiers.                                                                                                   │
│                                                                                                                                                                                             │
│ Differential testing harness: Every algorithm test runs twice — once with AdjacencyNeighborProvider, once with BitmapNeighborProvider (from Phase 1.7 stub). Any mismatch prints a minimal  │
│ counterexample graph.                                                                                                                                                                       │
│                                                                                                                                                                                             │
│ Cycle witness: topologicalSort with throwOnCycle: true includes at least one back-edge or small cycle witness in the error context. Saves hours of debugging.                               │
│                                                                                                                                                                                             │
│ 1.6 — Wire into WarpGraph + deprecate LogicalTraversal                                                                                                                                      │
│                                                                                                                                                                                             │
│ Modify: src/domain/WarpGraph.js — traverse getter returns GraphTraversal backed by AdjacencyNeighborProvider from current adjacency.                                                        │
│                                                                                                                                                                                             │
│ Modify: src/domain/services/LogicalTraversal.js — Mark deprecated. Delegates to GraphTraversal internally. No public API change.                                                            │
│                                                                                                                                                                                             │
│ Modify: src/domain/services/CommitDagTraversalService.js — Remains as-is (thin facade) initially. MUST refactor to delegate to GraphTraversal + BitmapNeighborProvider before Phase 2       │
│ ships. One traversal stack, one set of bugs, one set of fixes. Otherwise the "determinism contract applies everywhere" is a half-truth.                                                     │
│                                                                                                                                                                                             │
│ 1.7 — BitmapNeighborProvider stub                                                                                                                                                           │
│                                                                                                                                                                                             │
│ New: src/domain/services/BitmapNeighborProvider.js                                                                                                                                          │
│                                                                                                                                                                                             │
│ Wraps BitmapIndexReader for commit DAG. Returns latencyClass: 'async-local'. Commit DAG edges use label = '' (empty string sentinel). If caller passes options.labels with non-empty        │
│ strings, returns [] (no match). This proves the interface works uniformly for both graph types.                                                                                             │
│                                                                                                                                                                                             │
│ Test: test/unit/domain/services/BitmapNeighborProvider.test.js                                                                                                                              │
│                                                                                                                                                                                             │
│ Phase 1 Verification                                                                                                                                                                        │
│                                                                                                                                                                                             │
│ - All 2828+ existing tests pass (especially WarpGraph.noCoordination.test.js)                                                                                                               │
│ - All CommitDagTraversalService.test.js tests pass unchanged                                                                                                                                │
│ - New GraphTraversal tests cover every algorithm with both provider types                                                                                                                   │
│ - npm run lint passes                                                                                                                                                                       │
│ - npm run test:local green                                                                                                                                                                  │
│                                                                                                                                                                                             │
│ What Ships                                                                                                                                                                                  │
│                                                                                                                                                                                             │
│ All DAG algorithms (topoSort, Dijkstra, A*, etc.) available on logical graph via graph.traverse. No breaking changes. New NeighborProviderPort for extensibility.                           │
│                                                                                                                                                                                             │
│ ---                                                                                                                                                                                         │
│ Phase 2: Logical Graph Bitmap Index                                                                                                                                                         │
│                                                                                                                                                                                             │
│ Goal                                                                                                                                                                                        │
│                                                                                                                                                                                             │
│ Build a bitmap index over the materialized logical graph with labeled edges, hash sharding, stable IDs, and a property index.                                                               │
│                                                                                                                                                                                             │
│ 2.1 — FNV-1a hash utility                                                                                                                                                                   │
│                                                                                                                                                                                             │
│ New: src/domain/utils/fnv1a.js                                                                                                                                                              │
│                                                                                                                                                                                             │
│ export function fnv1a(str) {                                                                                                                                                                │
│   let hash = 0x811c9dc5;                                                                                                                                                                    │
│   for (let i = 0; i < str.length; i++) {                                                                                                                                                    │
│     hash ^= str.charCodeAt(i);                                                                                                                                                              │
│     hash = Math.imul(hash, 0x01000193);  // Math.imul, NOT bare multiply                                                                                                                    │
│   }                                                                                                                                                                                         │
│   return hash >>> 0;                                                                                                                                                                        │
│ }                                                                                                                                                                                           │
│                                                                                                                                                                                             │
│ New: src/domain/utils/shardKey.js                                                                                                                                                           │
│ export function computeShardKey(id) {                                                                                                                                                       │
│   if (/^[0-9a-f]{40,64}$/i.test(id)) { return id.substring(0, 2).toLowerCase(); } // backward compat for SHAs, case-insensitive                                                             │
│   return (fnv1a(id) & 0xff).toString(16).padStart(2, '0');                                                                                                                                  │
│ }                                                                                                                                                                                           │
│                                                                                                                                                                                             │
│ Test: test/unit/domain/utils/fnv1a.test.js — known vectors, verify Math.imul vs naive multiply divergence at large values.                                                                  │
│                                                                                                                                                                                             │
│ 2.2 — Stable numeric ID assignment with global uniqueness                                                                                                                                   │
│                                                                                                                                                                                             │
│ New: src/domain/services/LogicalBitmapIndexBuilder.js                                                                                                                                       │
│                                                                                                                                                                                             │
│ Global numeric ID encoding (fits RoaringBitmap32):                                                                                                                                          │
│ shardByte = parseInt(shardKey, 16)        // 0..255 (8 bits)                                                                                                                                │
│ localId   = append-only counter per shard  // 0..16777215 (24 bits)                                                                                                                         │
│ globalId  = (shardByte << 24) | localId    // 32-bit, globally unique                                                                                                                       │
│                                                                                                                                                                                             │
│ localId >= 2^24 throws E_SHARD_ID_OVERFLOW with guidance to add more shard bits or use Roaring64.                                                                                           │
│                                                                                                                                                                                             │
│ ID assignment (not insertion-order like current BitmapIndexBuilder):                                                                                                                        │
│ 1. Assign each nodeId to shard via computeShardKey(nodeId)                                                                                                                                  │
│ 2. Within each shard, sort nodeIds lexicographically before assigning localIds                                                                                                              │
│ 3. Persist { nodeId → localId, nextLocalId } per shard in meta_XX.cbor                                                                                                                      │
│ 4. On rebuild with existing mappings: existing IDs preserved, new nodes sorted and appended after nextLocalId                                                                               │
│ 5. Never renumber existing IDs                                                                                                                                                              │
│                                                                                                                                                                                             │
│ 2.3 — Append-only label registry                                                                                                                                                            │
│                                                                                                                                                                                             │
│ Format: labels.cbor in index tree                                                                                                                                                           │
│ { version: 1, labels: { "manages": 0, "owns": 1, ... }, nextId: 2 }                                                                                                                         │
│                                                                                                                                                                                             │
│ New labels get nextId++. Old labels keep their IDs forever.                                                                                                                                 │
│                                                                                                                                                                                             │
│ 2.4 — Shard structure (CBOR, not JSON) — no file explosion                                                                                                                                  │
│                                                                                                                                                                                             │
│ Per-label bitmaps are embedded inside each shard file, not separate files. This keeps the file count bounded at ~768 files regardless of label count (vs 200 labels × 256 shards × 2 dirs = │
│  102K files with the naive layout).                                                                                                                                                         │
│                                                                                                                                                                                             │
│ index/                                                                                                                                                                                      │
│   meta_00.cbor ... meta_ff.cbor    # nodeId ↔ localId mappings + nextLocalId watermark                                                                                                      │
│   labels.cbor                       # label registry (append-only: { labelString → labelId, nextId })                                                                                       │
│   fwd_00.cbor  ... fwd_ff.cbor    # forward edge bitmaps per source-node shard                                                                                                              │
│   rev_00.cbor  ... rev_ff.cbor    # reverse edge bitmaps per target-node shard                                                                                                              │
│   props_00.cbor ... props_ff.cbor  # property index shards                                                                                                                                  │
│   receipt.cbor                      # build receipt (stateHash, schema, buildVersion, maxLamport)                                                                                           │
│                                                                                                                                                                                             │
│ Meta shard structure (meta_XX.cbor):                                                                                                                                                        │
│ {                                                                                                                                                                                           │
│   version: 1,                                                                                                                                                                               │
│   nodeIds: string[],                    // nodeIds[localId] = nodeId (fast reverse lookup)                                                                                                  │
│   nodeIdToLocalId: Map<string, number>, // fast forward lookup (Map or Object.create(null), NEVER plain {})                                                                                 │
│   nextLocalId: number,                  // watermark for append-only assignment                                                                                                             │
│   aliveLocalIds: Uint8Array             // serialized RoaringBitmap32 of alive nodes (from visible projection)                                                                              │
│ }                                                                                                                                                                                           │
│                                                                                                                                                                                             │
│ hasNode(nodeId) = localId exists in meta AND aliveLocalIds.has(localId). Meta shards are append-only, but tombstoned nodes are NOT alive.                                                   │
│                                                                                                                                                                                             │
│ Meta shard caching: Cache meta shards separately from edge shards (different LRU). Meta is small and hit constantly for globalId↔nodeId translation.                                        │
│                                                                                                                                                                                             │
│ Edge shard structure (fwd_XX.cbor / rev_XX.cbor) — arrays indexed by localId:                                                                                                               │
│ {                                                                                                                                                                                           │
│   version: 1,                                                                                                                                                                               │
│   all: (Uint8Array | null)[],        // all[localId] = serialized RoaringBitmap32 (CBOR byte string, NOT base64)                                                                            │
│   byLabel: {                                                                                                                                                                                │
│     [labelId]: (Uint8Array | null)[]  // byLabel[labelId][localId] = serialized RoaringBitmap32                                                                                             │
│   }                                                                                                                                                                                         │
│ }                                                                                                                                                                                           │
│                                                                                                                                                                                             │
│ Lookup: shard = computeShardKey(nodeId) → localId = meta.nodeIdToLocalId[nodeId] → bytes = fwd.all[localId] or fwd.byLabel[labelId][localId] → decode Roaring → get neighbor globalIds →    │
│ map back to nodeIds via neighbor shard's meta.                                                                                                                                              │
│                                                                                                                                                                                             │
│ Delete correctness: When any edge for a node is deleted, recompute all[localId] = OR(byLabel[labelId][localId] for all labelIds). Never naively remove a single neighbor from all. Test     │
│ case: same neighbor under two labels → delete one label → neighbor still present in all.                                                                                                    │
│                                                                                                                                                                                             │
│ Sparse byLabel for high cardinality: If label count exceeds threshold (default 1024), switch to sparse representation: byLabel[labelId] = { localIds: uint32[], bitmaps: Uint8Array[] }     │
│ instead of dense arrays. Keeps memory sane without changing query semantics.                                                                                                                │
│                                                                                                                                                                                             │
│ No per-label file explosion: ~768 files max regardless of label count.                                                                                                                      │
│                                                                                                                                                                                             │
│ Receipt (receipt.cbor) — deterministic fields only (no timestamps):                                                                                                                         │
│ { stateHash: "sha256hex", schema: 1, buildVersion: "12.0.0", maxLamport: 42,                                                                                                                │
│   nodeCount: 1000, edgeCount: 5000, labelCount: 3 }                                                                                                                                         │
│                                                                                                                                                                                             │
│ No heavy checksums on hot path: Shard checksums computed at build time and verified only in verifyIndex(), not on every load. Load path trusts Git's content-addressing.                    │
│                                                                                                                                                                                             │
│ 2.5 — Property index (from visible projection)                                                                                                                                              │
│                                                                                                                                                                                             │
│ New: src/domain/services/PropertyIndexBuilder.js + PropertyIndexReader.js                                                                                                                   │
│                                                                                                                                                                                             │
│ Build property shards from the visible projection (alive nodes only, LWW-resolved values). NOT from raw state.prop CRDT internals. This ensures "index says X" matches "query returns X."   │
│                                                                                                                                                                                             │
│ Sharded by computeShardKey(nodeId). Each shard: { nodeId → { propKey: propValue, ... } }.                                                                                                   │
│                                                                                                                                                                                             │
│ 2.6 — Logical index build service                                                                                                                                                           │
│                                                                                                                                                                                             │
│ New: src/domain/services/LogicalIndexBuildService.js                                                                                                                                        │
│                                                                                                                                                                                             │
│ Takes materialized WarpStateV5 + visible projection. Builds:                                                                                                                                │
│ 1. Stable ID mappings with (shardByte << 24) | localId encoding (append to existing)                                                                                                        │
│ 2. Label registry (append to existing)                                                                                                                                                      │
│ 3. Edge shards with embedded per-label bitmaps (fwd_XX.cbor / rev_XX.cbor)                                                                                                                  │
│ 4. Property index shards from visible projection                                                                                                                                            │
│ 5. Deterministic build receipt (no timestamps)                                                                                                                                              │
│                                                                                                                                                                                             │
│ 2.7 — BitmapNeighborProvider for logical graph                                                                                                                                              │
│                                                                                                                                                                                             │
│ Modify: src/domain/services/BitmapNeighborProvider.js                                                                                                                                       │
│                                                                                                                                                                                             │
│ Add labeled-edge support. When options.labels is provided, reads the shard file and indexes into byLabel[labelId] directly (O(1)) instead of reading all + post-filter. Provider tests must │
│  be brutal: verify sorted output contract, verify label filtering, verify dedup on 'both'.                                                                                                  │
│                                                                                                                                                                                             │
│ 2.8 — Canonical CBOR utility                                                                                                                                                                │
│                                                                                                                                                                                             │
│ New: src/domain/utils/canonicalCbor.js                                                                                                                                                      │
│                                                                                                                                                                                             │
│ One function used everywhere: encodeCanonicalCbor(value). Sorts map/object keys by strict codepoint order. Encodes Map deterministically. Never leaks JS insertion-order. Uses cbor-x with  │
│ explicit key-sorting configuration.                                                                                                                                                         │
│                                                                                                                                                                                             │
│ Test: test/unit/domain/utils/canonicalCbor.test.js — round-trip with Map, Object.create(null), nested structures. Verify key order is codepoint-sorted in output.                           │
│                                                                                                                                                                                             │
│ 2.9 — Micro-benchmark harness                                                                                                                                                               │
│                                                                                                                                                                                             │
│ New: test/benchmark/logicalIndex.bench.js                                                                                                                                                   │
│                                                                                                                                                                                             │
│ Benchmark: index build time + query latency at 1K, 10K, 100K nodes. Establish baseline before Phase 4.                                                                                      │
│                                                                                                                                                                                             │
│ Phase 2 Verification                                                                                                                                                                        │
│                                                                                                                                                                                             │
│ - Index build + query roundtrip: build from known state → BitmapNeighborProvider → run every GraphTraversal algorithm → compare results to AdjacencyNeighborProvider (must be identical)    │
│ - Stable ID test: build → add nodes → rebuild → existing IDs unchanged                                                                                                                      │
│ - Label registry: add labels → rebuild → existing labelIds unchanged                                                                                                                        │
│ - Property index matches getNodeProps() output for all nodes                                                                                                                                │
│ - WarpGraph.noCoordination.test.js passes                                                                                                                                                   │
│                                                                                                                                                                                             │
│ What Ships                                                                                                                                                                                  │
│                                                                                                                                                                                             │
│ Bitmap index infrastructure generalized for any graph. Property index. O(1) label-filtered neighbor lookups. No breaking changes (additive).                                                │
│                                                                                                                                                                                             │
│ ---                                                                                                                                                                                         │
│ Phase 3: MaterializedView Unification                                                                                                                                                       │
│                                                                                                                                                                                             │
│ Goal                                                                                                                                                                                        │
│                                                                                                                                                                                             │
│ Merge checkpoint + logical bitmap index + property index into a single MaterializedView artifact. Query methods read from persistent index. Explicit materialization default.               │
│                                                                                                                                                                                             │
│ 3.1 — MaterializedViewService                                                                                                                                                               │
│                                                                                                                                                                                             │
│ New: src/domain/services/MaterializedViewService.js                                                                                                                                         │
│                                                                                                                                                                                             │
│ Orchestrates build/persist/load. Combined tree:                                                                                                                                             │
│ <view_tree>/                                                                                                                                                                                │
│   state.cbor              # Authoritative CRDT state (existing)                                                                                                                             │
│   visible.cbor            # Visible projection (existing)                                                                                                                                   │
│   frontier.cbor           # Writer frontiers (existing)                                                                                                                                     │
│   appliedVV.cbor          # Version vector (existing)                                                                                                                                       │
│   provenanceIndex.cbor    # Entity→patch (existing)                                                                                                                                         │
│   index/                  # Logical bitmap index subtree (NEW, ~768 files max)                                                                                                              │
│     meta_00..ff.cbor      # nodeId ↔ globalId mappings                                                                                                                                      │
│     labels.cbor           # append-only label registry                                                                                                                                      │
│     fwd_00..ff.cbor       # forward bitmaps (all + byLabel embedded)                                                                                                                        │
│     rev_00..ff.cbor       # reverse bitmaps (all + byLabel embedded)                                                                                                                        │
│     props_00..ff.cbor     # property index                                                                                                                                                  │
│     receipt.cbor          # deterministic build receipt                                                                                                                                     │
│                                                                                                                                                                                             │
│ Schema bump to 4 for combined checkpoints. Schema 2/3 still loadable (fallback to in-memory adjacency + linear prop scan).                                                                  │
│                                                                                                                                                                                             │
│ Header block documenting invariants: what's authoritative vs cached, rebuild rules, determinism contract.                                                                                   │
│                                                                                                                                                                                             │
│ 3.2 — CheckpointService integration                                                                                                                                                         │
│                                                                                                                                                                                             │
│ Modify: src/domain/services/CheckpointService.js                                                                                                                                            │
│                                                                                                                                                                                             │
│ - createV5() delegates to MaterializedViewService.build() + .persist() when available                                                                                                       │
│ - loadCheckpoint() detects index/ subtree and loads bitmap provider                                                                                                                         │
│ - Schema:2/3 fallback: no index subtree → in-memory adjacency as today                                                                                                                      │
│                                                                                                                                                                                             │
│ 3.3 — Seek cache stores views                                                                                                                                                               │
│                                                                                                                                                                                             │
│ Modify: src/infrastructure/adapters/CasSeekCacheAdapter.js                                                                                                                                  │
│                                                                                                                                                                                             │
│ Index entries gain indexTreeOid field. On cache hit with index: load bitmap provider. Without: fallback.                                                                                    │
│                                                                                                                                                                                             │
│ 3.4 — Query methods use index                                                                                                                                                               │
│                                                                                                                                                                                             │
│ Modify: src/domain/warp/query.methods.js                                                                                                                                                    │
│                                                                                                                                                                                             │
│ - getNodeProps(): property index O(1) lookup with fallback to linear scan                                                                                                                   │
│ - neighbors(): bitmap-backed lookup with fallback                                                                                                                                           │
│                                                                                                                                                                                             │
│ 3.5 — Explicit materialization default                                                                                                                                                      │
│                                                                                                                                                                                             │
│ Modify: src/domain/WarpGraph.js                                                                                                                                                             │
│                                                                                                                                                                                             │
│ - autoMaterialize default: true → false (the breaking change)                                                                                                                               │
│ - WarpGraph.open({ autoMaterialize: true }) still works                                                                                                                                     │
│ - materialize() returns the MaterializedView                                                                                                                                                │
│                                                                                                                                                                                             │
│ 3.6 — ObserverView uses index                                                                                                                                                               │
│                                                                                                                                                                                             │
│ Modify: src/domain/services/ObserverView.js                                                                                                                                                 │
│                                                                                                                                                                                             │
│ Uses parent graph's bitmap index with query-time glob filtering instead of rebuilding filtered adjacency from scratch.                                                                      │
│                                                                                                                                                                                             │
│ Phase 3 Verification                                                                                                                                                                        │
│                                                                                                                                                                                             │
│ - Schema:4 roundtrip: create → persist → load → verify all components                                                                                                                       │
│ - Schema:2/3 backward compat: loads without index subtree, falls back gracefully                                                                                                            │
│ - getNodeProps via index matches linear scan for all nodes                                                                                                                                  │
│ - ObserverView tests pass with bitmap path                                                                                                                                                  │
│ - Seek cache roundtrip with index                                                                                                                                                           │
│ - WarpGraph.noCoordination.test.js passes                                                                                                                                                   │
│                                                                                                                                                                                             │
│ What Ships                                                                                                                                                                                  │
│                                                                                                                                                                                             │
│ - Single materialize() produces fully indexed persistent artifact                                                                                                                           │
│ - O(1) property lookups                                                                                                                                                                     │
│ - Faster ObserverView (no O(E) rebuild)                                                                                                                                                     │
│ - Indexed seek/time-travel                                                                                                                                                                  │
│ - Explicit materialization API (visible cost model)                                                                                                                                         │
│ - Breaking: autoMaterialize defaults to false → 12.0.0                                                                                                                                      │
│                                                                                                                                                                                             │
│ ---                                                                                                                                                                                         │
│ Phase 4: Incremental Updates + Pipeline Optimization                                                                                                                                        │
│                                                                                                                                                                                             │
│ Goal                                                                                                                                                                                        │
│                                                                                                                                                                                             │
│ Avoid full rebuilds on new patches. Accelerate TemporalQuery and sync ingestion.                                                                                                            │
│                                                                                                                                                                                             │
│ 4.1 — trackDiff in JoinReducer                                                                                                                                                              │
│                                                                                                                                                                                             │
│ Modify: src/domain/services/JoinReducer.js                                                                                                                                                  │
│                                                                                                                                                                                             │
│ Add trackDiff: true option to reduceV5(). Accumulates diff during patch application as a byproduct — O(ops_in_patch) instead of O(total_state) for diffStates().                            │
│                                                                                                                                                                                             │
│ 4.2 — IncrementalIndexUpdater                                                                                                                                                               │
│                                                                                                                                                                                             │
│ New: src/domain/services/IncrementalIndexUpdater.js                                                                                                                                         │
│                                                                                                                                                                                             │
│ Given a MaterializedView and a diff from trackDiff:                                                                                                                                         │
│ - NodeAdd: assign stable ID (append), add to meta shard                                                                                                                                     │
│ - EdgeAdd: update forward/reverse + per-label bitmaps + all bitmap                                                                                                                          │
│ - NodeTombstone/EdgeTombstone: remove from per-label bitmaps, then recompute all as OR of remaining byLabel (invariant #14)                                                                 │
│ - PropSet: update property shard                                                                                                                                                            │
│                                                                                                                                                                                             │
│ Only dirty shards loaded/modified/rewritten. 1 patch on 1M-node graph touches ~3-6 shards.                                                                                                  │
│                                                                                                                                                                                             │
│ Atomicity: Build new shard buffers in memory → write all updated blobs → assemble new tree → swap root OID in a single ref update. Readers never see partial writes.                        │
│                                                                                                                                                                                             │
│ globalId→nodeId reverse cache: Cache aggressively since bitmap reads decode IDs constantly. Use per-shard meta.nodeIds[localId] arrays for O(1) reverse lookup. LRU cache for loaded meta   │
│ shards.                                                                                                                                                                                     │
│                                                                                                                                                                                             │
│ 4.3 — Full rebuild equivalence tests (non-negotiable)                                                                                                                                       │
│                                                                                                                                                                                             │
│ New: test/unit/domain/services/MaterializedView.equivalence.test.js                                                                                                                         │
│                                                                                                                                                                                             │
│ For N patch sequences:                                                                                                                                                                      │
│ 1. Apply all → full rebuild → snapshot (decode all CBOR shards)                                                                                                                             │
│ 2. Apply one-at-a-time with incremental updates → snapshot after each                                                                                                                       │
│ 3. Assert final snapshots are semantically identical via deep-equal on decoded structures (not raw bytes — CBOR encoding order could vary)                                                  │
│ 4. Additionally verify: for every node, BitmapNeighborProvider.getNeighbors() matches AdjacencyNeighborProvider.getNeighbors()                                                              │
│                                                                                                                                                                                             │
│ Multiple random patch sequences with seeded PRNG — print seed on failure for reproducibility. This is the "incremental is correct" proof.                                                   │
│                                                                                                                                                                                             │
│ 4.4 — TemporalQuery checkpoint acceleration                                                                                                                                                 │
│                                                                                                                                                                                             │
│ Modify: src/domain/services/TemporalQuery.js                                                                                                                                                │
│                                                                                                                                                                                             │
│ Find nearest checkpoint with lamport <= since, replay from there. Cost: O(P_since_checkpoint) instead of O(P_total).                                                                        │
│                                                                                                                                                                                             │
│ 4.5 — Sync incremental update                                                                                                                                                               │
│                                                                                                                                                                                             │
│ Modify: src/domain/warp/materialize.methods.js                                                                                                                                              │
│                                                                                                                                                                                             │
│ After syncWith() ingests remote patches: load current view → apply new patches with trackDiff → incremental index update → persist updated view.                                            │
│                                                                                                                                                                                             │
│ 4.6 — Index self-check mode + CLI command                                                                                                                                                   │
│                                                                                                                                                                                             │
│ MaterializedViewService.verifyIndex({ sampleRate }) — randomly samples entries, verifies bitmap neighbors match CRDT-derived neighbors. Build receipt includes state hash for forensic      │
│ sanity.                                                                                                                                                                                     │
│                                                                                                                                                                                             │
│ CLI commands:                                                                                                                                                                               │
│ - git warp verify-index [--seed <n>] [--sample-rate <0.01>] — seeded sampling + reproducibility                                                                                             │
│ - git warp reindex — rebuild index subtree from state/visible for a checkpoint. Instant corruption triage.                                                                                  │
│                                                                                                                                                                                             │
│ Phase 4 Verification                                                                                                                                                                        │
│                                                                                                                                                                                             │
│ - Equivalence tests pass for all patch sequences                                                                                                                                            │
│ - Incremental produces identical index to full rebuild                                                                                                                                      │
│ - TemporalQuery with since loads fewer patches                                                                                                                                              │
│ - trackDiff output matches diffStates() for same before/after                                                                                                                               │
│ - Performance benchmarks: full rebuild vs incremental for 10K/100K patches                                                                                                                  │
│ - WarpGraph.noCoordination.test.js passes                                                                                                                                                   │
│                                                                                                                                                                                             │
│ What Ships                                                                                                                                                                                  │
│                                                                                                                                                                                             │
│ - Fast incremental updates                                                                                                                                                                  │
│ - Faster TemporalQuery (checkpoint-based start)                                                                                                                                             │
│ - Faster subscriber notifications (diff during reduction)                                                                                                                                   │
│ - Faster sync ingestion                                                                                                                                                                     │
│                                                                                                                                                                                             │
│ ---                                                                                                                                                                                         │
│ Critical Files                                                                                                                                                                              │
│                                                                                                                                                                                             │
│ ┌────────────────────────────────────────────────┬────────────────────────────────────────────────────────────────┐                                                                         │
│ │                      File                      │                              Role                              │                                                                         │
│ ├────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤                                                                         │
│ │ src/domain/utils/MinHeap.js                    │ Enhance with tie-breaking comparator                           │                                                                         │
│ ├────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤                                                                         │
│ │ src/domain/utils/LRUCache.js                   │ Reuse for neighbor memoization in GraphTraversal               │                                                                         │
│ ├────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤                                                                         │
│ │ src/domain/services/LogicalTraversal.js        │ Reference impl, then deprecated facade                         │                                                                         │
│ ├────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤                                                                         │
│ │ src/domain/services/DagPathFinding.js          │ Algorithm source for Dijkstra/A* port                          │                                                                         │
│ ├────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤                                                                         │
│ │ src/domain/services/DagTopology.js             │ Algorithm source for topoSort/commonAncestors port             │                                                                         │
│ ├────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤                                                                         │
│ │ src/domain/services/BitmapIndexBuilder.js      │ Reference for shard format, Roaring usage                      │                                                                         │
│ ├────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤                                                                         │
│ │ src/domain/services/BitmapIndexReader.js       │ Reference for LRU shard cache, validation                      │                                                                         │
│ ├────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤                                                                         │
│ │ src/domain/services/CheckpointService.js       │ Evolves to build/persist MaterializedView                      │                                                                         │
│ ├────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤                                                                         │
│ │ src/domain/warp/materializeAdvanced.methods.js │ _buildAdjacency() and _setMaterializedState integration points │                                                                         │
│ ├────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤                                                                         │
│ │ src/domain/warp/query.methods.js               │ O(N) prop scan → O(1) index lookup                             │                                                                         │
│ ├────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤                                                                         │
│ │ src/domain/services/JoinReducer.js             │ trackDiff for incremental diffs                                │                                                                         │
│ ├────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤                                                                         │
│ │ src/domain/services/TemporalQuery.js           │ Checkpoint-accelerated replay                                  │                                                                         │
│ ├────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤                                                                         │
│ │ eslint.config.js                               │ Add GraphTraversal.js to relaxation block                      │                                                                         │
│ └────────────────────────────────────────────────┴────────────────────────────────────────────────────────────────┘
