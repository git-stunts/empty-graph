# Event Sourcing

> **The Stunt:** Treating Git commits as immutable domain events, and "replaying" history to build application state.

Event Sourcing is a pattern where you don't store the "current state" (e.g., `User: { name: "Alice" }`). Instead, you store the sequence of events that led there:
1.  `UserCreated { name: "Alice" }`
2.  `UserRenamed { newName: "Al" }`

Git is natively an event store. It is an append-only log of immutable changes.

## The Implementation

With EmptyGraph, every node is an event.

```javascript
// 1. Store an event
await graph.createNode({
  message: JSON.stringify({ type: 'OrderPlaced', amount: 100 }),
  parents: [previousEventSha] // Link to the chain
});

// 2. Replay to build state
let balance = 0;
// Note: ancestors() goes backwards in time, so we reverse it
const history = [];
for await (const node of graph.traversal.ancestors({ sha: 'HEAD' })) {
  history.push(JSON.parse(node.message));
}

for (const event of history.reverse()) {
  if (event.type === 'OrderPlaced') balance += event.amount;
  if (event.type === 'Refunded') balance -= event.amount;
}
```

## Branching = Alternate Timelines

Because it's Git, you can branch your event stream.

- **Main Branch:** The "official" history.
- **Feature Branch:** A "What If" simulation.

You can replay a "simulation branch" to see what the state *would* be if you cancelled an order, without affecting the main timeline. This is incredibly powerful for financial modeling or game state prediction.

## Cryptographic Proof

Every state is cryptographically verifiable. If you have the SHA of the tip of the branch, you have a mathematical guarantee that the entire history leading up to it has not been tampered with. This is built-in Blockchain tech, without the Blockchain hype.
