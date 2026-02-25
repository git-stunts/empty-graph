/**
 * Stateless service that computes dirty shard buffers from a PatchDiff.
 *
 * Given a diff of alive-ness transitions + a shard loader for the existing
 * index tree, produces only the shard buffers that changed. The caller
 * merges them back into the tree via `{ ...existingTree, ...dirtyShards }`.
 *
 * @module domain/services/IncrementalIndexUpdater
 */

import defaultCodec from '../utils/defaultCodec.js';
import computeShardKey from '../utils/shardKey.js';
import { getRoaringBitmap32 } from '../utils/roaring.js';
import { orsetContains, orsetElements } from '../crdt/ORSet.js';
import { decodeEdgeKey } from './KeyCodec.js';
import { ShardIdOverflowError } from '../errors/index.js';

/** Maximum local IDs per shard byte (2^24). */
const MAX_LOCAL_ID = 1 << 24;

/**
 * @typedef {Object} MetaShard
 * @property {Array<[string, number]>} nodeToGlobal
 * @property {number} nextLocalId
 * @property {import('../utils/roaring.js').RoaringBitmapSubset} aliveBitmap
 * @property {Map<number, string>} globalToNode - Reverse lookup: globalId → nodeId (O(1))
 * @property {Map<string, number>} nodeToGlobalMap - Forward lookup: nodeId → globalId (O(1))
 */

/**
 * @typedef {Record<string, Record<string, Uint8Array>>} EdgeShardData
 * Keyed by bucket ("all" or labelId string), then by globalId string → serialised bitmap.
 */

export default class IncrementalIndexUpdater {
  /**
   * @param {Object} [options]
   * @param {import('../../ports/CodecPort.js').default} [options.codec]
   */
  constructor({ codec } = {}) {
    this._codec = codec || defaultCodec;
  }

  /**
   * Computes only the dirty shards from a PatchDiff.
   *
   * @param {Object} params
   * @param {import('../types/PatchDiff.js').PatchDiff} params.diff
   * @param {import('./JoinReducer.js').WarpStateV5} params.state
   * @param {(path: string) => Uint8Array|undefined} params.loadShard
   * @returns {Record<string, Uint8Array>} dirty shard buffers (path -> Uint8Array)
   */
  computeDirtyShards({ diff, state, loadShard }) {
    const dirtyKeys = this._collectDirtyShardKeys(diff);
    if (dirtyKeys.size === 0) {
      return {};
    }

    /** @type {Map<string, MetaShard>} */
    const metaCache = new Map();
    /** @type {Record<string, Uint8Array>} */
    const out = {};

    const labels = this._loadLabels(loadShard);
    let labelsDirty = false;

    for (const nodeId of diff.nodesAdded) {
      this._handleNodeAdd(nodeId, metaCache, loadShard);
    }
    for (const nodeId of diff.nodesRemoved) {
      this._handleNodeRemove(nodeId, metaCache, loadShard);
    }

    /** @type {Map<string, EdgeShardData>} */
    const fwdCache = new Map();
    /** @type {Map<string, EdgeShardData>} */
    const revCache = new Map();

    // Purge edge bitmaps for removed nodes (dangling edge elimination).
    // An edge whose endpoint is dead must not appear in the index, even
    // if the edge itself is still alive in the ORSet.
    for (const nodeId of diff.nodesRemoved) {
      this._purgeNodeEdges(nodeId, metaCache, fwdCache, revCache, labels, loadShard);
    }

    // Filter edgesAdded by endpoint alive-ness (matches edgeVisibleV5).
    for (const edge of diff.edgesAdded) {
      if (!orsetContains(state.nodeAlive, edge.from) || !orsetContains(state.nodeAlive, edge.to)) {
        continue;
      }
      labelsDirty = this._ensureLabel(edge.label, labels) || labelsDirty;
      this._handleEdgeAdd(edge, labels, metaCache, fwdCache, revCache, loadShard);
    }
    for (const edge of diff.edgesRemoved) {
      this._handleEdgeRemove(edge, labels, metaCache, fwdCache, revCache, loadShard);
    }

    // Restore edges for re-added nodes. When a node transitions
    // not-alive -> alive, edges touching it that are alive in the ORSet
    // become visible again. The diff only tracks explicit EdgeAdd ops,
    // not these implicit visibility transitions.
    //
    // Known O(E) worst-case: scans all alive edges. For genuinely new nodes
    // (not re-adds), this scan is unnecessary since they can't have pre-existing
    // edges. _findGlobalId returns undefined for new nodes, so this could be
    // short-circuited — deferred for a future optimization pass.
    if (diff.nodesAdded.length > 0) {
      const addedSet = new Set(diff.nodesAdded);
      const diffEdgeSet = new Set(
        diff.edgesAdded.map((e) => `${e.from}\0${e.to}\0${e.label}`),
      );
      for (const edgeKey of orsetElements(state.edgeAlive)) {
        const { from, to, label } = decodeEdgeKey(edgeKey);
        if (!addedSet.has(from) && !addedSet.has(to)) {
          continue;
        }
        if (!orsetContains(state.nodeAlive, from) || !orsetContains(state.nodeAlive, to)) {
          continue;
        }
        const diffKey = `${from}\0${to}\0${label}`;
        if (diffEdgeSet.has(diffKey)) {
          continue;
        }
        labelsDirty = this._ensureLabel(label, labels) || labelsDirty;
        this._handleEdgeAdd({ from, to, label }, labels, metaCache, fwdCache, revCache, loadShard);
      }
    }

    this._flushMeta(metaCache, out);
    this._flushEdgeShards(fwdCache, 'fwd', out);
    this._flushEdgeShards(revCache, 'rev', out);

    if (labelsDirty) {
      out['labels.cbor'] = this._saveLabels(labels);
    }

    this._handleProps(diff.propsChanged, loadShard, out);

    return out;
  }

  // ── Dirty shard key collection ────────────────────────────────────────────

  /**
   * Collects all shard keys touched by the diff.
   *
   * @param {import('../types/PatchDiff.js').PatchDiff} diff
   * @returns {Set<string>}
   * @private
   */
  _collectDirtyShardKeys(diff) {
    const keys = new Set();
    for (const nid of diff.nodesAdded) {
      keys.add(computeShardKey(nid));
    }
    for (const nid of diff.nodesRemoved) {
      keys.add(computeShardKey(nid));
    }
    for (const e of diff.edgesAdded) {
      keys.add(computeShardKey(e.from));
      keys.add(computeShardKey(e.to));
    }
    for (const e of diff.edgesRemoved) {
      keys.add(computeShardKey(e.from));
      keys.add(computeShardKey(e.to));
    }
    for (const p of diff.propsChanged) {
      keys.add(computeShardKey(p.nodeId));
    }
    return keys;
  }

  // ── Node operations ───────────────────────────────────────────────────────

  /**
   * Handles a NodeAdd: allocate or reactivate globalId, set alive bit.
   *
   * @param {string} nodeId
   * @param {Map<string, MetaShard>} metaCache
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @private
   */
  _handleNodeAdd(nodeId, metaCache, loadShard) {
    const meta = this._getOrLoadMeta(computeShardKey(nodeId), metaCache, loadShard);
    const existing = this._findGlobalId(meta, nodeId);
    if (existing !== undefined) {
      meta.aliveBitmap.add(existing);
      return;
    }
    if (meta.nextLocalId >= MAX_LOCAL_ID) {
      const sk = computeShardKey(nodeId);
      throw new ShardIdOverflowError(
        `Shard ${sk} exceeded 2^24 local IDs`,
        { shardKey: sk, nextLocalId: meta.nextLocalId },
      );
    }
    const shardByte = parseInt(computeShardKey(nodeId), 16);
    const globalId = ((shardByte << 24) | meta.nextLocalId) >>> 0;
    meta.nextLocalId++;
    meta.nodeToGlobal.push([nodeId, globalId]);
    meta.globalToNode.set(globalId, nodeId);
    meta.nodeToGlobalMap.set(nodeId, globalId);
    meta.aliveBitmap.add(globalId);
  }

  /**
   * Handles a NodeRemove: clear alive bit but keep globalId stable.
   *
   * @param {string} nodeId
   * @param {Map<string, MetaShard>} metaCache
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @private
   */
  _handleNodeRemove(nodeId, metaCache, loadShard) {
    const meta = this._getOrLoadMeta(computeShardKey(nodeId), metaCache, loadShard);
    const gid = this._findGlobalId(meta, nodeId);
    if (gid !== undefined) {
      meta.aliveBitmap.remove(gid);
    }
  }

  /**
   * Purges all edge bitmap entries that reference a removed node.
   *
   * When a node is removed, edges that touch it become invisible (even if the
   * edge itself is still alive in the ORSet). The full rebuild skips these via
   * edgeVisibleV5; the incremental path must explicitly purge them.
   *
   * Scans the alive edges in the ORSet for any that reference the dead node,
   * then removes those entries from the forward and reverse edge bitmaps.
   *
   * @param {string} deadNodeId
   * @param {Map<string, MetaShard>} metaCache
   * @param {Map<string, EdgeShardData>} fwdCache
   * @param {Map<string, EdgeShardData>} revCache
   * @param {Record<string, number>} labels
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @private
   */
  _purgeNodeEdges(deadNodeId, metaCache, fwdCache, revCache, labels, loadShard) {
    const deadMeta = this._getOrLoadMeta(computeShardKey(deadNodeId), metaCache, loadShard);
    const deadGid = this._findGlobalId(deadMeta, deadNodeId);
    if (deadGid === undefined) {
      return;
    }

    // Purge the dead node's own fwd/rev shard entries by zeroing out its
    // bitmap rows and clearing its globalId from peer bitmaps.
    const shardKey = computeShardKey(deadNodeId);
    const RoaringBitmap32 = getRoaringBitmap32();

    // Clear the dead node's own outgoing edges (forward shard)
    const fwdData = this._getOrLoadEdgeShard(fwdCache, 'fwd', shardKey, loadShard);
    for (const bucket of Object.keys(fwdData)) {
      const gidStr = String(deadGid);
      if (fwdData[bucket] && fwdData[bucket][gidStr]) {
        // Before clearing, find the targets so we can clean reverse bitmaps
        const targets = RoaringBitmap32.deserialize(
          fwdData[bucket][gidStr].slice(),
          true,
        ).toArray();

        // Clear this node's outgoing bitmap
        const empty = new RoaringBitmap32();
        fwdData[bucket][gidStr] = empty.serialize(true);

        // Remove deadGid from each target's reverse bitmap
        for (const targetGid of targets) {
          const targetNodeId = this._findNodeIdByGlobal(targetGid, metaCache, loadShard);
          if (targetNodeId) {
            const targetShard = computeShardKey(targetNodeId);
            const revData = this._getOrLoadEdgeShard(revCache, 'rev', targetShard, loadShard);
            const targetGidStr = String(targetGid);
            if (revData[bucket] && revData[bucket][targetGidStr]) {
              const bm = RoaringBitmap32.deserialize(
                revData[bucket][targetGidStr].slice(),
                true,
              );
              bm.remove(deadGid);
              revData[bucket][targetGidStr] = bm.serialize(true);
            }
          }
        }
      }
    }

    // Clear the dead node's own incoming edges (reverse shard)
    const revData = this._getOrLoadEdgeShard(revCache, 'rev', shardKey, loadShard);
    for (const bucket of Object.keys(revData)) {
      const gidStr = String(deadGid);
      if (revData[bucket] && revData[bucket][gidStr]) {
        const sources = RoaringBitmap32.deserialize(
          revData[bucket][gidStr].slice(),
          true,
        ).toArray();

        const empty = new RoaringBitmap32();
        revData[bucket][gidStr] = empty.serialize(true);

        // Remove deadGid from each source's forward bitmap
        for (const sourceGid of sources) {
          const sourceNodeId = this._findNodeIdByGlobal(sourceGid, metaCache, loadShard);
          if (sourceNodeId) {
            const sourceShard = computeShardKey(sourceNodeId);
            const fwdDataPeer = this._getOrLoadEdgeShard(fwdCache, 'fwd', sourceShard, loadShard);
            const sourceGidStr = String(sourceGid);
            if (fwdDataPeer[bucket] && fwdDataPeer[bucket][sourceGidStr]) {
              const bm = RoaringBitmap32.deserialize(
                fwdDataPeer[bucket][sourceGidStr].slice(),
                true,
              );
              bm.remove(deadGid);
              fwdDataPeer[bucket][sourceGidStr] = bm.serialize(true);
            }
          }
        }
      }
    }
  }

  /**
   * Reverse-looks up a nodeId from a globalId using the pre-built reverse map.
   *
   * @param {number} globalId
   * @param {Map<string, MetaShard>} metaCache
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @returns {string|undefined}
   * @private
   */
  _findNodeIdByGlobal(globalId, metaCache, loadShard) {
    // The shard key is encoded in the upper byte of the globalId
    const shardByte = (globalId >>> 24) & 0xff;
    const shardKey = shardByte.toString(16).padStart(2, '0');
    const meta = this._getOrLoadMeta(shardKey, metaCache, loadShard);
    return meta.globalToNode.get(globalId);
  }

  // ── Label operations ──────────────────────────────────────────────────────

  /**
   * Ensures a label exists in the registry; returns true if newly added.
   *
   * @param {string} label
   * @param {Record<string, number>} labels
   * @returns {boolean}
   * @private
   */
  _ensureLabel(label, labels) {
    if (Object.prototype.hasOwnProperty.call(labels, label)) {
      return false;
    }
    let maxId = -1;
    for (const id of Object.values(labels)) {
      if (id > maxId) {
        maxId = id;
      }
    }
    labels[label] = maxId + 1;
    return true;
  }

  // ── Edge operations ───────────────────────────────────────────────────────

  /**
   * @param {{from: string, to: string, label: string}} edge
   * @param {Record<string, number>} labels
   * @param {Map<string, MetaShard>} metaCache
   * @param {Map<string, EdgeShardData>} fwdCache
   * @param {Map<string, EdgeShardData>} revCache
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @private
   */
  _handleEdgeAdd(edge, labels, metaCache, fwdCache, revCache, loadShard) {
    const fromMeta = this._getOrLoadMeta(computeShardKey(edge.from), metaCache, loadShard);
    const toMeta = this._getOrLoadMeta(computeShardKey(edge.to), metaCache, loadShard);
    const fromGid = this._findGlobalId(fromMeta, edge.from);
    const toGid = this._findGlobalId(toMeta, edge.to);
    if (fromGid === undefined || toGid === undefined) {
      return;
    }

    const labelId = String(labels[edge.label]);
    const fromShard = computeShardKey(edge.from);
    const toShard = computeShardKey(edge.to);

    this._addToEdgeBitmap(fwdCache, { shardKey: fromShard, bucket: 'all', owner: fromGid, target: toGid, dir: 'fwd' }, loadShard);
    this._addToEdgeBitmap(fwdCache, { shardKey: fromShard, bucket: labelId, owner: fromGid, target: toGid, dir: 'fwd' }, loadShard);
    this._addToEdgeBitmap(revCache, { shardKey: toShard, bucket: 'all', owner: toGid, target: fromGid, dir: 'rev' }, loadShard);
    this._addToEdgeBitmap(revCache, { shardKey: toShard, bucket: labelId, owner: toGid, target: fromGid, dir: 'rev' }, loadShard);
  }

  /**
   * @param {{from: string, to: string, label: string}} edge
   * @param {Record<string, number>} labels
   * @param {Map<string, MetaShard>} metaCache
   * @param {Map<string, EdgeShardData>} fwdCache
   * @param {Map<string, EdgeShardData>} revCache
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @private
   */
  _handleEdgeRemove(edge, labels, metaCache, fwdCache, revCache, loadShard) {
    const fromMeta = this._getOrLoadMeta(computeShardKey(edge.from), metaCache, loadShard);
    const toMeta = this._getOrLoadMeta(computeShardKey(edge.to), metaCache, loadShard);
    const fromGid = this._findGlobalId(fromMeta, edge.from);
    const toGid = this._findGlobalId(toMeta, edge.to);
    if (fromGid === undefined || toGid === undefined) {
      return;
    }

    if (labels[edge.label] === undefined) {
      return;
    }

    const labelId = String(labels[edge.label]);
    const fromShard = computeShardKey(edge.from);
    const toShard = computeShardKey(edge.to);

    this._removeFromEdgeBitmap(fwdCache, { shardKey: fromShard, bucket: labelId, owner: fromGid, target: toGid, dir: 'fwd' }, loadShard);
    this._removeFromEdgeBitmap(revCache, { shardKey: toShard, bucket: labelId, owner: toGid, target: fromGid, dir: 'rev' }, loadShard);

    this._recomputeAllBucket(fwdCache, fromShard, fromGid, labels, loadShard, 'fwd');
    this._recomputeAllBucket(revCache, toShard, toGid, labels, loadShard, 'rev');
  }

  // ── Edge bitmap helpers ───────────────────────────────────────────────────

  /**
   * @param {Map<string, EdgeShardData>} cache
   * @param {{ shardKey: string, bucket: string, owner: number, target: number, dir: string }} opts
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @private
   */
  _addToEdgeBitmap(cache, opts, loadShard) {
    const { shardKey, bucket, owner, target, dir } = opts;
    const data = this._getOrLoadEdgeShard(cache, dir, shardKey, loadShard);
    const bm = this._deserializeBitmap(data, bucket, String(owner));
    bm.add(target);
    if (!data[bucket]) { data[bucket] = {}; }
    data[bucket][String(owner)] = bm.serialize(true);
  }

  /**
   * @param {Map<string, EdgeShardData>} cache
   * @param {{ shardKey: string, bucket: string, owner: number, target: number, dir: string }} opts
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @private
   */
  _removeFromEdgeBitmap(cache, opts, loadShard) {
    const { shardKey, bucket, owner, target, dir } = opts;
    const data = this._getOrLoadEdgeShard(cache, dir, shardKey, loadShard);
    const bm = this._deserializeBitmap(data, bucket, String(owner));
    bm.remove(target);
    if (!data[bucket]) { data[bucket] = {}; }
    data[bucket][String(owner)] = bm.serialize(true);
  }

  /**
   * Recomputes the 'all' bucket for a given owner by OR-ing all per-label bitmaps.
   *
   * @param {Map<string, EdgeShardData>} cache
   * @param {string} shardKey
   * @param {number} owner
   * @param {Record<string, number>} labels
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @param {string} dir
   * @private
   */
  _recomputeAllBucket(cache, shardKey, owner, labels, loadShard, dir) {
    const data = this._getOrLoadEdgeShard(cache, dir, shardKey, loadShard);
    const RoaringBitmap32 = getRoaringBitmap32();
    const merged = new RoaringBitmap32();
    const ownerStr = String(owner);

    for (const labelId of Object.values(labels)) {
      const bucket = String(labelId);
      if (data[bucket] && data[bucket][ownerStr]) {
        const bm = RoaringBitmap32.deserialize(
          data[bucket][ownerStr].slice(),
          true,
        );
        merged.orInPlace(bm);
      }
    }

    if (!data.all) { data.all = {}; }
    data.all[ownerStr] = merged.serialize(true);
  }

  // ── Property operations ───────────────────────────────────────────────────

  /**
   * Handles PropSet entries and flushes dirty props shards.
   *
   * @param {import('../types/PatchDiff.js').PropDiffEntry[]} propsChanged
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @param {Record<string, Uint8Array>} out
   * @private
   */
  _handleProps(propsChanged, loadShard, out) {
    if (propsChanged.length === 0) {
      return;
    }

    /** @type {Map<string, Map<string, Record<string, unknown>>>} */
    const shardMap = new Map();

    for (const prop of propsChanged) {
      const shardKey = computeShardKey(prop.nodeId);
      if (!shardMap.has(shardKey)) {
        shardMap.set(shardKey, this._loadProps(shardKey, loadShard));
      }
      const shard = /** @type {Map<string, Record<string, unknown>>} */ (shardMap.get(shardKey));
      let nodeProps = shard.get(prop.nodeId);
      if (!nodeProps) {
        nodeProps = Object.create(null);
        shard.set(prop.nodeId, /** @type {Record<string, unknown>} */ (nodeProps));
      }
      /** @type {Record<string, unknown>} */ (nodeProps)[prop.key] = prop.value;
    }

    for (const [shardKey, shard] of shardMap) {
      out[`props_${shardKey}.cbor`] = this._saveProps(shard);
    }
  }

  // ── Meta shard I/O ────────────────────────────────────────────────────────

  /**
   * @param {string} shardKey
   * @param {Map<string, MetaShard>} cache
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @returns {MetaShard}
   * @private
   */
  _getOrLoadMeta(shardKey, cache, loadShard) {
    const cached = cache.get(shardKey);
    if (cached) {
      return cached;
    }
    const meta = this._loadMeta(shardKey, loadShard);
    cache.set(shardKey, meta);
    return meta;
  }

  /**
   * @param {string} shardKey
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @returns {MetaShard}
   * @private
   */
  _loadMeta(shardKey, loadShard) {
    const RoaringBitmap32 = getRoaringBitmap32();
    const buf = loadShard(`meta_${shardKey}.cbor`);
    if (!buf) {
      return {
        nodeToGlobal: [],
        nextLocalId: 0,
        aliveBitmap: new RoaringBitmap32(),
        globalToNode: new Map(),
        nodeToGlobalMap: new Map(),
      };
    }
    const raw = /** @type {{ nodeToGlobal: Array<[string, number]> | Record<string, number>, alive: Uint8Array | number[], nextLocalId: number }} */ (this._codec.decode(buf));
    const entries = Array.isArray(raw.nodeToGlobal)
      ? raw.nodeToGlobal
      : Object.entries(raw.nodeToGlobal);
    const alive = raw.alive && raw.alive.length > 0
      ? RoaringBitmap32.deserialize(Uint8Array.from(raw.alive), true)
      : new RoaringBitmap32();

    // Build O(1) lookup maps from the entries array
    /** @type {Map<number, string>} */
    const globalToNode = new Map();
    /** @type {Map<string, number>} */
    const nodeToGlobalMap = new Map();
    for (const [nodeId, gid] of entries) {
      globalToNode.set(Number(gid), nodeId);
      nodeToGlobalMap.set(nodeId, Number(gid));
    }

    return { nodeToGlobal: entries, nextLocalId: raw.nextLocalId, aliveBitmap: alive, globalToNode, nodeToGlobalMap };
  }

  /**
   * Serialises and flushes all dirty meta shards into `out`.
   *
   * @param {Map<string, MetaShard>} metaCache
   * @param {Record<string, Uint8Array>} out
   * @private
   */
  _flushMeta(metaCache, out) {
    for (const [shardKey, meta] of metaCache) {
      const shard = {
        nodeToGlobal: meta.nodeToGlobal,
        nextLocalId: meta.nextLocalId,
        alive: meta.aliveBitmap.serialize(true),
      };
      out[`meta_${shardKey}.cbor`] = this._codec.encode(shard).slice();
    }
  }

  // ── Edge shard I/O ────────────────────────────────────────────────────────

  /**
   * @param {Map<string, EdgeShardData>} cache
   * @param {string} dir
   * @param {string} shardKey
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @returns {EdgeShardData}
   * @private
   */
  _getOrLoadEdgeShard(cache, dir, shardKey, loadShard) {
    const cacheKey = `${dir}_${shardKey}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const data = this._loadEdgeShard(dir, shardKey, loadShard);
    cache.set(cacheKey, data);
    return data;
  }

  /**
   * @param {string} dir
   * @param {string} shardKey
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @returns {EdgeShardData}
   * @private
   */
  _loadEdgeShard(dir, shardKey, loadShard) {
    const buf = loadShard(`${dir}_${shardKey}.cbor`);
    if (!buf) {
      return {};
    }
    return /** @type {EdgeShardData} */ (this._codec.decode(buf));
  }

  /**
   * Flushes all dirty edge shards for a direction into `out`.
   *
   * @param {Map<string, EdgeShardData>} cache
   * @param {string} dir
   * @param {Record<string, Uint8Array>} out
   * @private
   */
  _flushEdgeShards(cache, dir, out) {
    const prefix = `${dir}_`;
    for (const [cacheKey, data] of cache) {
      if (!cacheKey.startsWith(prefix)) {
        continue;
      }
      const path = `${cacheKey}.cbor`;
      out[path] = this._codec.encode(data).slice();
    }
  }

  // ── Labels I/O ────────────────────────────────────────────────────────────

  /**
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @returns {Record<string, number>}
   * @private
   */
  _loadLabels(loadShard) {
    const buf = loadShard('labels.cbor');
    if (!buf) {
      return Object.create(null);
    }
    return /** @type {Record<string, number>} */ (Object.assign(Object.create(null), this._codec.decode(buf)));
  }

  /**
   * @param {Record<string, number>} labels
   * @returns {Uint8Array}
   * @private
   */
  _saveLabels(labels) {
    return this._codec.encode(labels).slice();
  }

  // ── Props I/O ─────────────────────────────────────────────────────────────

  /**
   * @param {string} shardKey
   * @param {(path: string) => Uint8Array|undefined} loadShard
   * @returns {Map<string, Record<string, unknown>>}
   * @private
   */
  _loadProps(shardKey, loadShard) {
    const buf = loadShard(`props_${shardKey}.cbor`);
    /** @type {Map<string, Record<string, unknown>>} */
    const map = new Map();
    if (!buf) {
      return map;
    }
    const decoded = this._codec.decode(buf);
    if (Array.isArray(decoded)) {
      for (const [nodeId, props] of decoded) {
        map.set(nodeId, props);
      }
    }
    return map;
  }

  /**
   * @param {Map<string, Record<string, unknown>>} shard
   * @returns {Uint8Array}
   * @private
   */
  _saveProps(shard) {
    const entries = [...shard.entries()];
    return this._codec.encode(entries).slice();
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  /**
   * Finds the globalId for a nodeId in a MetaShard via the O(1) forward map.
   *
   * @param {MetaShard} meta
   * @param {string} nodeId
   * @returns {number|undefined}
   * @private
   */
  _findGlobalId(meta, nodeId) {
    return meta.nodeToGlobalMap.get(nodeId);
  }

  /**
   * Deserializes a bitmap from edge shard data, or creates a new one.
   *
   * @param {EdgeShardData} data
   * @param {string} bucket
   * @param {string} ownerStr
   * @returns {import('../utils/roaring.js').RoaringBitmapSubset}
   * @private
   */
  _deserializeBitmap(data, bucket, ownerStr) {
    const RoaringBitmap32 = getRoaringBitmap32();
    if (data[bucket] && data[bucket][ownerStr]) {
      return RoaringBitmap32.deserialize(
        data[bucket][ownerStr].slice(),
        true,
      );
    }
    return new RoaringBitmap32();
  }
}
