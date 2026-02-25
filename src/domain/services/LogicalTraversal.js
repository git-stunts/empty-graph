/**
 * LogicalTraversal - Traversal utilities for the logical WARP graph.
 *
 * **Deprecated**: delegates to GraphTraversal + AdjacencyNeighborProvider
 * internally. The public API is unchanged for backward compatibility.
 * New code should use GraphTraversal directly.
 *
 * Provides deterministic BFS/DFS/shortestPath/connectedComponent over
 * the materialized logical graph (node/edge OR-Sets), not the Git DAG.
 */

import TraversalError from '../errors/TraversalError.js';
import GraphTraversal from './GraphTraversal.js';
import AdjacencyNeighborProvider from './AdjacencyNeighborProvider.js';

const DEFAULT_MAX_DEPTH = 1000;

/**
 * Validates and normalizes an edge direction parameter.
 *
 * @param {string|undefined} direction - The direction to validate ('out', 'in', or 'both')
 * @returns {'out'|'in'|'both'} The validated direction, defaulting to 'out' if undefined
 * @throws {TraversalError} If the direction is not one of the valid values
 */
function assertDirection(direction) {
  if (direction === undefined) {
    return 'out';
  }
  if (direction === 'out' || direction === 'in' || direction === 'both') {
    return direction;
  }
  throw new TraversalError(`Invalid direction: ${direction}`, {
    code: 'INVALID_DIRECTION',
    context: { direction },
  });
}

/**
 * Normalizes a label filter into a Set for efficient lookup.
 *
 * Accepts a single label string, an array of labels, or undefined. Returns
 * a Set containing the label(s) or undefined if no filter is specified.
 *
 * @param {string|string[]|undefined} labelFilter - The label filter to normalize
 * @returns {Set<string>|undefined} A Set of labels for filtering, or undefined if no filter
 * @throws {TraversalError} If labelFilter is neither a string, array, nor undefined
 */
function normalizeLabelFilter(labelFilter) {
  if (labelFilter === undefined) {
    return undefined;
  }
  if (Array.isArray(labelFilter)) {
    return new Set(labelFilter);
  }
  if (typeof labelFilter === 'string') {
    return new Set([labelFilter]);
  }
  throw new TraversalError('labelFilter must be a string or array', {
    code: 'INVALID_LABEL_FILTER',
    context: { receivedType: typeof labelFilter },
  });
}

/**
 * Deterministic graph traversal engine for the materialized WARP graph.
 *
 * @deprecated Use GraphTraversal + AdjacencyNeighborProvider directly.
 */
export default class LogicalTraversal {
  /**
   * Creates a new LogicalTraversal.
   *
   * @param {import('../WarpGraph.js').default} graph - The WarpGraph instance to traverse
   */
  constructor(graph) {
    this._graph = graph;
  }

  /**
   * Prepares a GraphTraversal engine backed by the current adjacency.
   *
   * @private
   * @param {string} start - The starting node ID for traversal
   * @param {Object} opts - The traversal options
   * @param {'out'|'in'|'both'} [opts.dir] - Edge direction to follow
   * @param {string|string[]} [opts.labelFilter] - Edge label(s) to include
   * @param {number} [opts.maxDepth] - Maximum depth to traverse
   * @returns {Promise<{engine: GraphTraversal, direction: 'out'|'in'|'both', options: {labels?: Set<string>}|undefined, depthLimit: number}>}
   * @throws {TraversalError} If the start node is not found (NODE_NOT_FOUND)
   * @throws {TraversalError} If the direction is invalid (INVALID_DIRECTION)
   * @throws {TraversalError} If the labelFilter is invalid (INVALID_LABEL_FILTER)
   */
  async _prepare(start, { dir, labelFilter, maxDepth }) {
    // Private access: _materializeGraph is a WarpGraph internal.
    // This coupling will be removed when the LogicalTraversal facade is sunset
    // and callers migrate to GraphTraversal + NeighborProvider directly.
    const materialized = await /** @type {{ _materializeGraph: () => Promise<{adjacency: {outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>}}> }} */ (this._graph)._materializeGraph();

    if (!(await this._graph.hasNode(start))) {
      throw new TraversalError(`Start node not found: ${start}`, {
        code: 'NODE_NOT_FOUND',
        context: { start },
      });
    }

    const direction = assertDirection(dir);
    const labelSet = normalizeLabelFilter(labelFilter);
    const { adjacency } = materialized;
    const depthLimit = maxDepth ?? DEFAULT_MAX_DEPTH;

    const provider = new AdjacencyNeighborProvider({
      outgoing: adjacency.outgoing,
      incoming: adjacency.incoming,
    });
    const engine = new GraphTraversal({ provider });

    /** @type {{labels?: Set<string>}|undefined} */
    const options = labelSet ? { labels: labelSet } : undefined;

    return { engine, direction, options, depthLimit };
  }

  /**
   * Breadth-first traversal.
   *
   * @param {string} start - Starting node ID
   * @param {Object} [options] - Traversal options
   * @param {number} [options.maxDepth] - Maximum depth to traverse
   * @param {'out'|'in'|'both'} [options.dir] - Edge direction to follow
   * @param {string|string[]} [options.labelFilter] - Edge label(s) to include
   * @returns {Promise<string[]>} Node IDs in visit order
   * @throws {TraversalError} If the start node is not found or direction is invalid
   */
  async bfs(start, options = {}) {
    const { engine, direction, options: opts, depthLimit } = await this._prepare(start, options);
    const { nodes } = await engine.bfs({
      start,
      direction,
      options: opts,
      maxDepth: depthLimit,
      maxNodes: Infinity,
    });
    return await Promise.resolve(nodes);
  }

  /**
   * Depth-first traversal (pre-order).
   *
   * @param {string} start - Starting node ID
   * @param {Object} [options] - Traversal options
   * @param {number} [options.maxDepth] - Maximum depth to traverse
   * @param {'out'|'in'|'both'} [options.dir] - Edge direction to follow
   * @param {string|string[]} [options.labelFilter] - Edge label(s) to include
   * @returns {Promise<string[]>} Node IDs in visit order
   * @throws {TraversalError} If the start node is not found or direction is invalid
   */
  async dfs(start, options = {}) {
    const { engine, direction, options: opts, depthLimit } = await this._prepare(start, options);
    const { nodes } = await engine.dfs({
      start,
      direction,
      options: opts,
      maxDepth: depthLimit,
      maxNodes: Infinity,
    });
    return await Promise.resolve(nodes);
  }

  /**
   * Shortest path (unweighted) using BFS.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {Object} [options] - Traversal options
   * @param {number} [options.maxDepth] - Maximum search depth
   * @param {'out'|'in'|'both'} [options.dir] - Edge direction to follow
   * @param {string|string[]} [options.labelFilter] - Edge label(s) to include
   * @returns {Promise<{found: boolean, path: string[], length: number}>}
   *   When `found` is true, `path` contains the node IDs from `from` to `to` and
   *   `length` is the hop count. When `found` is false, `path` is empty and `length` is -1.
   * @throws {TraversalError} If the start node is not found or direction is invalid
   */
  async shortestPath(from, to, options = {}) {
    const { engine, direction, options: opts, depthLimit } = await this._prepare(from, options);
    const { found, path, length } = await engine.shortestPath({
      start: from,
      goal: to,
      direction,
      options: opts,
      maxDepth: depthLimit,
      maxNodes: Infinity,
    });
    return await Promise.resolve({ found, path, length });
  }

  /**
   * Connected component (undirected by default).
   *
   * @param {string} start - Starting node ID
   * @param {Object} [options] - Traversal options
   * @param {number} [options.maxDepth] - Maximum depth to traverse (default: 1000)
   * @param {string|string[]} [options.labelFilter] - Edge label(s) to include
   * @returns {Promise<string[]>} Node IDs in visit order
   * @throws {TraversalError} If the start node is not found
   */
  async connectedComponent(start, options = {}) {
    return await this.bfs(start, { ...options, dir: 'both' });
  }
}
