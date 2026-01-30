# Roaring Bitmap Index Architecture

This diagram illustrates how EMPTY GRAPH uses Roaring Bitmaps to provide O(1) lookups for graph traversal operations.

## Overview Diagram

```mermaid
flowchart TB
    subgraph GRAPH["Git Commit Graph"]
        direction TB
        A["Node A<br/>(root commit)"]
        B["Node B<br/>(branch 1)"]
        C["Node C<br/>(branch 2)"]
        D["Node D<br/>(merge commit)"]

        A --> B
        A --> C
        B --> D
        C --> D
    end

    subgraph INDEX["Bitmap Index Structure"]
        direction TB

        subgraph SHA_TO_ID["SHA to ID Mapping"]
            M1["meta_a1.json<br/>{ 'a1b2c3...': 0 }"]
            M2["meta_b2.json<br/>{ 'b2c3d4...': 1 }"]
            M3["meta_c3.json<br/>{ 'c3d4e5...': 2 }"]
            M4["meta_d4.json<br/>{ 'd4e5f6...': 3 }"]
        end

        subgraph FWD["Forward Index (fwd)<br/>parent -> children IDs"]
            F1["shards_fwd_a1.json<br/>A: bitmap{1, 2}"]
            F2["shards_fwd_b2.json<br/>B: bitmap{3}"]
            F3["shards_fwd_c3.json<br/>C: bitmap{3}"]
        end

        subgraph REV["Reverse Index (rev)<br/>child -> parent IDs"]
            R2["shards_rev_b2.json<br/>B: bitmap{0}"]
            R3["shards_rev_c3.json<br/>C: bitmap{0}"]
            R4["shards_rev_d4.json<br/>D: bitmap{1, 2}"]
        end
    end

    GRAPH -.->|"Build Index"| INDEX
```

## SHA to Numeric ID Mapping

SHAs are mapped to compact numeric IDs for efficient bitmap storage:

```mermaid
flowchart LR
    subgraph SHAs["40-char Git SHAs"]
        SHA_A["a1b2c3d4e5..."]
        SHA_B["b2c3d4e5f6..."]
        SHA_C["c3d4e5f6a7..."]
        SHA_D["d4e5f6a7b8..."]
    end

    subgraph IDs["Numeric IDs"]
        ID0["0"]
        ID1["1"]
        ID2["2"]
        ID3["3"]
    end

    SHA_A --> ID0
    SHA_B --> ID1
    SHA_C --> ID2
    SHA_D --> ID3

    style ID0 fill:#e1f5fe
    style ID1 fill:#e1f5fe
    style ID2 fill:#e1f5fe
    style ID3 fill:#e1f5fe
```

## Query Flow: getChildren(A)

```mermaid
sequenceDiagram
    participant User
    participant Reader as BitmapIndexReader
    participant Meta as meta_a1.json
    participant Fwd as shards_fwd_a1.json
    participant Bitmap as RoaringBitmap32

    User->>Reader: getChildren("a1b2c3...")

    Note over Reader: 1. Extract SHA prefix "a1"

    Reader->>Fwd: Load shard (lazy, cached)
    Fwd-->>Reader: { "a1b2c3...": "base64bitmap" }

    Note over Reader: 2. Decode bitmap for SHA

    Reader->>Bitmap: deserialize(base64)
    Bitmap-->>Reader: bitmap{1, 2}

    Note over Reader: 3. Convert IDs to SHAs

    Reader->>Meta: Load all meta shards (cached)
    Meta-->>Reader: ID 1 = "b2c3d4...", ID 2 = "c3d4e5..."

    Reader-->>User: ["b2c3d4...", "c3d4e5..."]

    Note over User,Reader: O(1) lookup via bitmap!
```

> **Warning**: First query loads all meta shards O(n); subsequent queries O(1)
>
> `BitmapIndexReader.getChildren` depends on `_buildIdToShaMapping` which loads all meta shards (up to 256) on the first query. Only subsequent lookups are O(1). Note that the LRU cache (default 100) can be exceeded during initial load.

## Query Flow: getParents(D)

```mermaid
sequenceDiagram
    participant User
    participant Reader as BitmapIndexReader
    participant Rev as shards_rev_d4.json
    participant Bitmap as RoaringBitmap32
    participant Meta as meta_*.json

    User->>Reader: getParents("d4e5f6...")

    Note over Reader: 1. Extract SHA prefix "d4"

    Reader->>Rev: Load reverse shard (lazy, cached)
    Rev-->>Reader: { "d4e5f6...": "base64bitmap" }

    Note over Reader: 2. Decode bitmap for SHA

    Reader->>Bitmap: deserialize(base64)
    Bitmap-->>Reader: bitmap{1, 2}

    Note over Reader: 3. Convert IDs to SHAs

    Reader->>Meta: Lookup IDs 1 and 2
    Meta-->>Reader: ID 1 = "b2c3d4...", ID 2 = "c3d4e5..."

    Reader-->>User: ["b2c3d4...", "c3d4e5..."]

    Note over User,Reader: Merge commits with multiple<br/>parents resolved in O(1)!
```

## Sharding Strategy

Shards are organized by 2-character SHA prefix for efficient lazy loading:

```mermaid
flowchart TB
    subgraph Storage["Index Storage (256 possible prefixes)"]
        direction LR

        subgraph Prefix_00["Prefix '00'"]
            meta_00["meta_00.json"]
            fwd_00["shards_fwd_00.json"]
            rev_00["shards_rev_00.json"]
        end

        subgraph Prefix_a1["Prefix 'a1'"]
            meta_a1["meta_a1.json"]
            fwd_a1["shards_fwd_a1.json"]
            rev_a1["shards_rev_a1.json"]
        end

        subgraph Prefix_ff["Prefix 'ff'"]
            meta_ff["meta_ff.json"]
            fwd_ff["shards_fwd_ff.json"]
            rev_ff["shards_rev_ff.json"]
        end

        dots["..."]
    end

    subgraph Query["Query: getChildren('a1b2c3...')"]
        Q1["1. Extract prefix 'a1'"]
        Q2["2. Load only shards_fwd_a1.json"]
        Q3["3. Other shards stay unloaded"]
    end

    Query --> Prefix_a1

    style Prefix_a1 fill:#c8e6c9
    style Prefix_00 fill:#f5f5f5
    style Prefix_ff fill:#f5f5f5
```

## Why Roaring Bitmaps Are Fast

```mermaid
flowchart TB
    subgraph Traditional["Traditional Approach"]
        direction TB
        T1["Store edges as arrays"]
        T2["children: ['sha1', 'sha2', ...]"]
        T3["O(n) to check membership"]
        T4["Large storage for many edges"]

        T1 --> T2 --> T3 --> T4
    end

    subgraph Roaring["Roaring Bitmap Approach"]
        direction TB
        R1["Store IDs in compressed bitmap"]
        R2["children: bitmap{1, 2, 3, ...}"]
        R3["O(1) to check membership"]
        R4["Highly compressed storage"]

        R1 --> R2 --> R3 --> R4
    end

    subgraph Benefits["Key Benefits"]
        B1["Compression: Run-length encoding for dense ranges"]
        B2["Fast Operations: AND, OR, XOR on bitmaps"]
        B3["Memory Efficient: 10-100x smaller than arrays"]
        B4["Lazy Loading: Only load shards you need"]
    end

    Traditional -.->|"vs"| Roaring
    Roaring --> Benefits

    style Roaring fill:#e8f5e9
    style Traditional fill:#ffebee
    style Benefits fill:#e3f2fd
```

## Complete Index Structure Example

```mermaid
flowchart TB
    subgraph Graph["Example Git Graph"]
        A["A (id=0)<br/>sha: a1b2c3..."]
        B["B (id=1)<br/>sha: b2c3d4..."]
        C["C (id=2)<br/>sha: c3d4e5..."]
        D["D (id=3)<br/>sha: d4e5f6..."]

        A -->|"parent"| B
        A -->|"parent"| C
        B -->|"parent"| D
        C -->|"parent"| D
    end

    subgraph Forward["Forward Index (fwd)<br/>Who are my children?"]
        FWD_A["A -> bitmap{1, 2}<br/>(children: B, C)"]
        FWD_B["B -> bitmap{3}<br/>(child: D)"]
        FWD_C["C -> bitmap{3}<br/>(child: D)"]
        FWD_D["D -> bitmap{}<br/>(no children)"]
    end

    subgraph Reverse["Reverse Index (rev)<br/>Who are my parents?"]
        REV_A["A -> bitmap{}<br/>(no parents - root)"]
        REV_B["B -> bitmap{0}<br/>(parent: A)"]
        REV_C["C -> bitmap{0}<br/>(parent: A)"]
        REV_D["D -> bitmap{1, 2}<br/>(parents: B, C)"]
    end

    Graph --> Forward
    Graph --> Reverse

    style FWD_A fill:#bbdefb
    style FWD_B fill:#bbdefb
    style FWD_C fill:#bbdefb
    style FWD_D fill:#bbdefb
    style REV_A fill:#c8e6c9
    style REV_B fill:#c8e6c9
    style REV_C fill:#c8e6c9
    style REV_D fill:#c8e6c9
```

## Shard File Format

Each shard file contains a versioned envelope with checksum for integrity:

```mermaid
flowchart TB
    subgraph Envelope["Shard Envelope"]
        direction TB
        V["version: 1"]
        C["checksum: 'sha256...'"]
        D["data: {...}"]
    end

    subgraph MetaShard["meta_a1.json"]
        MD["data: {<br/>  'a1b2c3...': 0,<br/>  'a1f2e3...': 42,<br/>  ...<br/>}"]
    end

    subgraph BitmapShard["shards_fwd_a1.json"]
        BD["data: {<br/>  'a1b2c3...': 'base64bitmap',<br/>  'a1f2e3...': 'base64bitmap',<br/>  ...<br/>}"]
    end

    Envelope --> MetaShard
    Envelope --> BitmapShard
```

## Summary

| Component | Purpose | Lookup Time |
| --------- | ------- | ----------- |
| `meta_XX.json` | SHA to numeric ID mapping | O(1) |
| `shards_fwd_XX.json` | Forward edges (parent to children) | O(1) |
| `shards_rev_XX.json` | Reverse edges (child to parents) | O(1) |
| LRU Cache | Avoid re-loading recently used shards | O(1) |

The combination of:
1. **Numeric IDs** (compact representation)
2. **Roaring Bitmaps** (compressed, fast set operations)
3. **Sharding by prefix** (lazy loading, reduced memory)
4. **LRU caching** (avoid repeated I/O)

...enables EMPTY GRAPH to traverse massive Git commit graphs with constant-time lookups.
