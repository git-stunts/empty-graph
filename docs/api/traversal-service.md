# TraversalService

The engine for walking the graph.

## Methods

### `bfs({ start, maxDepth })`
Breadth-First Search generator.

### `shortestPath({ from, to })`
Finds shortest path using Bidirectional BFS.

### `weightedShortestPath({ from, to, weightProvider })`
Dijkstra's algorithm with custom weights (e.g., for Lagrangian routing).
