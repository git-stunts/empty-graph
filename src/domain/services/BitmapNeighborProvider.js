/**
 * NeighborProvider backed by BitmapIndexReader for the commit DAG.
 *
 * Wraps the existing BitmapIndexReader (parent/child relationships via
 * Roaring bitmaps) to satisfy the NeighborProviderPort interface.
 *
 * Commit DAG edges use label = '' (empty string sentinel). If the caller
 * passes options.labels with non-empty strings, returns [] (no match).
 * This proves the interface works uniformly for both graph types.
 *
 * @module domain/services/BitmapNeighborProvider
 */

import NeighborProviderPort from '../../ports/NeighborProviderPort.js';

/** @typedef {import('./BitmapIndexReader.js').default} BitmapIndexReader */

/**
 * Sorts edges by (neighborId, label) using strict codepoint comparison.
 *
 * @param {Array<{neighborId: string, label: string}>} edges
 * @returns {Array<{neighborId: string, label: string}>}
 */
function sortEdges(edges) {
  return edges.sort((a, b) => {
    if (a.neighborId < b.neighborId) { return -1; }
    if (a.neighborId > b.neighborId) { return 1; }
    if (a.label < b.label) { return -1; }
    if (a.label > b.label) { return 1; }
    return 0;
  });
}

/**
 * Deduplicates a sorted edge list by (neighborId, label).
 *
 * @param {Array<{neighborId: string, label: string}>} edges
 * @returns {Array<{neighborId: string, label: string}>}
 */
function dedupSorted(edges) {
  if (edges.length <= 1) { return edges; }
  const result = [edges[0]];
  for (let i = 1; i < edges.length; i++) {
    const prev = result[result.length - 1];
    if (edges[i].neighborId !== prev.neighborId || edges[i].label !== prev.label) {
      result.push(edges[i]);
    }
  }
  return result;
}

export default class BitmapNeighborProvider extends NeighborProviderPort {
  /**
   * @param {Object} params
   * @param {BitmapIndexReader} params.indexReader
   */
  constructor({ indexReader }) {
    super();
    this._reader = indexReader;
  }

  /**
   * @param {string} nodeId
   * @param {import('../../ports/NeighborProviderPort.js').Direction} direction
   * @param {import('../../ports/NeighborProviderPort.js').NeighborOptions} [options]
   * @returns {Promise<import('../../ports/NeighborProviderPort.js').NeighborEdge[]>}
   */
  async getNeighbors(nodeId, direction, options) {
    // Commit DAG edges have label=''. If caller asks for specific non-empty labels, no match.
    if (options?.labels) {
      const hasEmpty = options.labels.has('');
      if (!hasEmpty) {
        return [];
      }
    }

    if (direction === 'out') {
      const children = await this._reader.getChildren(nodeId);
      return sortEdges(children.map((id) => ({ neighborId: id, label: '' })));
    }

    if (direction === 'in') {
      const parents = await this._reader.getParents(nodeId);
      return sortEdges(parents.map((id) => ({ neighborId: id, label: '' })));
    }

    // 'both': union(out, in) deduped by (neighborId, label)
    const [children, parents] = await Promise.all([
      this._reader.getChildren(nodeId),
      this._reader.getParents(nodeId),
    ]);
    const all = children.map((id) => ({ neighborId: id, label: '' }))
      .concat(parents.map((id) => ({ neighborId: id, label: '' })));
    return dedupSorted(sortEdges(all));
  }

  /**
   * @param {string} nodeId
   * @returns {Promise<boolean>}
   */
  async hasNode(nodeId) {
    const id = await this._reader.lookupId(nodeId);
    return id !== undefined;
  }

  /** @returns {'async-local'} */
  get latencyClass() {
    return 'async-local';
  }
}
