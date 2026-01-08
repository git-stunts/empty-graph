import roaring from 'roaring';
const { RoaringBitmap32 } = roaring;

/**
 * Manages the high-performance sharded index for the graph.
 */
export default class BitmapIndexService {
  constructor(shardBits = 8) {
    this.shardBits = shardBits;
    this.shaToId = new Map();
    this.idToSha = [];
    this.shards = new Map();
  }

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

  addEdge(srcSha, tgtSha) {
    const srcId = this.getId(srcSha);
    const tgtId = this.getId(tgtSha);
    this._addToShard(srcSha, tgtId, 'fwd');
    this._addToShard(tgtSha, srcId, 'rev');
  }

  _addToShard(keySha, valueId, type) {
    const prefix = keySha.substring(0, 2); 
    const shardKey = `${type}/${prefix}`;
    if (!this.shards.has(shardKey)) {
      this.shards.set(shardKey, new RoaringBitmap32());
    }
    this.shards.get(shardKey).add(valueId);
  }

  serialize() {
    const tree = {};
    tree['meta/ids.json'] = Buffer.from(JSON.stringify(this.idToSha));
    for (const [key, bitmap] of this.shards) {
      tree[`shards/${key}.bitmap`] = bitmap.serialize();
    }
    return tree;
  }

  deserialize(files) {
    const decoder = new TextDecoder();
    if (files['meta/ids.json']) {
      const jsonStr = decoder.decode(files['meta/ids.json']).trim();
      this.idToSha = JSON.parse(jsonStr);
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