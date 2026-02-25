/**
 * Orchestrates building, persisting, and loading a MaterializedView
 * composed of a LogicalIndex + PropertyIndexReader.
 *
 * Four entry points:
 * - `build(state)` — from a WarpStateV5 (in-memory)
 * - `persistIndexTree(tree, persistence)` — write shards to Git storage
 * - `loadFromOids(shardOids, storage)` — hydrate from blob OIDs
 * - `applyDiff(existingTree, diff, state)` — incremental update from PatchDiff
 *
 * @module domain/services/MaterializedViewService
 */

import defaultCodec from '../utils/defaultCodec.js';
import nullLogger from '../utils/nullLogger.js';
import LogicalIndexBuildService from './LogicalIndexBuildService.js';
import LogicalIndexReader from './LogicalIndexReader.js';
import PropertyIndexReader from './PropertyIndexReader.js';
import IncrementalIndexUpdater from './IncrementalIndexUpdater.js';

/**
 * @typedef {import('./BitmapNeighborProvider.js').LogicalIndex} LogicalIndex
 */

/**
 * @typedef {Object} BuildResult
 * @property {Record<string, Buffer>} tree
 * @property {LogicalIndex} logicalIndex
 * @property {PropertyIndexReader} propertyReader
 * @property {Record<string, unknown>} receipt
 */

/**
 * @typedef {Object} LoadResult
 * @property {LogicalIndex} logicalIndex
 * @property {PropertyIndexReader} propertyReader
 */

/**
 * Creates a PropertyIndexReader backed by an in-memory tree map.
 *
 * @param {Record<string, Buffer>} tree
 * @param {import('../../ports/CodecPort.js').default} codec
 * @returns {PropertyIndexReader}
 */
function buildInMemoryPropertyReader(tree, codec) {
  /** @type {Record<string, string>} */
  const propShardOids = {};
  for (const path of Object.keys(tree)) {
    if (path.startsWith('props_')) {
      propShardOids[path] = path;
    }
  }

  const storage = /** @type {{ readBlob(oid: string): Promise<Buffer> }} */ ({
    readBlob: (oid) => Promise.resolve(tree[oid]),
  });

  const reader = new PropertyIndexReader({ storage, codec });
  reader.setup(propShardOids);
  return reader;
}

/**
 * Partitions shard OID entries into index vs property buckets.
 *
 * @param {Record<string, string>} shardOids
 * @returns {{ indexOids: Record<string, string>, propOids: Record<string, string> }}
 */
function partitionShardOids(shardOids) {
  /** @type {Record<string, string>} */
  const indexOids = {};
  /** @type {Record<string, string>} */
  const propOids = {};

  for (const [path, oid] of Object.entries(shardOids)) {
    if (path.startsWith('props_')) {
      propOids[path] = oid;
    } else {
      indexOids[path] = oid;
    }
  }
  return { indexOids, propOids };
}

export default class MaterializedViewService {
  /**
   * @param {Object} [options]
   * @param {import('../../ports/CodecPort.js').default} [options.codec]
   * @param {import('../../ports/LoggerPort.js').default} [options.logger]
   */
  constructor({ codec, logger } = {}) {
    this._codec = codec || defaultCodec;
    this._logger = logger || nullLogger;
  }

  /**
   * Builds a complete MaterializedView from WarpStateV5.
   *
   * @param {import('./JoinReducer.js').WarpStateV5} state
   * @returns {BuildResult}
   */
  build(state) {
    const svc = new LogicalIndexBuildService({
      codec: this._codec,
      logger: this._logger,
    });
    const { tree, receipt } = svc.build(state);

    const logicalIndex = new LogicalIndexReader({ codec: this._codec })
      .loadFromTree(tree)
      .toLogicalIndex();

    const propertyReader = buildInMemoryPropertyReader(tree, this._codec);

    return { tree, logicalIndex, propertyReader, receipt };
  }

  /**
   * Writes each shard as a blob and creates a Git tree object.
   *
   * @param {Record<string, Buffer>} tree
   * @param {{ writeBlob(buf: Buffer): Promise<string>, writeTree(entries: string[]): Promise<string> }} persistence
   * @returns {Promise<string>} tree OID
   */
  async persistIndexTree(tree, persistence) {
    const paths = Object.keys(tree).sort();
    const oids = await Promise.all(
      paths.map((p) => persistence.writeBlob(tree[p]))
    );

    const entries = paths.map(
      (path, i) => `100644 blob ${oids[i]}\t${path}`
    );
    return await persistence.writeTree(entries);
  }

  /**
   * Hydrates a LogicalIndex + PropertyIndexReader from blob OIDs.
   *
   * @param {Record<string, string>} shardOids - path to blob OID
   * @param {{ readBlob(oid: string): Promise<Buffer> }} storage
   * @returns {Promise<LoadResult>}
   */
  async loadFromOids(shardOids, storage) {
    const { indexOids, propOids } = partitionShardOids(shardOids);

    const reader = new LogicalIndexReader({ codec: this._codec });
    await reader.loadFromOids(indexOids, storage);
    const logicalIndex = reader.toLogicalIndex();

    const propertyReader = new PropertyIndexReader({
      storage: /** @type {import('../../ports/IndexStoragePort.js').default} */ (storage),
      codec: this._codec,
    });
    propertyReader.setup(propOids);

    return { logicalIndex, propertyReader };
  }

  /**
   * Applies a PatchDiff incrementally to an existing index tree.
   *
   * @param {Object} params
   * @param {Record<string, Buffer>} params.existingTree
   * @param {import('../types/PatchDiff.js').PatchDiff} params.diff
   * @param {import('./JoinReducer.js').WarpStateV5} params.state
   * @returns {BuildResult}
   */
  applyDiff({ existingTree, diff, state }) {
    const updater = new IncrementalIndexUpdater({ codec: this._codec });
    const loadShard = (path) => existingTree[path];
    const dirtyShards = updater.computeDirtyShards({ diff, state, loadShard });
    const tree = { ...existingTree, ...dirtyShards };

    const logicalIndex = new LogicalIndexReader({ codec: this._codec })
      .loadFromTree(tree)
      .toLogicalIndex();
    const propertyReader = buildInMemoryPropertyReader(tree, this._codec);
    const receipt = tree['receipt.cbor']
      ? this._codec.decode(tree['receipt.cbor'])
      : {};

    return {
      tree,
      logicalIndex,
      propertyReader,
      receipt: /** @type {Record<string, unknown>} */ (receipt),
    };
  }
}
