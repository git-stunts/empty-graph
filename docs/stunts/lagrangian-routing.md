# Resource-Aware Routing

> **The Stunt:** Routing through a graph based on "cost" (CPU, Memory, Latency) rather than just distance, using Dijkstra and A* on top of a Git repo.

Most graph traversals just look for the *shortest* path (fewest hops). But in distributed systems, the shortest path might be the most expensive.

**EmptyGraph** implements "Lagrangian Pathfinding"—a fancy term for "we check the price tag before we walk through the door."

## The Scenario

Imagine you are building an AI Agent that needs to execute a sequence of tasks.
- **Node A:** "Download Data" (High Bandwidth)
- **Node B:** "Process Data" (High CPU)
- **Node C:** "Save to S3" (Low Cost)

If Node B is overloaded, you don't want to route through it, even if it's the "shortest" path. You want the "cheapest" path.

## The Code

We use `weightedShortestPath` with a custom `weightProvider`. This function is async, meaning it can fetch real-time metrics (from Prometheus, a JSON file, or another Git commit) to decide the cost of an edge.

```javascript
const { path, totalCost } = await graph.traversal.weightedShortestPath({
  from: startSha,
  to: targetSha,
  
  // This is where the magic happens
  weightProvider: async (fromSha, toSha) => {
    // 1. Read the node data
    const message = await graph.readNode(toSha);
    const event = JSON.parse(message);
    
    // 2. Extract metrics (simulated or real)
    const cpuLoad = event.metrics?.cpu ?? 1; // 1.0 = 100% load
    const memory = event.metrics?.mem ?? 1;  // 1.0 = 1GB
    
    // 3. Calculate Lagrangian cost
    // Cost = CPU + 1.5 * Memory
    return cpuLoad + (memory * 1.5);
  }
});
```

## Why this is cool

1.  **Dynamic Topography:** The shape of your graph changes based on the *state* of the nodes, not just their connections.
2.  **Invisible Backend:** You can store the metric history *in the graph itself* as a separate branch, and query it during traversal.
3.  **A* Optimization:** If you know the heuristic distance (e.g., "how many steps left?"), you can use `aStarSearch` to prioritize exploring promising paths first, massively pruning the search space.

## Performance Note

This isn't just a toy. Because we use a **MinHeap** and a **Roaring Bitmap Index**, this traversal is extremely efficient. We only load the node data when we actually consider the edge, and we cache heavily.
