/**
 * GraphTraversal — unified traversal engine for any graph backed by a
 * NeighborProviderPort.
 *
 * Subsumes LogicalTraversal (in-memory adjacency) and DagTraversal /
 * DagPathFinding / DagTopology (bitmap-backed commit DAG). One engine,
 * one set of bugs, one set of fixes.
 *
 * ## Determinism Invariants
 *
 * 1. **BFS**: Nodes at equal depth visited in lexicographic nodeId order.
 * 2. **DFS**: Nodes visited in lexicographic nodeId order (leftmost first
 *    via reverse-push).
 * 3. **PQ/Dijkstra/A***: Equal-priority tie-break by lexicographic nodeId
 *    (ascending). Equal-cost path tie-break: update predecessor when
 *    `altCost === bestCost && candidatePredecessorId < currentPredecessorId`.
 * 4. **Kahn (topoSort)**: Zero-indegree nodes dequeued in lexicographic
 *    nodeId order.
 * 5. **Neighbor lists**: Every NeighborProviderPort returns edges sorted by
 *    (neighborId, label). Strict codepoint comparison, never localeCompare.
 * 6. **Direction 'both'**: union(out, in) deduped by (neighborId, label).
 *    Intentionally lossy about direction.
 * 7. **weightFn/heuristicFn purity**: These functions must be pure and
 *    deterministic for a given (from, to, label) / (nodeId, goalId)
 *    within a traversal run, or determinism is impossible.
 * 8. **Never** rely on JS Map/Set iteration order — always explicit sort.
 *
 * ## Error Handling Convention
 *
 * - `shortestPath` returns `{ found: false, path: [], length: -1 }` on no path.
 * - `weightedShortestPath`, `aStarSearch`, and `bidirectionalAStar` throw
 *   `TraversalError` with code `'NO_PATH'` when no path exists.
 * - All start-node methods throw `TraversalError` with code `'INVALID_START'`
 *   when the start node does not exist in the provider.
 *
 * @module domain/services/GraphTraversal
 */

import nullLogger from '../utils/nullLogger.js';
import TraversalError from '../errors/TraversalError.js';
import MinHeap from '../utils/MinHeap.js';
import LRUCache from '../utils/LRUCache.js';
import { checkAborted } from '../utils/cancellation.js';

/** @typedef {import('../../ports/NeighborProviderPort.js').default} NeighborProviderPort */
/** @typedef {import('../../ports/NeighborProviderPort.js').Direction} Direction */
/** @typedef {import('../../ports/NeighborProviderPort.js').NeighborEdge} NeighborEdge */
/** @typedef {import('../../ports/NeighborProviderPort.js').NeighborOptions} NeighborOptions */

/**
 * @typedef {Object} TraversalStats
 * @property {number} nodesVisited
 * @property {number} edgesTraversed
 * @property {number} cacheHits
 * @property {number} cacheMisses
 */

/**
 * @typedef {Object} TraversalHooks
 * @property {((nodeId: string, depth: number) => void)} [onVisit]
 * @property {((nodeId: string, neighbors: NeighborEdge[]) => void)} [onExpand]
 */

const DEFAULT_MAX_NODES = 100000;
const DEFAULT_MAX_DEPTH = 1000;

/**
 * Lexicographic nodeId comparator for MinHeap tie-breaking.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
const lexTieBreaker = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ==== Section 1: Configuration & Neighbor Cache ====

export default class GraphTraversal {
  /**
   * @param {Object} params
   * @param {NeighborProviderPort} params.provider
   * @param {import('../../ports/LoggerPort.js').default} [params.logger]
   * @param {number} [params.neighborCacheSize]
   */
  constructor({ provider, logger = nullLogger, neighborCacheSize = 256 }) {
    this._provider = provider;
    this._logger = logger;
    /** @type {LRUCache<string, NeighborEdge[]> | null} */
    this._neighborCache = provider.latencyClass === 'sync'
      ? null
      : new LRUCache(neighborCacheSize);
    /** @type {number} */
    this._cacheHits = 0;
    /** @type {number} */
    this._cacheMisses = 0;
    /** @type {number} */
    this._edgesTraversed = 0;
  }

  /**
   * Resets per-run stats counters.
   * @private
   */
  _resetStats() {
    this._cacheHits = 0;
    this._cacheMisses = 0;
    this._edgesTraversed = 0;
  }

  /**
   * Builds a stats snapshot.
   * @param {number} nodesVisited
   * @returns {TraversalStats}
   * @private
   */
  _stats(nodesVisited) {
    return {
      nodesVisited,
      edgesTraversed: this._edgesTraversed,
      cacheHits: this._cacheHits,
      cacheMisses: this._cacheMisses,
    };
  }

  /**
   * Gets neighbors with optional LRU memoization.
   *
   * @param {string} nodeId
   * @param {Direction} direction
   * @param {NeighborOptions} [options]
   * @returns {Promise<NeighborEdge[]>}
   * @private
   */
  async _getNeighbors(nodeId, direction, options) {
    const cache = this._neighborCache;
    if (!cache) {
      return await this._provider.getNeighbors(nodeId, direction, options);
    }

    const labelsKey = options?.labels ? [...options.labels].sort().join(',') : '*';
    const key = `${nodeId}\0${direction}\0${labelsKey}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      this._cacheHits++;
      return cached;
    }
    this._cacheMisses++;
    const result = await this._provider.getNeighbors(nodeId, direction, options);
    cache.set(key, result);
    return result;
  }

  // ==== Section 2: Primitive Traversals (BFS, DFS) ====

  /**
   * Breadth-first search.
   *
   * Deterministic: nodes at equal depth are visited in lexicographic nodeId order.
   *
   * @param {Object} params
   * @param {string} params.start
   * @param {Direction} [params.direction]
   * @param {NeighborOptions} [params.options]
   * @param {number} [params.maxNodes]
   * @param {number} [params.maxDepth]
   * @param {AbortSignal} [params.signal]
   * @param {TraversalHooks} [params.hooks]
   * @returns {Promise<{nodes: string[], stats: TraversalStats}>}
   */
  async bfs({
    start, direction = 'out', options,
    maxNodes = DEFAULT_MAX_NODES,
    maxDepth = DEFAULT_MAX_DEPTH,
    signal, hooks,
  }) {
    this._resetStats();
    await this._validateStart(start);
    const visited = new Set();
    /** @type {Array<{nodeId: string, depth: number}>} */
    let currentLevel = [{ nodeId: start, depth: 0 }];
    const result = [];

    while (currentLevel.length > 0 && visited.size < maxNodes) {
      // Sort current level lexicographically for deterministic order
      currentLevel.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
      /** @type {Array<{nodeId: string, depth: number}>} */
      const nextLevel = [];
      /** @type {Set<string>} — dedup within this level to avoid O(E) duplicates */
      const queued = new Set();

      for (const { nodeId, depth } of currentLevel) {
        if (visited.size >= maxNodes) { break; }
        if (visited.has(nodeId)) { continue; }
        if (depth > maxDepth) { continue; }

        if (visited.size % 1000 === 0) {
          checkAborted(signal, 'bfs');
        }

        visited.add(nodeId);
        result.push(nodeId);
        if (hooks?.onVisit) { hooks.onVisit(nodeId, depth); }

        if (depth < maxDepth) {
          const neighbors = await this._getNeighbors(nodeId, direction, options);
          this._edgesTraversed += neighbors.length;
          if (hooks?.onExpand) { hooks.onExpand(nodeId, neighbors); }
          for (const { neighborId } of neighbors) {
            if (!visited.has(neighborId) && !queued.has(neighborId)) {
              queued.add(neighborId);
              nextLevel.push({ nodeId: neighborId, depth: depth + 1 });
            }
          }
        }
      }
      currentLevel = nextLevel;
    }

    return { nodes: result, stats: this._stats(visited.size) };
  }

  /**
   * Depth-first search (pre-order).
   *
   * Deterministic: leftmost-first via reverse-push of sorted neighbors.
   *
   * @param {Object} params
   * @param {string} params.start
   * @param {Direction} [params.direction]
   * @param {NeighborOptions} [params.options]
   * @param {number} [params.maxNodes]
   * @param {number} [params.maxDepth]
   * @param {AbortSignal} [params.signal]
   * @param {TraversalHooks} [params.hooks]
   * @returns {Promise<{nodes: string[], stats: TraversalStats}>}
   */
  async dfs({
    start, direction = 'out', options,
    maxNodes = DEFAULT_MAX_NODES,
    maxDepth = DEFAULT_MAX_DEPTH,
    signal, hooks,
  }) {
    this._resetStats();
    await this._validateStart(start);
    const visited = new Set();
    /** @type {Array<{nodeId: string, depth: number}>} */
    const stack = [{ nodeId: start, depth: 0 }];
    const result = [];

    while (stack.length > 0 && visited.size < maxNodes) {
      const { nodeId, depth } = /** @type {{nodeId: string, depth: number}} */ (stack.pop());
      if (visited.has(nodeId)) { continue; }
      if (depth > maxDepth) { continue; }

      if (visited.size % 1000 === 0) {
        checkAborted(signal, 'dfs');
      }

      visited.add(nodeId);
      result.push(nodeId);
      if (hooks?.onVisit) { hooks.onVisit(nodeId, depth); }

      if (depth < maxDepth) {
        const neighbors = await this._getNeighbors(nodeId, direction, options);
        this._edgesTraversed += neighbors.length;
        if (hooks?.onExpand) { hooks.onExpand(nodeId, neighbors); }
        // Reverse-push so first neighbor (lex smallest) is popped first
        for (let i = neighbors.length - 1; i >= 0; i -= 1) {
          if (!visited.has(neighbors[i].neighborId)) {
            stack.push({ nodeId: neighbors[i].neighborId, depth: depth + 1 });
          }
        }
      }
    }

    return { nodes: result, stats: this._stats(visited.size) };
  }

  // ==== Section 3: Path-Finding (shortestPath, Dijkstra, A*, bidirectional A*) ====

  /**
   * Unweighted shortest path (BFS-based).
   *
   * @param {Object} params
   * @param {string} params.start
   * @param {string} params.goal
   * @param {Direction} [params.direction]
   * @param {NeighborOptions} [params.options]
   * @param {number} [params.maxNodes]
   * @param {number} [params.maxDepth]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{found: boolean, path: string[], length: number, stats: TraversalStats}>}
   */
  async shortestPath({
    start, goal, direction = 'out', options,
    maxNodes = DEFAULT_MAX_NODES,
    maxDepth = DEFAULT_MAX_DEPTH,
    signal,
  }) {
    this._resetStats();
    await this._validateStart(start);
    if (start === goal) {
      return { found: true, path: [start], length: 0, stats: this._stats(1) };
    }

    const visited = new Set([start]);
    const parent = new Map();
    /** @type {Array<{nodeId: string, depth: number}>} */
    let frontier = [{ nodeId: start, depth: 0 }];

    while (frontier.length > 0 && visited.size < maxNodes) {
      // Sort frontier for deterministic BFS
      frontier.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
      /** @type {Array<{nodeId: string, depth: number}>} */
      const nextFrontier = [];

      for (const { nodeId, depth } of frontier) {
        if (depth >= maxDepth) { continue; }
        if (visited.size % 1000 === 0) {
          checkAborted(signal, 'shortestPath');
        }

        const neighbors = await this._getNeighbors(nodeId, direction, options);
        this._edgesTraversed += neighbors.length;

        for (const { neighborId } of neighbors) {
          if (visited.has(neighborId)) { continue; }
          visited.add(neighborId);
          parent.set(neighborId, nodeId);

          if (neighborId === goal) {
            const path = this._reconstructPath(parent, start, goal);
            return { found: true, path, length: path.length - 1, stats: this._stats(visited.size) };
          }
          nextFrontier.push({ nodeId: neighborId, depth: depth + 1 });
        }
      }
      frontier = nextFrontier;
    }

    return { found: false, path: [], length: -1, stats: this._stats(visited.size) };
  }

  /**
   * Reachability check — BFS with early termination.
   *
   * @param {Object} params
   * @param {string} params.start
   * @param {string} params.goal
   * @param {Direction} [params.direction]
   * @param {NeighborOptions} [params.options]
   * @param {number} [params.maxNodes]
   * @param {number} [params.maxDepth]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{reachable: boolean, stats: TraversalStats}>}
   */
  async isReachable({
    start, goal, direction = 'out', options,
    maxNodes = DEFAULT_MAX_NODES,
    maxDepth = DEFAULT_MAX_DEPTH,
    signal,
  }) {
    this._resetStats();
    if (start === goal) {
      return { reachable: true, stats: this._stats(1) };
    }

    const visited = new Set([start]);
    /** @type {string[]} */
    let frontier = [start];
    let depth = 0;

    while (frontier.length > 0 && depth < maxDepth && visited.size < maxNodes) {
      if (visited.size % 1000 === 0) {
        checkAborted(signal, 'isReachable');
      }
      /** @type {string[]} */
      const nextFrontier = [];
      for (const nodeId of frontier) {
        const neighbors = await this._getNeighbors(nodeId, direction, options);
        this._edgesTraversed += neighbors.length;
        for (const { neighborId } of neighbors) {
          if (neighborId === goal) {
            return { reachable: true, stats: this._stats(visited.size) };
          }
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            nextFrontier.push(neighborId);
          }
        }
      }
      frontier = nextFrontier;
      depth++;
    }

    return { reachable: false, stats: this._stats(visited.size) };
  }

  /**
   * Weighted shortest path (Dijkstra's algorithm).
   *
   * Tie-breaking: equal-priority by lexicographic nodeId. Equal-cost
   * predecessor update: when altCost === bestCost && candidatePredecessor < currentPredecessor.
   *
   * @param {Object} params
   * @param {string} params.start
   * @param {string} params.goal
   * @param {Direction} [params.direction]
   * @param {NeighborOptions} [params.options]
   * @param {(from: string, to: string, label: string) => number | Promise<number>} [params.weightFn]
   * @param {number} [params.maxNodes]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{path: string[], totalCost: number, stats: TraversalStats}>}
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   */
  async weightedShortestPath({
    start, goal, direction = 'out', options,
    weightFn = () => 1,
    maxNodes = DEFAULT_MAX_NODES,
    signal,
  }) {
    this._resetStats();
    await this._validateStart(start);
    /** @type {Map<string, number>} */
    const dist = new Map([[start, 0]]);
    /** @type {Map<string, string>} */
    const prev = new Map();
    const visited = new Set();

    const pq = new MinHeap({ tieBreaker: lexTieBreaker });
    pq.insert(start, 0);

    while (!pq.isEmpty() && visited.size < maxNodes) {
      checkAborted(signal, 'weightedShortestPath');

      const current = /** @type {string} */ (pq.extractMin());
      if (visited.has(current)) { continue; }
      visited.add(current);

      if (current === goal) {
        const path = this._reconstructPath(prev, start, goal);
        return { path, totalCost: /** @type {number} */ (dist.get(goal)), stats: this._stats(visited.size) };
      }

      const neighbors = await this._getNeighbors(current, direction, options);
      this._edgesTraversed += neighbors.length;

      for (const { neighborId, label } of neighbors) {
        if (visited.has(neighborId)) { continue; }
        const w = await weightFn(current, neighborId, label);
        const alt = /** @type {number} */ (dist.get(current)) + w;
        const best = dist.has(neighborId) ? /** @type {number} */ (dist.get(neighborId)) : Infinity;

        if (alt < best || (alt === best && this._shouldUpdatePredecessor(prev, neighborId, current))) {
          dist.set(neighborId, alt);
          prev.set(neighborId, current);
          pq.insert(neighborId, alt);
        }
      }
    }

    throw new TraversalError(`No path from ${start} to ${goal}`, {
      code: 'NO_PATH',
      context: { start, goal },
    });
  }

  /**
   * A* search with heuristic guidance.
   *
   * @param {Object} params
   * @param {string} params.start
   * @param {string} params.goal
   * @param {Direction} [params.direction]
   * @param {NeighborOptions} [params.options]
   * @param {(from: string, to: string, label: string) => number | Promise<number>} [params.weightFn]
   * @param {(nodeId: string, goalId: string) => number} [params.heuristicFn]
   * @param {number} [params.maxNodes]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{path: string[], totalCost: number, nodesExplored: number, stats: TraversalStats}>}
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   */
  async aStarSearch({
    start, goal, direction = 'out', options,
    weightFn = () => 1,
    heuristicFn = () => 0,
    maxNodes = DEFAULT_MAX_NODES,
    signal,
  }) {
    this._resetStats();
    await this._validateStart(start);
    /** @type {Map<string, number>} */
    const gScore = new Map([[start, 0]]);
    /** @type {Map<string, string>} */
    const prev = new Map();
    const visited = new Set();

    const pq = new MinHeap({ tieBreaker: lexTieBreaker });
    pq.insert(start, heuristicFn(start, goal));

    while (!pq.isEmpty() && visited.size < maxNodes) {
      checkAborted(signal, 'aStarSearch');

      const current = /** @type {string} */ (pq.extractMin());
      if (visited.has(current)) { continue; }
      visited.add(current);

      if (current === goal) {
        const path = this._reconstructPath(prev, start, goal);
        return {
          path,
          totalCost: /** @type {number} */ (gScore.get(goal)),
          nodesExplored: visited.size,
          stats: this._stats(visited.size),
        };
      }

      const neighbors = await this._getNeighbors(current, direction, options);
      this._edgesTraversed += neighbors.length;

      for (const { neighborId, label } of neighbors) {
        if (visited.has(neighborId)) { continue; }
        const w = await weightFn(current, neighborId, label);
        const tentG = /** @type {number} */ (gScore.get(current)) + w;
        const bestG = gScore.has(neighborId) ? /** @type {number} */ (gScore.get(neighborId)) : Infinity;

        if (tentG < bestG || (tentG === bestG && this._shouldUpdatePredecessor(prev, neighborId, current))) {
          gScore.set(neighborId, tentG);
          prev.set(neighborId, current);
          pq.insert(neighborId, tentG + heuristicFn(neighborId, goal));
        }
      }
    }

    throw new TraversalError(`No path from ${start} to ${goal}`, {
      code: 'NO_PATH',
      context: { start, goal, nodesExplored: visited.size },
    });
  }

  /**
   * Bidirectional A* search.
   *
   * **Direction is fixed:** forward expansion uses `'out'` edges, backward
   * expansion uses `'in'` edges. Unlike other pathfinding methods, this one
   * does not accept a `direction` parameter. This is inherent to the
   * bidirectional algorithm — forward always means outgoing, backward always
   * means incoming.
   *
   * @param {Object} params
   * @param {string} params.start
   * @param {string} params.goal
   * @param {NeighborOptions} [params.options]
   * @param {(from: string, to: string, label: string) => number | Promise<number>} [params.weightFn]
   * @param {(nodeId: string, goalId: string) => number} [params.forwardHeuristic]
   * @param {(nodeId: string, goalId: string) => number} [params.backwardHeuristic]
   * @param {number} [params.maxNodes]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{path: string[], totalCost: number, nodesExplored: number, stats: TraversalStats}>}
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   */
  async bidirectionalAStar({
    start, goal, options,
    weightFn = () => 1,
    forwardHeuristic = () => 0,
    backwardHeuristic = () => 0,
    maxNodes = DEFAULT_MAX_NODES,
    signal,
  }) {
    this._resetStats();
    await this._validateStart(start);
    if (start === goal) {
      return { path: [start], totalCost: 0, nodesExplored: 1, stats: this._stats(1) };
    }

    const fwdG = new Map([[start, 0]]);
    const fwdPrev = new Map();
    const fwdVisited = new Set();
    const fwdHeap = new MinHeap({ tieBreaker: lexTieBreaker });
    fwdHeap.insert(start, forwardHeuristic(start, goal));

    const bwdG = new Map([[goal, 0]]);
    const bwdNext = new Map();
    const bwdVisited = new Set();
    const bwdHeap = new MinHeap({ tieBreaker: lexTieBreaker });
    bwdHeap.insert(goal, backwardHeuristic(goal, start));

    let mu = Infinity;
    /** @type {string|null} */
    let meeting = null;
    let explored = 0;

    while ((!fwdHeap.isEmpty() || !bwdHeap.isEmpty()) && explored < maxNodes) {
      checkAborted(signal, 'bidirectionalAStar');
      const fwdF = fwdHeap.peekPriority();
      const bwdF = bwdHeap.peekPriority();
      if (Math.min(fwdF, bwdF) >= mu) { break; }

      if (fwdF <= bwdF) {
        const r = await this._biAStarExpand({
          heap: fwdHeap, visited: fwdVisited, gScore: fwdG, predMap: fwdPrev,
          otherVisited: bwdVisited, otherG: bwdG,
          weightFn, heuristicFn: forwardHeuristic,
          target: goal, directionForNeighbors: 'out', options,
          mu, meeting,
        });
        explored += r.explored;
        mu = r.mu;
        meeting = r.meeting;
      } else {
        const r = await this._biAStarExpand({
          heap: bwdHeap, visited: bwdVisited, gScore: bwdG, predMap: bwdNext,
          otherVisited: fwdVisited, otherG: fwdG,
          weightFn, heuristicFn: backwardHeuristic,
          target: start, directionForNeighbors: 'in', options,
          mu, meeting,
        });
        explored += r.explored;
        mu = r.mu;
        meeting = r.meeting;
      }
    }

    if (meeting === null) {
      throw new TraversalError(`No path from ${start} to ${goal}`, {
        code: 'NO_PATH',
        context: { start, goal, nodesExplored: explored },
      });
    }

    const path = this._reconstructBiPath(fwdPrev, bwdNext, start, goal, meeting);
    return { path, totalCost: mu, nodesExplored: explored, stats: this._stats(explored) };
  }

  /**
   * Expand one node in bidirectional A*.
   * @private
   * @param {Object} p
   * @param {MinHeap<string>} p.heap
   * @param {Set<string>} p.visited
   * @param {Map<string, number>} p.gScore
   * @param {Map<string, string>} p.predMap
   * @param {Set<string>} p.otherVisited
   * @param {Map<string, number>} p.otherG
   * @param {(from: string, to: string, label: string) => number | Promise<number>} p.weightFn
   * @param {(nodeId: string, goalId: string) => number} p.heuristicFn
   * @param {string} p.target
   * @param {Direction} p.directionForNeighbors
   * @param {NeighborOptions} [p.options]
   * @param {number} p.mu
   * @param {string|null} p.meeting
   * @returns {Promise<{explored: number, mu: number, meeting: string|null}>}
   */
  async _biAStarExpand({
    heap, visited, gScore, predMap,
    otherVisited, otherG,
    weightFn, heuristicFn, target,
    directionForNeighbors, options,
    mu: inputMu, meeting: inputMeeting,
  }) {
    const current = /** @type {string} */ (heap.extractMin());
    if (visited.has(current)) {
      return { explored: 0, mu: inputMu, meeting: inputMeeting };
    }
    visited.add(current);

    let resultMu = inputMu;
    let resultMeeting = inputMeeting;

    if (otherVisited.has(current)) {
      const cost = /** @type {number} */ (gScore.get(current)) + /** @type {number} */ (otherG.get(current));
      if (cost < resultMu || (cost === resultMu && (resultMeeting === null || current < resultMeeting))) {
        resultMu = cost;
        resultMeeting = current;
      }
    }

    const neighbors = await this._getNeighbors(current, directionForNeighbors, options);
    this._edgesTraversed += neighbors.length;

    for (const { neighborId, label } of neighbors) {
      if (visited.has(neighborId)) { continue; }
      const w = directionForNeighbors === 'in'
        ? await weightFn(neighborId, current, label)
        : await weightFn(current, neighborId, label);
      const tentG = /** @type {number} */ (gScore.get(current)) + w;
      const bestG = gScore.has(neighborId) ? /** @type {number} */ (gScore.get(neighborId)) : Infinity;

      if (tentG < bestG || (tentG === bestG && this._shouldUpdatePredecessor(predMap, neighborId, current))) {
        gScore.set(neighborId, tentG);
        predMap.set(neighborId, current);
        heap.insert(neighborId, tentG + heuristicFn(neighborId, target));

        if (otherG.has(neighborId)) {
          const total = tentG + /** @type {number} */ (otherG.get(neighborId));
          if (total < resultMu || (total === resultMu && (resultMeeting === null || neighborId < resultMeeting))) {
            resultMu = total;
            resultMeeting = neighborId;
          }
        }
      }
    }

    return { explored: 1, mu: resultMu, meeting: resultMeeting };
  }

  // ==== Section 4: Topology & Components (topoSort, CC, weightedLongestPath) ====

  /**
   * Connected component — delegates to BFS with direction 'both'.
   *
   * @param {Object} params
   * @param {string} params.start
   * @param {NeighborOptions} [params.options]
   * @param {number} [params.maxNodes]
   * @param {number} [params.maxDepth]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{nodes: string[], stats: TraversalStats}>}
   */
  async connectedComponent({ start, options, maxNodes, maxDepth, signal }) {
    return await this.bfs({ start, direction: 'both', options, maxNodes, maxDepth, signal });
  }

  /**
   * Topological sort (Kahn's algorithm).
   *
   * Deterministic: zero-indegree nodes dequeued in lexicographic nodeId order.
   *
   * @param {Object} params
   * @param {string | string[]} params.start - One or more start nodes
   * @param {Direction} [params.direction]
   * @param {NeighborOptions} [params.options]
   * @param {number} [params.maxNodes]
   * @param {boolean} [params.throwOnCycle]
   * @param {AbortSignal} [params.signal]
   * @param {boolean} [params._returnAdjList] - Private: return neighbor edge map alongside sorted (for internal reuse)
   * @returns {Promise<{sorted: string[], hasCycle: boolean, stats: TraversalStats, _neighborEdgeMap?: Map<string, NeighborEdge[]>}>}
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if throwOnCycle is true and cycle found
   */
  async topologicalSort({
    start, direction = 'out', options,
    maxNodes = DEFAULT_MAX_NODES,
    throwOnCycle = false,
    signal,
    _returnAdjList = false,
  }) {
    this._resetStats();
    const starts = Array.isArray(start) ? start : [start];

    // Phase 1: Discover all reachable nodes + compute in-degrees
    /** @type {Map<string, string[]>} */
    const adjList = new Map();
    /** @type {Map<string, NeighborEdge[]>} — populated when _returnAdjList is true */
    const neighborEdgeMap = new Map();
    /** @type {Map<string, number>} */
    const inDegree = new Map();
    const discovered = new Set();
    /** @type {string[]} */
    const queue = [...starts];
    let qHead = 0;
    for (const s of starts) { discovered.add(s); }

    while (qHead < queue.length) {
      if (discovered.size % 1000 === 0) {
        checkAborted(signal, 'topologicalSort');
      }
      const nodeId = /** @type {string} */ (queue[qHead++]);
      const neighbors = await this._getNeighbors(nodeId, direction, options);
      this._edgesTraversed += neighbors.length;

      /** @type {string[]} */
      const neighborIds = [];
      for (const { neighborId } of neighbors) {
        neighborIds.push(neighborId);
        inDegree.set(neighborId, (inDegree.get(neighborId) || 0) + 1);
        if (!discovered.has(neighborId)) {
          discovered.add(neighborId);
          queue.push(neighborId);
        }
      }
      adjList.set(nodeId, neighborIds);
      neighborEdgeMap.set(nodeId, neighbors);
    }

    // Ensure starts have in-degree entries
    for (const s of starts) {
      if (!inDegree.has(s)) {
        inDegree.set(s, 0);
      }
    }

    // Phase 2: Kahn's — collect zero-indegree nodes, sort them lex, yield in order
    /** @type {string[]} */
    const ready = [];
    for (const nodeId of discovered) {
      if ((inDegree.get(nodeId) || 0) === 0) {
        ready.push(nodeId);
      }
    }
    ready.sort(lexTieBreaker);

    const sorted = [];
    let rHead = 0;
    while (rHead < ready.length && sorted.length < maxNodes) {
      if (sorted.length % 1000 === 0) {
        checkAborted(signal, 'topologicalSort');
      }
      const nodeId = /** @type {string} */ (ready[rHead++]);
      sorted.push(nodeId);

      const neighbors = adjList.get(nodeId) || [];
      /** @type {string[]} */
      const newlyReady = [];
      for (const neighborId of neighbors) {
        const deg = /** @type {number} */ (inDegree.get(neighborId)) - 1;
        inDegree.set(neighborId, deg);
        if (deg === 0) {
          newlyReady.push(neighborId);
        }
      }
      // Insert newly ready nodes in sorted position
      if (newlyReady.length > 0) {
        newlyReady.sort(lexTieBreaker);
        // Compact consumed prefix before merge to keep rHead at 0
        if (rHead > 0) {
          ready.splice(0, rHead);
          rHead = 0;
        }
        this._insertSorted(ready, newlyReady);
      }
    }

    const hasCycle = sorted.length < discovered.size;
    if (hasCycle && throwOnCycle) {
      // Find a back-edge as witness
      const inSorted = new Set(sorted);
      /** @type {string|undefined} */
      let cycleWitnessFrom;
      /** @type {string|undefined} */
      let cycleWitnessTo;
      for (const [nodeId, neighbors] of adjList) {
        if (inSorted.has(nodeId)) { continue; }
        for (const neighborId of neighbors) {
          if (!inSorted.has(neighborId)) {
            cycleWitnessFrom = nodeId;
            cycleWitnessTo = neighborId;
            break;
          }
        }
        if (cycleWitnessFrom) { break; }
      }

      throw new TraversalError('Graph contains a cycle', {
        code: 'ERR_GRAPH_HAS_CYCLES',
        context: {
          nodesInCycle: discovered.size - sorted.length,
          cycleWitness: cycleWitnessFrom ? { from: cycleWitnessFrom, to: cycleWitnessTo } : undefined,
        },
      });
    }

    return {
      sorted,
      hasCycle,
      stats: this._stats(sorted.length),
      _neighborEdgeMap: _returnAdjList ? neighborEdgeMap : undefined,
    };
  }

  /**
   * Common ancestors — multi-source ancestor intersection.
   *
   * For each input node, performs a BFS backward ('in') to collect its
   * ancestor set. The result is the intersection of all ancestor sets.
   *
   * **Self-inclusion:** The BFS from each node includes the node itself
   * (depth 0). Therefore, the result may include the input nodes themselves
   * if they are reachable from all other input nodes via backward edges.
   * For example, if A has backward edges to B and C, and you pass
   * `[A, B, C]`, then B and C may appear in the result because A's BFS
   * reaches them and their own BFS includes themselves at depth 0.
   *
   * @param {Object} params
   * @param {string[]} params.nodes - Nodes to find common ancestors of
   * @param {NeighborOptions} [params.options]
   * @param {number} [params.maxDepth]
   * @param {number} [params.maxResults]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{ancestors: string[], stats: TraversalStats}>}
   */
  async commonAncestors({
    nodes, options,
    maxDepth = DEFAULT_MAX_DEPTH,
    maxResults = 100,
    signal,
  }) {
    this._resetStats();
    if (nodes.length === 0) {
      return { ancestors: [], stats: this._stats(0) };
    }

    // For each node, BFS backward ('in') to collect ancestors
    /** @type {Map<string, number>} */
    const ancestorCounts = new Map();
    const requiredCount = nodes.length;

    for (const nodeId of nodes) {
      checkAborted(signal, 'commonAncestors');
      const { nodes: ancestors } = await this.bfs({
        start: nodeId,
        direction: 'in',
        options,
        maxDepth,
        signal,
      });
      for (const a of ancestors) {
        ancestorCounts.set(a, (ancestorCounts.get(a) || 0) + 1);
      }
    }

    // Collect nodes reachable from ALL inputs, sorted lex
    const common = [];
    const entries = [...ancestorCounts.entries()]
      .filter(([, count]) => count === requiredCount)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    for (const [ancestor] of entries) {
      common.push(ancestor);
      if (common.length >= maxResults) { break; }
    }

    return { ancestors: common, stats: this._stats(ancestorCounts.size) };
  }

  /**
   * Weighted longest path via topological sort + DP.
   *
   * Only valid on DAGs. Throws ERR_GRAPH_HAS_CYCLES if graph has cycles.
   *
   * @param {Object} params
   * @param {string} params.start
   * @param {string} params.goal
   * @param {Direction} [params.direction]
   * @param {NeighborOptions} [params.options]
   * @param {(from: string, to: string, label: string) => number | Promise<number>} [params.weightFn]
   * @param {number} [params.maxNodes]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{path: string[], totalCost: number, stats: TraversalStats}>}
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if graph has cycles
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   */
  async weightedLongestPath({
    start, goal, direction = 'out', options,
    weightFn = () => 1,
    maxNodes = DEFAULT_MAX_NODES,
    signal,
  }) {
    await this._validateStart(start);
    // Run topo sort first — will throw on cycles.
    // Request the neighbor edge map so the DP phase can reuse it
    // instead of re-fetching neighbors from the provider.
    const { sorted, _neighborEdgeMap } = await this.topologicalSort({
      start,
      direction,
      options,
      maxNodes,
      throwOnCycle: true,
      signal,
      _returnAdjList: true,
    });

    this._resetStats();

    // DP: longest distance from start
    /** @type {Map<string, number>} */
    const dist = new Map([[start, 0]]);
    /** @type {Map<string, string>} */
    const prev = new Map();

    for (const nodeId of sorted) {
      if (!dist.has(nodeId)) { continue; }
      // Reuse neighbor data from topo sort's discovery phase
      const neighbors = _neighborEdgeMap
        ? (_neighborEdgeMap.get(nodeId) || [])
        : await this._getNeighbors(nodeId, direction, options);
      this._edgesTraversed += neighbors.length;

      for (const { neighborId, label } of neighbors) {
        const w = await weightFn(nodeId, neighborId, label);
        const alt = /** @type {number} */ (dist.get(nodeId)) + w;
        const best = dist.has(neighborId) ? /** @type {number} */ (dist.get(neighborId)) : -Infinity;

        if (alt > best || (alt === best && this._shouldUpdatePredecessor(prev, neighborId, nodeId))) {
          dist.set(neighborId, alt);
          prev.set(neighborId, nodeId);
        }
      }
    }

    if (!dist.has(goal)) {
      throw new TraversalError(`No path from ${start} to ${goal}`, {
        code: 'NO_PATH',
        context: { start, goal },
      });
    }

    const path = this._reconstructPath(prev, start, goal);
    return { path, totalCost: /** @type {number} */ (dist.get(goal)), stats: this._stats(sorted.length) };
  }

  // ==== Private Helpers ====

  /**
   * Validates that a start node exists in the provider.
   * Throws INVALID_START if the node is not alive.
   *
   * @param {string} nodeId
   * @returns {Promise<void>}
   * @private
   */
  async _validateStart(nodeId) {
    const exists = await this._provider.hasNode(nodeId);
    if (!exists) {
      throw new TraversalError(`Start node '${nodeId}' does not exist in the graph`, {
        code: 'INVALID_START',
        context: { nodeId },
      });
    }
  }

  /**
   * Reconstructs a path by walking backward through a predecessor map.
   * @param {Map<string, string>} predMap
   * @param {string} start
   * @param {string} goal
   * @returns {string[]}
   * @private
   */
  _reconstructPath(predMap, start, goal) {
    const path = [goal];
    let current = goal;
    while (current !== start) {
      const pred = predMap.get(current);
      if (pred === undefined) { break; }
      path.push(pred);
      current = pred;
    }
    path.reverse();
    return path;
  }

  /**
   * Reconstructs a bidirectional path from two predecessor maps.
   * @param {Map<string, string>} fwdPrev - Forward predecessor map
   * @param {Map<string, string>} bwdNext - Backward predecessor map (maps node → its successor toward goal)
   * @param {string} start
   * @param {string} goal
   * @param {string} meeting
   * @returns {string[]}
   * @private
   */
  _reconstructBiPath(fwdPrev, bwdNext, start, goal, meeting) {
    // Forward half: meeting → start (walk fwdPrev backward)
    const fwdHalf = [meeting];
    let cur = meeting;
    while (cur !== start && fwdPrev.has(cur)) {
      cur = /** @type {string} */ (fwdPrev.get(cur));
      fwdHalf.push(cur);
    }
    fwdHalf.reverse();

    // Backward half: meeting → goal (walk bwdNext forward)
    cur = meeting;
    while (cur !== goal && bwdNext.has(cur)) {
      cur = /** @type {string} */ (bwdNext.get(cur));
      fwdHalf.push(cur);
    }

    return fwdHalf;
  }

  /**
   * Determines if a predecessor should be updated on equal cost.
   * Returns true when the candidate predecessor is lexicographically
   * smaller than the current predecessor (deterministic tie-break).
   *
   * @param {Map<string, string>} predMap
   * @param {string} nodeId
   * @param {string} candidatePred
   * @returns {boolean}
   * @private
   */
  _shouldUpdatePredecessor(predMap, nodeId, candidatePred) {
    const current = predMap.get(nodeId);
    if (current === undefined) { return true; }
    return candidatePred < current;
  }

  /**
   * Inserts sorted items into a sorted array maintaining order.
   * Both input arrays must be sorted by lexTieBreaker.
   *
   * @param {string[]} target - Sorted array to insert into (mutated in place)
   * @param {string[]} items - Sorted items to insert
   * @private
   */
  _insertSorted(target, items) {
    // O(n+k) merge: build merged array from two sorted inputs
    const merged = [];
    let ti = 0;
    let ii = 0;
    while (ti < target.length && ii < items.length) {
      if (target[ti] <= items[ii]) {
        merged.push(target[ti++]);
      } else {
        merged.push(items[ii++]);
      }
    }
    while (ti < target.length) { merged.push(target[ti++]); }
    while (ii < items.length) { merged.push(items[ii++]); }
    target.length = 0;
    for (let i = 0; i < merged.length; i++) {
      target.push(merged[i]);
    }
  }
}
