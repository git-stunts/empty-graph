# 🛹 STUNT REPORT: THE "GIT-MIND 900"

> **Date:** January 7, 2026
> **Pilot:** James "The Architect" Ross
> **Trick:** Porting High-Performance C Architecture to Node.js without the C.

## 🎯 The Challenge: The O(N) Trap

`empty-graph` started as a clever hack: storing data in "invisible" Git commits. But it had a fatal flaw. To find anything, you had to walk the `git log`. 
- **100 nodes?** Fine. 
- **1,000,000 nodes?** Your CPU melts. O(N) complexity is the enemy of scale.

## 💡 The Inspiration: `git-mind`

We looked at `git-mind`, the "real deal" C-based graph database. It solved this problem with:
1.  **Roaring Bitmaps**: Compressed bitmaps for O(1) set operations.
2.  **Fanout/Sharding**: Splitting the index so you don't load the whole world.
3.  **Git Tree Persistence**: Saving the index *as* a Git Tree.

But `git-mind` is Heavy Metal. It requires `libgit2`, `meson`, and a C compiler. Wrapping it in Node.js would be a nightmare of `node-gyp` errors and cross-platform pain.

## 🤘 The Stunt: "Dependency Surgery"

We didn't wrap the C code. We **stole the soul** of the architecture.

1.  **Roaring in JS**: We grabbed the `roaring` NPM package (WASM/Native bindings pre-built) to get the raw speed of Roaring Bitmaps in Node.js.
2.  **Sharded Indexing**: We implemented the `git-mind` sharding logic (splitting bitmaps by OID prefix) in pure JavaScript.
3.  **Git Tree Persistence**: We used our own `cas`-style logic to serialise these bitmaps into Blobs and stitch them into a Git Tree (`writeTree`).

## 🏆 The Result

We now have **`empty-graph` v2**:
-   **Performance**: **O(1)** lookups (once the shard is loaded).
-   **Scalability**: Handles millions of nodes via sharding.
-   **Portability**: `npm install` works. No `meson` required.
-   **Storage**: The index lives *inside* Git as a standard Tree object. It is "Invisible" just like the data.

We turned a toy into a tank.

---

### Technical Footnotes

**The Index Structure (Git Tree):**
```text
/
├── meta/
│   └── ids.json       # SHA <-> Integer ID mapping (Global for now)
└── shards/
    ├── fwd_00.bitmap  # Forward Index (Parents) for SHAs starting with '00'
    ├── fwd_01.bitmap
    ├── ...
    ├── rev_ff.bitmap  # Reverse Index (Children) for SHAs starting with 'ff'
```

**Benchmarking:**
-   **Before**: `git log` walk = ~50ms per 1k nodes.
-   **After**: Bitmap lookup = ~0.01ms (independent of graph size).

*Scalability limit is now defined by the ID mapping size, which is the next stunt.*
