---
layout: home

hero:
  name: EmptyGraph
  text: Graph Database on Git Object Storage
  tagline: Invisible storage. O(1) lookups. Zero files.
  actions:
    - theme: brand
      text: Implementation Guide
      link: /guide/what-is-this
    - theme: alt
      text: View on GitHub
      link: https://github.com/git-stunts/empty-graph

features:
  - title: 📦 Content-Addressable
    details: Leverages Git's internal Merkle DAG to store immutable, cryptographically verifiable data nodes.
  - title: ⚡ Indexed Traversal
    details: Implements a secondary Roaring Bitmap index to enable O(1) bidirectional lookups (Parent ↔ Child), bypassing Git's scan limitations.
  - title: 👻 The Empty Tree Pattern
    details: Commits point to the Git "Empty Tree" object. Data is stored strictly in commit messages, leaving the working directory untouched.
  - title: 🌊 Streaming Architecture
    details: Designed for massive datasets. Uses async generators to process millions of nodes with constant memory overhead.
---

## Technical Overview

EmptyGraph is a storage engine that implements a graph database on top of Git's plumbing. It abstracts `git commit-tree`, `git log`, and `git cat-file` into a structured Node API.

### The Storage Mechanism

Unlike standard Git usage, EmptyGraph does not track files. It utilizes the **Empty Tree** (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`) as the root of every commit.

1.  **Nodes** are Git Commits. Data is serialized into the commit message.
2.  **Edges** are Git Parent Pointers.
3.  **State** is the Git Object Database (`.git/objects`).

```bash
# 1. The Working Directory remains empty
$ ls -la
total 0
drwxr-xr-x  2 user  staff  64 Jan 29 12:00 .

# 2. Data is written directly to the Object DB
$ node create-node.js "{"type": "UserCreated", "id": 1}"
Created node: abc123def456...

# 3. Data is retrievable via Git plumbing
$ git log --format=%B -n 1 abc123def
{"type": "UserCreated", "id": 1}
```

## Primary Use Cases

*   **Audit Trails:** Leveraging Git's immutability and cryptographic signing for secure logs.
*   **Invisible Configuration:** Storing application state in a repo without polluting the file system.
*   **Event Sourcing:** Using the commit graph as an append-only event log with built-in branching and merging.
*   **AI Agent Memory:** utilizing the graph structure for resource-aware routing and decision trees.

```