# @git-stunts/empty-graph

> **A graph database built on Git Object Storage.**

[![CI](https://github.com/git-stunts/empty-graph/actions/workflows/ci.yml/badge.svg)](https://github.com/git-stunts/empty-graph/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

EmptyGraph leverages Git's internal Merkle DAG to store immutable, structured data without creating files in the working directory. It implements a secondary Roaring Bitmap index to enable high-performance O(1) graph traversal.

## Documentation

**[Read the Full Documentation](https://empty-graph.git-stunts.io)**

## Features

- **Invisible Storage:** Uses the "Empty Tree" pattern to store data in `.git/objects`.
- **High Performance:** O(1) bidirectional lookups via sharded bitmap indexing.
- **Streaming:** Process millions of nodes with constant memory using async generators.
- **Algorithms:** Built-in BFS, DFS, Dijkstra, A*, and Bidirectional A* search.

## Installation

```bash
npm install @git-stunts/empty-graph @git-stunts/plumbing
```

## Quick Start

```javascript
import GitPlumbing from '@git-stunts/plumbing';
import EmptyGraph, { GitGraphAdapter } from '@git-stunts/empty-graph';

// Initialize on the current directory
const plumbing = new GitPlumbing({ cwd: '.' });
const persistence = new GitGraphAdapter({ plumbing });
const graph = new EmptyGraph({ persistence });

// Create a node (writes to .git/objects)
const sha = await graph.createNode({
  message: JSON.stringify({ type: 'UserCreated', name: 'Alice' })
});

console.log(`Node created: ${sha}`);

// Read it back
const data = await graph.readNode(sha);
console.log(data);
```

## License

Apache-2.0 © James Ross
