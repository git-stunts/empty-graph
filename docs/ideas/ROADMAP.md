# Roadmap

Where this project could go, roughly sequenced by leverage.

---

## Phase 1: Kill the Materialize Tax

The single biggest DX problem. Developers manually orchestrate state freshness across three independent axes (cached state, checkpoints, indexes) with no staleness detection on any of them. Fix this and the library becomes dramatically easier to use.

### 1.1 Auto-invalidation after local writes

`createPatch().commit()` and `writer.commitPatch()` should mark `_cachedState` as dirty. Today a user can write a patch and immediately get stale query results with no warning. Two options:

- **Eager:** Re-materialize incrementally after each commit (apply the patch to cached state in-place, since we already have it in memory).
- **Lazy:** Mark state dirty, throw or auto-rematerialize on next query.

Eager is better. The patch is already parsed and in memory at commit time. Applying it to the cached OR-Set/LWW state is O(ops-in-patch), which is negligible compared to the Git I/O that just happened.

### 1.2 Lazy rematerialization on query

If the state is dirty (or null), query methods (`hasNode`, `neighbors`, `query().run()`, `traverse.shortestPath`) should auto-materialize before returning results. Gate this behind an opt-in mode initially:

```javascript
const graph = await WarpGraph.open({
  persistence, graphName, writerId,
  autoMaterialize: true,  // new option
});
```

### 1.3 Periodic auto-checkpointing

Add a checkpoint policy to `WarpGraph.open()`:

```javascript
const graph = await WarpGraph.open({
  persistence, graphName, writerId,
  checkpointPolicy: { every: 500 },  // create checkpoint every 500 patches
});
```

`materialize()` checks patch count since last checkpoint and auto-creates one when the threshold is exceeded. Users who never think about checkpoints still get incremental materialization.

### 1.4 Post-merge git hook for staleness notification

A lightweight `post-merge` hook that detects when warp refs changed during a pull/merge and prints a warning. Not a full solution, but cheap and immediately useful:

```
[warp] Writer refs changed during merge. Call materialize() to see updates.
```

Ship this as an installable hook via `npm run install:hooks` alongside the existing lint/test hooks.

---

## Phase 2: Self-Managing Infrastructure

Once the materialize tax is gone, the next friction layer is infrastructure that requires manual babysitting: indexes, GC, and frontier tracking.

### 2.1 Index staleness tracking

Store the frontier (writer ID -> tip SHA map) at index-build time as metadata in the index tree. On next `loadIndex()`, compare stored frontier against current refs. If diverged, log a warning or auto-rebuild. This makes "is my index stale?" a cheap O(writers) ref comparison instead of a mystery.

### 2.2 Auto-GC after materialization

After `materialize()` completes, check `getGCMetrics()` against the configured policy. If tombstone ratio exceeds the threshold, run GC automatically. Today `maybeRunGC()` exists but is never called unless the user remembers. Wire it into the materialize path:

```
materialize() → apply patches → maybe checkpoint → maybe GC
```

### 2.3 Frontier change detection

Add a `hasFrontierChanged()` method that compares the last-known frontier against current refs without full materialization. This enables cheap polling:

```javascript
if (await graph.hasFrontierChanged()) {
  await graph.materialize();
}
```

Later, this could back a `graph.watch()` API using fs.watch on the refs directory.

---

## Phase 3: Better Multi-Writer Ergonomics

The multi-writer story works but has sharp edges around writer identity, sync workflows, and error diagnostics.

### 3.1 Simplify writer identity

Today there are three ways to get a writer (`writer()`, `writer('id')`, `createWriter()`), each with different persistence semantics. Consolidate to two:

- `graph.writer()` — stable identity, resolved from git config or generated and persisted on first use.
- `graph.writer('explicit-id')` — explicit identity, no side effects.

Drop `createWriter()` as a separate method. The `{ persist: 'config' }` option can move to the first form.

### 3.2 Sync-then-materialize as a single operation

`syncWith()` should optionally materialize after applying the sync delta:

```javascript
await graph.syncWith(remote, { materialize: true });
```

This eliminates the most common sync footgun (syncing onto stale state, then forgetting to rematerialize).

### 3.3 Actionable error messages

Errors like "No cached state. Call materialize() first" should distinguish between "never materialized", "stale after local write", and "stale after remote sync". Each has a different recovery action. Add error codes and recovery hints to all state-related errors.

### 3.4 CAS failure recovery

When a `commitPatch()` fails due to compare-and-swap (another process updated the writer ref), the error should explain what happened and suggest retry. Today this surfaces as a generic Git ref-update failure.

### 3.5 Deletion guards (no-delete-under-descent)

`NodeRemove` doesn't check whether the target node has properties or edges. The node gets tombstoned, its properties become orphaned in `state.prop`, and its edges become dangling references that `getEdges()` silently filters out. Nobody gets an error. Data just quietly disappears.

Add a validation pass in `commitPatch()` that checks whether a `NodeRemove` targets a node with properties or connected edges. Configurable policy:

```javascript
const graph = await WarpGraph.open({
  persistence, graphName, writerId,
  onDeleteWithData: 'reject',  // 'reject' | 'cascade' | 'warn'
});
```

- **reject:** Throw an error if the node has properties or edges.
- **cascade:** Auto-generate `EdgeRemove` ops for connected edges and clear properties.
- **warn:** Log a warning but proceed (current implicit behavior, made explicit).

This prevents a class of subtle data corruption bugs and establishes the referential integrity invariant that future features (recursive attachments, provenance tracking) will depend on.

---

## Phase 4: Query Language

The fluent query builder is functional but limited. As graphs get larger, users need filtering, aggregation, and multi-hop traversal without writing imperative loops.

### 4.1 Property filters in query builder

```javascript
graph.query()
  .match('user:*')
  .where({ role: 'admin' })         // property equality
  .where(n => n.props.age > 18)     // predicate function
  .outgoing('manages')
  .run();
```

The `.where()` method exists but only supports predicate functions. Add shorthand object syntax for common equality/comparison filters.

### 4.2 Multi-hop traversal in queries

```javascript
graph.query()
  .match('user:alice')
  .outgoing('manages', { depth: 1..3 })  // 1-3 hops
  .select(['id', 'props.name'])
  .run();
```

Today multi-hop requires chaining multiple `.outgoing()` calls or dropping to the imperative `traverse` API.

### 4.3 Aggregation

```javascript
graph.query()
  .match('order:*')
  .aggregate({ count: true, sum: 'props.total' })
  .run();
```

Basic count/sum/avg over matched nodes without materializing the full result set.

---

## Phase 5: Observability

The library is opaque at runtime. Users can't see what's happening without adding their own instrumentation.

### 5.1 State health diagnostics

A single method that reports everything a user needs to know about their graph's operational state:

```javascript
const status = await graph.status();
// {
//   cachedState: 'stale',        // 'fresh' | 'stale' | 'none'
//   patchesSinceCheckpoint: 847,
//   patchesSinceIndex: 1203,
//   tombstoneRatio: 0.12,
//   writers: 3,
//   frontier: { alice: 'abc...', bob: 'def...', carol: 'ghi...' },
// }
```

### 5.2 Operation timing in LoggerPort

The `ClockPort` and `LoggerPort` infrastructure exists but isn't wired into most operations. Add structured timing logs for `materialize()`, `syncWith()`, `createCheckpoint()`, `rebuildIndex()`, and `runGC()` so users can see where time is spent.

### 5.3 CLI `status` command

```bash
git warp status
```

Prints the same information as `graph.status()` from the command line. Useful for scripting and debugging.

### 5.4 Tick receipts

During `materialize()`, the system applies patches and discards all decision information. When two writers set the same property concurrently, LWW picks a winner, and the losing write vanishes without a trace. For multi-writer production use, "why does this node have this value?" is a question that comes up constantly, and today there's no answer short of manually inspecting CRDT internals.

Add structured receipts emitted during patch application:

```javascript
const { state, receipts } = await graph.materialize({ receipts: true });
// receipts: [
//   {
//     patchSha: 'abc123',
//     writer: 'alice',
//     lamport: 42,
//     ops: [
//       { op: 'PropSet', node: 'user:bob', key: 'status', result: 'applied' },
//       { op: 'PropSet', node: 'user:carol', key: 'status', result: 'superseded',
//         reason: 'LWW: writer bob at lamport 43 wins' },
//     ],
//   },
//   ...
// ]
```

For each operation in each patch, the receipt records whether it was applied or superseded, and why. For LWW conflicts, record which EventId won. For OR-Set add/remove, record whether the add was a new dot or a re-add, and whether the remove was effective.

Receipts are opt-in (gated behind `{ receipts: true }`) to avoid overhead in the common case. They serve three roles:

- **Debugging:** Concrete answers to "why does this node have this value?"
- **Audit:** Structured evidence of every state transition for regulated environments.
- **Foundation for provenance (Phase 6):** Receipts are the raw trace data that provenance payloads and observer views are built on.

---

## Phase 6: Provenance and Holography

This is where the codebase meets Papers III-IV. The mathematical foundations for provenance payloads, slicing, and wormholes are fully developed in the papers but not yet implemented.

### 6.1 In/Out declarations on patches

The gate that unlocks the rest of Phase 6. Add declared read/write sets to each patch so that provenance queries don't require full replay.

Extend `PatchV2` with optional `reads` and `writes` fields:

```javascript
{
  schema: 2,
  writer: 'alice',
  lamport: 42,
  context: VersionVector,
  ops: [...],
  reads: ['user:alice', 'user:bob'],       // nodes read by this patch
  writes: ['user:alice'],                    // nodes written by this patch
}
```

Auto-populate during `commitPatch()` by inspecting ops: `PropSet` on node X reads and writes X; `EdgeAdd(A→B)` reads A and B, writes the edge; `NodeAdd(X)` writes X; `NodeRemove(X)` reads X. Store as part of the patch blob.

Build a lightweight index mapping `nodeId → [patchSha]` for contributing patches. This makes "which patches affected node X?" an index lookup instead of a full replay.

**What this unlocks:**
- Derivation graph `D(v)` — backward traversal of the I/O index.
- Slice materialization (6.3) — compute causal cones without full replay.
- Smarter GC — identify which patches are still causally relevant to live nodes.
- Conflict diagnostics — surface overlapping I/O between concurrent writers.

### 6.2 Provenance payloads

Implement the boundary encoding `(U_0, P)` from Paper III as a first-class type. Each patch already contains the information needed; the remaining work is packaging a sequence of patches as a transferable provenance payload with monoid operations.

```javascript
class ProvenancePayload {
  constructor(patches) { this.patches = patches; }
  concat(other) { return new ProvenancePayload([...this.patches, ...other.patches]); }
  static identity() { return new ProvenancePayload([]); }
  get length() { return this.patches.length; }
}
```

The payload monoid (concat, identity) is the algebraic structure that wormhole composition (6.4) and prefix forks (6.6) depend on.

### 6.3 Slice materialization

Given a target node ID, compute the backward causal cone (`D(v)`) and materialize only the patches that contribute to that node's current state. This is the "partial materialization by slicing" theorem from Paper III. Depends on 6.1 (In/Out declarations) for computing causal cones without full replay.

Useful for large graphs where full materialization is expensive but the user only needs one subgraph.

### 6.4 Wormhole compression

Compress a multi-tick (multi-patch) segment into a single edge carrying the sub-payload. Useful for checkpointing long histories: instead of keeping all intermediate patches, collapse them into a wormhole that preserves provenance but reduces storage.

The payload monoid (6.2) makes wormhole composition well-behaved: concatenating two consecutive wormhole payloads yields the payload for the combined wormhole.

### 6.5 Boundary Transition Records (BTRs)

Implement the tamper-evident packaging format from Paper III. A BTR binds `(h_in, h_out, U_0, P, t, kappa)` into a single verifiable artifact. This enables auditable exchange of graph segments between parties who don't share the full history.

### 6.6 Prefix forks

Expose Git's branching topology at the WARP layer. A fork creates a new writer chain whose first commit has the fork point as its parent. Under content-addressed storage, the shared prefix is automatically deduplicated — Git already handles this.

```javascript
const branch = await graph.fork({ from: 'alice', at: patchSha });
// branch shares alice's history up to patchSha
// diverges from there with its own patches
```

**What this unlocks:**
- **What-if analysis:** Fork, apply a speculative change, compare outcomes, discard or keep.
- **Safe experimentation:** Try a bulk import on a fork before committing to the main line.
- **Undo:** Fork before a destructive operation. If it goes wrong, the original is untouched.

Depends on 6.2 (payload monoid for reasoning about shared prefixes) and composes well with 6.4 (compress the shared prefix into a wormhole, then fork).

---

## Phase 7: Observer Geometry (Speculative)

Paper IV defines observers as resource-bounded functors and introduces rulial distance. This is the most theoretical part of the series and the furthest from implementation, but there are concrete engineering applications.

### 7.1 Observer-scoped views

Define named observers that project the full graph into scoped views:

```javascript
const adminView = graph.observer('admin', {
  match: 'user:*',
  expose: ['id', 'props.name', 'props.role'],
  redact: ['props.email', 'props.ssn'],
});
```

This connects to the Paper IV idea that different observers legitimately see different projections of the same underlying state.

### 7.2 Translation cost estimation

Given two observer definitions, estimate the MDL cost of translating between their views. This is useful for system design: if a compliance observer is far from a diagnostic observer, emitting only compliance traces makes future diagnosis expensive.

### 7.3 Temporal queries

Implement the CTL*-style temporal logic from Paper IV over materialized history:

```javascript
// "Was this node always in state 'active' since tick 5?"
graph.temporal.always('node:x', { prop: 'status', equals: 'active' }, { since: 5 });

// "Does every branch eventually reach a merged state?"
graph.temporal.forAllPaths('eventually', { predicate: isMerged });
```

This is speculative and depends on having full history access, but the mathematical foundations are in place.

---

## Non-Goals

Things this project should probably not try to become:

- **A general-purpose database.** No SQL, no ACID transactions, no connection pooling. If you need those, use PostgreSQL.
- **A real-time system.** Git's I/O model is fundamentally batch-oriented. No WebSocket push, no sub-millisecond latency.
- **A distributed consensus system.** CRDTs give eventual consistency without coordination. If you need strong consistency or leader election, use a different tool.
- **A physics engine.** Paper V (emergent dynamics, Schrodinger-type evolution) is fascinating mathematics but not an implementation target for this library.
