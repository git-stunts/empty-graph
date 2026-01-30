# Getting Started

Ready to perform some stunts?

## Installation

```bash
npm install @git-stunts/empty-graph @git-stunts/plumbing
```

## The 30-Second Setup

You need two things:
1.  **Plumbing:** To talk to Git.
2.  **Adapter:** To translate Git to Graph.

```javascript
import GitPlumbing from '@git-stunts/plumbing';
import EmptyGraph, { GitGraphAdapter } from '@git-stunts/empty-graph';

// 1. Point to a directory (it will be `git init`'d automatically if needed)
const plumbing = new GitPlumbing({ cwd: './my-ghost-db' });

// 2. Create the adapter
const persistence = new GitGraphAdapter({ plumbing });

// 3. Initialize the Graph
const graph = new EmptyGraph({ persistence });

// 4. Create your first Invisible Node
const sha = await graph.createNode({
  message: JSON.stringify({
    type: 'Genesis',
    payload: 'Hello from the other side'
  })
});

console.log(`Created node: ${sha}`);
```

## Reading it back

You can read by SHA, or iterate through history.

```javascript
// Direct Read (O(1))
const data = await graph.readNode(sha);

// Stream History
for await (const node of graph.iterateNodes({ ref: sha })) {
  console.log(node.message);
}
```

## Enabling the "Supercharger" (Bitmap Index)

By default, we just use Git. But if you want to find **children** (traverse forward) instantly, you need the index.

```javascript
// Build the index (scans history and saves a binary tree to git)
const indexOid = await graph.rebuildIndex(sha);

// Load it for O(1) powers
await graph.loadIndex(indexOid);

// Now you can look into the future
const children = await graph.getChildren(sha);
```

## Next Steps

- Check out [Event Sourcing](/stunts/event-sourcing) to see how to build a time-traveling application.
- Look at [Resource-Aware Routing](/stunts/lagrangian-routing) for AI agent use cases.
