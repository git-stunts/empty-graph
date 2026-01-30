# The Bitmap Index (Internals)

> **Warning:** This is deep magic. You don't need to know this to use the library, but it helps if you want to understand the performance characteristics.

## The Problem
Git stores `Child -> Parent` links efficiently. It stores `Parent -> Child` links... not at all.

## The Solution
We map every 40-character SHA-1 to a 32-bit Integer ID.
We then use **Roaring Bitmaps** to store the adjacency matrix.

### Sharding
To avoid loading a 100MB index for a single query, we shard the index by SHA prefix (2 chars -> 256 shards).

- `meta_ab.json`: ID mappings for SHAs starting with `ab`.
- `shards_fwd_ab.json`: Forward edges for `ab`.
- `shards_rev_ab.json`: Backward edges for `ab`.

This allows us to perform "Lazy Loading". We only load the shards relevant to the nodes you are currently visiting.
