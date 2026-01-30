# What is EmptyGraph?

EmptyGraph is a TypeScript library that provides a graph database interface over Git's internal object storage.

It allows developers to create, traverse, and query a Directed Acyclic Graph (DAG) where every node is a Git commit. By utilizing the **Empty Tree Pattern**, it stores data exclusively within the `.git` directory, keeping the user's working directory clean.

## The Architecture

Git is fundamentally a content-addressable filesystem. EmptyGraph treats it as a database backend, providing three key layers of abstraction:

### 1. The Storage Layer (Git Objects)
Standard Git commits are used as the storage unit.
*   **Immutability:** Once written, a node cannot be changed, only referenced.
*   **Verification:** Every node ID (SHA-1) is a cryptographic hash of its content and ancestry.
*   **Distribution:** Data can be replicated using standard `git push` and `git pull` commands.

### 2. The Indexing Layer (Roaring Bitmaps)
Git is optimized for historical traversal (`Child -> Parent`). It is inefficient at forward traversal (`Parent -> Child`).

EmptyGraph solves this by maintaining a secondary index:
*   **Mapping:** 40-char SHA-1 hashes are mapped to 32-bit integers.
*   **Bitmaps:** Adjacency lists are stored as compressed Roaring Bitmaps.
*   **Persistence:** This index is sharded and stored back into Git as a set of JSON blobs, allowing for O(1) lookups in both directions.

### 3. The Application Layer (GraphService)
A high-level API for interacting with the graph.
*   `createNode`: Transactional write to the Git ODB.
*   `traversal`: Algorithms including BFS, DFS, Dijkstra, and A*.
*   `streaming`: Async generators for memory-efficient processing of large graphs.

## Why use Git as a Database?

While not a replacement for high-throughput transactional databases (like PostgreSQL), this architecture offers unique advantages for specific domains:

### Offline-First & Distributed
Applications inherit Git's distributed nature. Data can be written offline, branched, and merged later. This is ideal for edge computing, local-first software, and distributed configuration management.

### Auditable History
Because the database *is* a Git repository, the audit trail is built-in. Every change is timestamped, signed, and inextricably linked to its predecessor.

### Zero-Installation
For tools that already exist within a Git repository (CLI tools, CI/CD pipelines, dev-tools), EmptyGraph provides a structured database without requiring a separate server process (like Docker or SQLite). It simply uses the `.git` folder that is already there.