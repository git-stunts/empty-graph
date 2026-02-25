# The Materialization Problem

## THE PROBLEM

git-warp has four separate systems that cache or persist materialized state, each built independently, each unaware of the others:

### The Four Silos

**1. Checkpoints** (`CheckpointService`)
- Serializes full `WarpStateV5` (OR-Sets + props + frontier + appliedVV + provenance index) to CBOR blobs in a Git tree
- Stored under `refs/warp/<graphName>/checkpoints/head`
- Purpose: fast recovery — skip replaying ancient patches, start from checkpoint + apply incremental
- Does NOT include adjacency or any index

**2. Seek Cache** (`CasSeekCacheAdapter`)
- Serializes `WarpStateV5` at a specific Lamport ceiling via `@git-stunts/git-cas`
- Stored under `refs/warp/<graphName>/seek-cache`
- Purpose: time-travel queries without re-replaying
- Does NOT include adjacency or any index

**3. Bitmap Index** (`IndexRebuildService` + `BitmapIndexBuilder` + `BitmapIndexReader`)
- Roaring bitmap adjacency index with sharding, checksums, LRU shard cache, staleness detection
- Persisted as a Git tree of JSON blobs (`meta_XX.json`, `shards_fwd_XX.json`, `shards_rev_XX.json`)
- Only indexes the **Git commit DAG** (commit SHAs and parent pointers)
- Knows nothing about the logical graph
- Full rebuild every time — no incremental update

**4. In-memory adjacency** (`_buildAdjacency()` + `_materializedGraph`)
- Iterates every alive edge in the OR-Set, builds `Map<nodeId, Array<{neighborId, label}>>` from scratch
- Cached in memory, invalidated on any write
- Not persisted anywhere
- Rebuilt from scratch on every rematerialization

### What's Wrong

- **Checkpoints** persist CRDT state but not adjacency. After loading a checkpoint, adjacency is rebuilt from scratch.
- **Seek cache** persists CRDT state at a point in time but not adjacency. Same rebuild.
- **Bitmap index** persists adjacency but only for the commit DAG, which users never query directly.
- **The logical graph adjacency** — the thing every query and traversal actually uses — is never persisted.
- All four use the same Git plumbing (`writeBlob`/`writeTree`/`readBlob`/`readTreeOids`). They just don't know about each other.

### Feature-Level Consequences

| Feature | Problem |
|---|---|
| **Property lookup** (`getNodeProps`) | O(N) linear scan of ALL entries in `state.prop` for keys starting with `nodeId\0`. No index. |
| **ObserverView** | Calls `_materializeGraph()` on parent (O(E) adjacency build), then iterates ALL edges again to build filtered copy. Two O(E) passes, not cached. |
| **TemporalQuery** (`always`, `eventually`) | Loads ALL patches from Git and replays from empty state. No checkpoints, no caching. 100K patches = 100K replays per query. |
| **StateDiff** (subscriber notifications) | O(N+E+P) — iterates every node, edge, and property in both before and after states. No incremental tracking. |
| **QueryBuilder** `.match()` | Collects every alive node, tests each against glob pattern. No prefix index. |
| **Provenance** `materializeSlice` | Re-replays cone patches from empty state even though full materialized state already exists. |
| **Auto-materialize** | Every query method calls `_ensureFreshState()` which may re-materialize. Cost is hidden from the user. |
| **Logical graph doesn't scale** | Assumes entire graph fits in memory as JS Maps. No lazy-loading, no disk-backed storage. |
| **Traversal algorithms split** | Topo sort, Dijkstra, A* exist on commit DAG (`CommitDagTraversalService`) but not on logical graph (`LogicalTraversal` only has BFS, DFS, shortest path). |

---

## HOW WE GOT HERE

### Build order created the split

The commit DAG algorithms were built first because they were needed for core infrastructure:
- Materialization walks the commit DAG to discover and order patches
- Sync protocol needs common ancestors and divergence points
- Without an index, `git log` traversal is O(N) for every operation

So `BitmapIndexBuilder`/`BitmapIndexReader` were built with full infrastructure: sharding, checksums, LRU caching, streaming mode for memory-bounded builds, staleness detection. The commit DAG got the sophisticated treatment because it was the blocking problem.

### Logical graph was an afterthought

The logical graph algorithms were added later as user-facing convenience. Only basics shipped (BFS, DFS, shortest path, connected component). The adjacency was built ad-hoc in `_buildAdjacency()`. Nobody needed topo sort or Dijkstra on the logical graph internally, so they never got built.

The adjacency was "already in memory" after materialization, so it *felt* fast enough. But it's rebuilt from scratch on every state change, assumes everything fits in memory, and isn't persisted.

### Each caching system solved its own problem

- **Checkpoints** solved "materialization is slow, don't replay from the beginning"
- **Seek cache** solved "time-travel queries are slow, cache the result"
- **Bitmap index** solved "commit DAG traversal is slow, index it"
- **In-memory adjacency** solved "I need neighbor lookups for queries"

Each was built when its problem became acute. Nobody stepped back to see they were all variants of "persist and index materialized state."

### The async/sync split reinforced the divide

The commit DAG services are async (each `getChildren()` reads a Git blob). The logical graph traversals are async only because `_prepare()` calls `_materializeGraph()` — after that one await, everything is synchronous Map lookups. This made them feel like fundamentally different systems, but the algorithms are identical. BFS is BFS regardless of whether the neighbor lookup is sync or async.

---

## HOW TO FIX IT

### The Core Insight

A **MaterializedView** should be a single persistent, indexed artifact produced once per frontier change. Checkpoints, seek cache entries, and the bitmap index are all partial views of this same thing.

### Target Architecture

```
Layer 1: Algorithms + Query (graph-agnostic)
  ┌──────────────────────────────────────────────┐
  │  BFS, DFS, topo sort, shortest path,         │
  │  Dijkstra, A*, weighted longest path,        │
  │  isReachable, connectedComponent, ...        │
  │                                              │
  │  Operates on: NeighborProvider interface     │
  │  Always async. Works on any graph.           │
  └──────────────┬───────────────────────────────┘
                 │
Layer 2: Storage │  (NeighborProvider implementations)
  ┌──────────────┴───────────────────────────────┐
  │  Roaring bitmap shards in Git blobs          │
  │  (lazy-loaded, LRU-cached, sharded)          │
  │                                              │
  │  Used by BOTH:                               │
  │  • Git commit DAG (existing)                 │
  │  • Logical WARP graph (new)                  │
  └──────────────────────────────────────────────┘
```

### MaterializedView Structure

```
MaterializedView (persisted as Git tree)
├── state.cbor              # Full CRDT state (what checkpoints do today)
├── frontier.cbor           # Writer frontier (staleness/cache key)
├── appliedVV.cbor          # Version vector (for GC, incremental merge)
├── provenanceIndex.cbor    # Entity→patch mapping (already exists)
│
├── adjacency/              # Logical graph bitmap index (NEW)
│   ├── meta_XX.json        # nodeId ↔ numeric ID mappings
│   ├── shards_fwd_XX.json  # Forward edge bitmaps (per label)
│   ├── shards_rev_XX.json  # Reverse edge bitmaps (per label)
│   └── labels.json         # Label registry
│
└── props/                  # Property index (NEW)
    └── shards_XX.json      # nodeId prefix → property entries
```

### What Changes

| Current | Target |
|---|---|
| Checkpoints = separate concept | Checkpoints = persisting a MaterializedView |
| Seek cache = separate CAS system | Seek cache = MaterializedView at a ceiling |
| Bitmap index = commit DAG only | Bitmap index = both commit DAG and logical graph |
| Adjacency = in-memory Maps, rebuilt | Adjacency = persistent bitmap shards, loaded lazily |
| Properties = linear scan | Properties = sharded index |
| 4 separate caching systems | 1 MaterializedView, multiple entry points |
| Traversal algorithms split by graph type | Generic algorithms over NeighborProvider |
| Auto-materialize hidden in every query | Explicit materialize, queries hit persistent index |
| Assumes graph fits in memory | Lazy-loaded shards, works at any scale |
| Full rebuild on every change | Incremental update on new patches |

### What This Unlocks

- **Large graphs**: adjacency in lazy-loaded bitmap shards, not JS Maps
- **No implicit re-materialization**: materialize once, persist, queries hit persistent index
- **Same algorithms everywhere**: topo sort, Dijkstra, A* work on both commit DAG and logical graph
- **Seek/time-travel**: same persistent structure, just keyed by ceiling
- **Incremental sync**: after ingesting remote patches, update the MaterializedView instead of discarding it
- **TemporalQuery acceleration**: start from nearest checkpoint instead of replaying from empty state
- **Subscriber diffs**: computed incrementally during patch application, not by comparing full states
- **ObserverView**: filtered at query time over the index, not by rebuilding adjacency
