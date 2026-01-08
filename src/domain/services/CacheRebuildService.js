import BitmapIndexService from './BitmapIndexService.js';

/**
 * Service to rebuild the graph index.
 */
export default class CacheRebuildService {
  constructor({ persistence, graphService }) {
    this.persistence = persistence;
    this.graphService = graphService;
  }

  async rebuild(ref) {
    const index = new BitmapIndexService();
    
    // 1. Scan history (Streaming O(N))
    for await (const node of this.graphService.iterateNodes({ ref, limit: 1000000 })) {
      index.getId(node.sha);
      for (const parentSha of node.parents) {
        index.addEdge(parentSha, node.sha);
      }
    }

    // 2. Serialize to Blobs

    const treeStructure = index.serialize();
    const flatEntries = [];

    for (const [path, buffer] of Object.entries(treeStructure)) {
      const oid = await this.persistence.writeBlob(buffer);
      const flatName = path.replace(/\//g, '_');
      flatEntries.push(`100644 blob ${oid}\t${flatName}`);
    }

    return await this.persistence.writeTree(flatEntries);
  }

  async load(treeOid) {
    const files = await this.persistence.readTree(treeOid);
    const nestedFiles = {};
    for (const [flatPath, content] of Object.entries(files)) {
      const nestedPath = flatPath.replace('_', '/');
      nestedFiles[nestedPath] = content;
    }

    const index = new BitmapIndexService();
    index.deserialize(nestedFiles);
    return index;
  }
}