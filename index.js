/**
 * @fileoverview Empty Graph - A graph database substrate using Git commits pointing to the empty tree.
 */

import GraphService from './src/domain/services/GraphService.js';
import GitGraphAdapter from './src/infrastructure/adapters/GitGraphAdapter.js';
import GraphNode from './src/domain/entities/GraphNode.js';
import BitmapIndexService from './src/domain/services/BitmapIndexService.js';
import CacheRebuildService from './src/domain/services/CacheRebuildService.js';

export {
  GraphService,
  GitGraphAdapter,
  GraphNode,
  BitmapIndexService,
  CacheRebuildService
};

/**
 * Facade class for the EmptyGraph library.
 */
export default class EmptyGraph {
  /**
   * @param {Object} options
   * @param {import('../plumbing/index.js').default} options.plumbing
   */
  constructor({ plumbing }) {
    const persistence = new GitGraphAdapter({ plumbing });
    this.service = new GraphService({ persistence });
    this.rebuildService = new CacheRebuildService({ persistence, graphService: this.service });
  }

  async createNode(options) {
    return this.service.createNode(options);
  }

  async readNode({ sha }) {
    return this.service.readNode(sha);
  }

  async listNodes(options) {
    return this.service.listNodes(options);
  }

  async rebuildIndex(ref) {
    return this.rebuildService.rebuild(ref);
  }
}