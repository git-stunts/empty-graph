import { RoaringBitmap32 } from 'roaring';

/**
 * Manages the high-performance sharded index for the graph.
 * 
 * Architecture:
 * - Sharded by OID prefix (e.g. first 2 hex chars).
 * - Each shard contains a bitmap of IDs.
 * - ID <-> SHA mapping is also sharded or global.
 * 
 * For simplicity in this iteration:
 * - Global ID <-> SHA mapping (stored as one blob).
 * - Sharded Edge Maps (Forward/Reverse).
 */
export default class BitmapIndexService {
  constructor(shardBits = 8) {
    this.shardBits = shardBits;
    this.shaToId = new Map();
    this.idToSha = [];
    // Map<shardKey, RoaringBitmap32>
    this.shards = new Map();
  }

  /**
   * Registers a SHA in the index, assigning it an ID if new.
   * @param {string} sha
   * @returns {number} The numeric ID.
   */
  getId(sha) {
    if (this.shaToId.has(sha)) {
      return this.shaToId.get(sha);
    }
    const id = this.idToSha.length;
    this.idToSha.push(sha);
    this.shaToId.set(sha, id);
    return id;
  }

  getSha(id) {
    return this.idToSha[id];
  }

  /**
   * Adds an edge to the index.
   * @param {string} srcSha
   * @param {string} tgtSha
   */
  addEdge(srcSha, tgtSha) {
    const srcId = this.getId(srcSha);
    const tgtId = this.getId(tgtSha);
    
    // Forward index: src -> [tgt]
    this._addToShard(srcSha, tgtId, 'fwd');
    
    // Reverse index: tgt -> [src]
    this._addToShard(tgtSha, srcId, 'rev');
  }

  _addToShard(keySha, valueId, type) {
    // Shard key: prefix of SHA
    // In git-mind, hashing is used. Here, simple prefix is fine for distribution.
    const prefix = keySha.substring(0, 2); 
    const shardKey = `${type}/${prefix}`;
    
    if (!this.shards.has(shardKey)) {
      this.shards.set(shardKey, new RoaringBitmap32());
    }
    this.shards.get(shardKey).add(valueId);
  }

  /**
   * Serializes the index into blobs and returns a tree structure definition.
   * @returns {Object} Tree structure { 'path': Buffer }
   */
  serialize() {
    const tree = {};
    
    // Store ID mapping
    const mapData = JSON.stringify(this.idToSha);
    tree['meta/ids.json'] = Buffer.from(mapData);

    // Store shards
    for (const [key, bitmap] of this.shards) {
      tree[`shards/${key}.bitmap`] = bitmap.serialize();
    }

    return tree;
  }

  /**
   * Deserializes from a map of buffers (mocking the tree load).
   * In production, this would load on demand.
   */
  deserialize(files) {
    if (files['meta/ids.json']) {
      this.idToSha = JSON.parse(files['meta/ids.json'].toString());
      this.shaToId = new Map(this.idToSha.map((sha, i) => [sha, i]));
    }

    for (const [path, buffer] of Object.entries(files)) {
      if (path.startsWith('shards/') && path.endsWith('.bitmap')) {
        const key = path.replace('shards/', '').replace('.bitmap', '');
        this.shards.set(key, RoaringBitmap32.deserialize(buffer));
      }
    }
  }
}
