import BitmapIndexService from './BitmapIndexService.js';

/**
 * Service to rebuild the graph index.
 */
export default class CacheRebuildService {
  /**
   * @param {Object} options
   * @param {import('../../ports/GraphPersistencePort.js').default} options.persistence
   * @param {import('./GraphService.js').default} options.graphService
   */
  constructor({ persistence, graphService }) {
    this.persistence = persistence;
    this.graphService = graphService;
  }

  /**
   * Rebuilds the index for a given reference.
   * @param {string} ref
   * @returns {Promise<string>} The OID of the index tree.
   */
  async rebuild(ref) {
    const index = new BitmapIndexService();
    
    // 1. Scan history (O(N) unfortunately, but only on rebuild)
    // For a "real" rebuild, we'd want incremental, but full rebuild is easier for now.
    const nodes = await this.graphService.listNodes({ ref, limit: 100000 }); // High limit

    // 2. Populate Index
    for (const node of nodes) {
      // In a real graph, we'd parse parents and add edges.
      // GraphNode has parents.
      // But listNodes currently returns GraphNodes which have 'parents'.
      // Wait, my GraphNode parsing logic in GraphService doesn't parse parents from the message body.
      // Git log output usually puts parents in the header, not body.
      // I need to update GraphService to extract parents if I want to build an edge map.
      
      // For now, let's just index the existence of the nodes (SHA -> ID).
      index.getId(node.sha);
      
      // If we had parents:
      // for (const p of node.parents) {
      //   index.addEdge(p, node.sha);
      // }
    }

    // 3. Serialize to Blobs
    const treeStructure = index.serialize();
    const treeEntries = [];

    for (const [path, buffer] of Object.entries(treeStructure)) {
      const oid = await this.persistence.writeBlob(buffer);
      // Mode 100644 for files
      treeEntries.push(`100644 blob ${oid}\t${path}`);
    }

    // 4. Create Tree
    // Note: mktree expects flat entries or recursive trees. 
    // If paths have slashes (shards/xx.bitmap), we strictly need recursive mktree or manual tree building.
    // git mktree DOES NOT handle 'shards/xx.bitmap' directly. It expects a tree OID for 'shards'.
    
    // Simplification: Flatten the structure for this iteration or handle recursion.
    // I'll flatten it: "shards_xx.bitmap"
    
    const flatEntries = [];
    for (const [path, buffer] of Object.entries(treeStructure)) {
      const oid = await this.persistence.writeBlob(buffer);
      const flatName = path.replace(/\//g, '_');
      flatEntries.push(`100644 blob ${oid}\t${flatName}`);
    }

    return await this.persistence.writeTree(flatEntries);
  }
}
