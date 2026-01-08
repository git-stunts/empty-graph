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
    const nodes = await this.graphService.listNodes({ ref, limit: 1000000 });

    for (const node of nodes) {
      index.getId(node.sha);
      for (const parentSha of node.parents) {
        index.addEdge(parentSha, node.sha);
      }
    }

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