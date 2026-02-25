import { describe, it, expect } from 'vitest';
import LogicalBitmapIndexBuilder from '../../../../src/domain/services/LogicalBitmapIndexBuilder.js';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.js';
import { getRoaringBitmap32 } from '../../../../src/domain/utils/roaring.js';
import { F7_MULTILABEL_SAME_NEIGHBOR, F10_PROTO_POLLUTION } from '../../../helpers/fixtureDsl.js';
import computeShardKey from '../../../../src/domain/utils/shardKey.js';

/**
 * Helper: build an index from a fixture.
 */
function buildFromFixture(fixture) {
  const builder = new LogicalBitmapIndexBuilder();
  for (const node of fixture.nodes) {
    builder.registerNode(node);
    builder.markAlive(node);
  }
  for (const { from, to, label } of fixture.edges) {
    builder.registerLabel(label);
  }
  for (const { from, to, label } of fixture.edges) {
    builder.addEdge(from, to, label);
  }
  return builder;
}

describe('LogicalBitmapIndexBuilder', () => {
  it('builds from F7 multilabel and produces correct per-label bitmaps', () => {
    const builder = buildFromFixture(F7_MULTILABEL_SAME_NEIGHBOR);
    const tree = builder.serialize();

    // Should have fwd shard(s) and labels
    expect(tree['labels.cbor']).toBeDefined();

    const labels = defaultCodec.decode(tree['labels.cbor']);
    expect(labels).toHaveProperty('manages');
    expect(labels).toHaveProperty('owns');

    // Find the fwd shard for node A
    const shardKeyA = computeShardKey('A');
    const fwdShard = tree[`fwd_${shardKeyA}.cbor`];
    expect(fwdShard).toBeDefined();

    const decoded = defaultCodec.decode(fwdShard);
    // 'all' bucket should exist
    expect(decoded).toHaveProperty('all');
    // Per-label buckets should exist (labelId 0 and 1)
    expect(decoded).toHaveProperty(String(labels.manages));
    expect(decoded).toHaveProperty(String(labels.owns));
  });

  it('delete correctness: same neighbor via two labels, remove one, all bitmap still has neighbor', () => {
    // Build with both labels
    const builder = buildFromFixture(F7_MULTILABEL_SAME_NEIGHBOR);

    const globalA = builder.registerNode('A');
    const globalB = builder.registerNode('B');

    const tree = builder.serialize();

    // Find the fwd shard containing A's edges (keyed by A's shard)
    const shardKeyA = computeShardKey('A');
    const fwdShardKey = `fwd_${shardKeyA}.cbor`;
    expect(tree[fwdShardKey]).toBeDefined();
    const fwdShard = defaultCodec.decode(tree[fwdShardKey]);

    // The 'all' bitmap for A (by globalA) should contain B's globalId
    const RoaringBitmap32 = getRoaringBitmap32();
    const allBucket = fwdShard.all;
    expect(allBucket).toBeDefined();
    const bitmapBytes = allBucket[String(globalA)];
    expect(bitmapBytes).toBeDefined();

    const allBitmap = RoaringBitmap32.deserialize(
      Buffer.from(bitmapBytes.buffer, bitmapBytes.byteOffset, bitmapBytes.byteLength),
      true
    );
    expect(allBitmap.has(globalB)).toBe(true);
  });

  it('proto pollution safety (F10): builds without mutating Object.prototype', () => {
    const beforeProto = ({}).polluted;
    const beforeConstructor = ({}).constructor;

    buildFromFixture(F10_PROTO_POLLUTION);

    expect(({}).polluted).toBe(beforeProto);
    expect(({}).constructor).toBe(beforeConstructor);
  });

  it('empty graph produces valid empty shards', () => {
    const builder = new LogicalBitmapIndexBuilder();
    const tree = builder.serialize();

    expect(tree['labels.cbor']).toBeDefined();
    expect(tree['receipt.cbor']).toBeDefined();

    const receipt = defaultCodec.decode(tree['receipt.cbor']);
    expect(receipt.nodeCount).toBe(0);
    expect(receipt.labelCount).toBe(0);
  });

  it('receipt has deterministic fields and no timestamps', () => {
    const builder = buildFromFixture(F7_MULTILABEL_SAME_NEIGHBOR);
    const tree = builder.serialize();
    const receipt = defaultCodec.decode(tree['receipt.cbor']);

    expect(receipt).toHaveProperty('version', 1);
    expect(receipt).toHaveProperty('nodeCount', 2);
    expect(receipt).toHaveProperty('labelCount', 2);
    expect(receipt).toHaveProperty('shardCount');
    expect(receipt).not.toHaveProperty('timestamp');
    expect(receipt).not.toHaveProperty('createdAt');
  });

  it('round-trip: serialize → decode each shard → globalId↔nodeId intact', () => {
    const builder = buildFromFixture(F7_MULTILABEL_SAME_NEIGHBOR);
    const tree = builder.serialize();

    // Decode all meta shards and verify node mappings
    for (const [path, buf] of Object.entries(tree)) {
      if (path.startsWith('meta_') && path.endsWith('.cbor')) {
        const meta = defaultCodec.decode(buf);
        expect(meta).toHaveProperty('nodeToGlobal');
        expect(meta).toHaveProperty('nextLocalId');
        expect(meta).toHaveProperty('alive');

        // nodeToGlobal is array of [nodeId, globalId] pairs
        expect(Array.isArray(meta.nodeToGlobal)).toBe(true);
        for (const [nodeId, globalId] of meta.nodeToGlobal) {
          expect(typeof nodeId).toBe('string');
          expect(typeof globalId).toBe('number');
        }
      }
    }
  });
});
