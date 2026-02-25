import { describe, it, expect } from 'vitest';
import PropertyIndexBuilder from '../../../../src/domain/services/PropertyIndexBuilder.js';
import PropertyIndexReader from '../../../../src/domain/services/PropertyIndexReader.js';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.js';
import computeShardKey from '../../../../src/domain/utils/shardKey.js';
import { F10_PROTO_POLLUTION } from '../../../helpers/fixtureDsl.js';

/**
 * Creates an in-memory mock storage from serialized tree.
 */
/** @param {Record<string, Uint8Array>} tree */
function mockStorageFromTree(tree) {
  const blobs = new Map();
  /** @type {Record<string, string>} */
  const oids = {};
  let oidCounter = 0;

  for (const [path, buf] of Object.entries(tree)) {
    const oid = `oid_${oidCounter++}`;
    blobs.set(oid, buf);
    oids[path] = oid;
  }

  return {
    storage: { readBlob: async (/** @type {string} */ oid) => blobs.get(oid) },
    oids,
  };
}

describe('PropertyIndex', () => {
  it('build → serialize → load → query matches', async () => {
    const builder = new PropertyIndexBuilder();
    builder.addProperty('user:alice', 'name', 'Alice');
    builder.addProperty('user:alice', 'age', 30);
    builder.addProperty('user:bob', 'name', 'Bob');

    const tree = builder.serialize();
    const { storage, oids } = mockStorageFromTree(tree);

    const reader = new PropertyIndexReader({ storage });
    reader.setup(oids);

    const aliceProps = await reader.getNodeProps('user:alice');
    expect(aliceProps).toEqual({ name: 'Alice', age: 30 });

    const bobName = await reader.getProperty('user:bob', 'name');
    expect(bobName).toBe('Bob');
  });

  it('missing node returns null', async () => {
    const builder = new PropertyIndexBuilder();
    builder.addProperty('user:alice', 'name', 'Alice');

    const tree = builder.serialize();
    const { storage, oids } = mockStorageFromTree(tree);

    const reader = new PropertyIndexReader({ storage });
    reader.setup(oids);

    expect(await reader.getNodeProps('nonexistent')).toBeNull();
    expect(await reader.getProperty('nonexistent', 'name')).toBeUndefined();
  });

  it('multiple nodes in same shard are correctly isolated', async () => {
    const builder = new PropertyIndexBuilder();
    const first = 'a';
    const shardKey = computeShardKey(first);
    let second = null;
    for (let i = 0; i < 10000; i++) {
      const candidate = `node:${i}`;
      if (candidate !== first && computeShardKey(candidate) === shardKey) {
        second = candidate;
        break;
      }
    }
    if (!second) {
      throw new Error('failed to find a same-shard node for test');
    }
    builder.addProperty(first, 'x', 1);
    builder.addProperty(second, 'y', 2);

    const tree = builder.serialize();
    const { storage, oids } = mockStorageFromTree(tree);

    const reader = new PropertyIndexReader({ storage });
    reader.setup(oids);

    expect(await reader.getNodeProps(first)).toEqual({ x: 1 });
    expect(await reader.getNodeProps(second)).toEqual({ y: 2 });
  });

  it('round-trip: build → serialize → reader → values match', async () => {
    const builder = new PropertyIndexBuilder();
    builder.addProperty('node:1', 'color', 'red');
    builder.addProperty('node:1', 'weight', 42);
    builder.addProperty('node:2', 'color', 'blue');

    const tree = builder.serialize();

    // Verify raw CBOR shards are decodable
    for (const [path, buf] of Object.entries(tree)) {
      const decoded = defaultCodec.decode(buf);
      expect(typeof decoded).toBe('object');
    }

    const { storage, oids } = mockStorageFromTree(tree);
    const reader = new PropertyIndexReader({ storage });
    reader.setup(oids);

    expect(await reader.getProperty('node:1', 'color')).toBe('red');
    expect(await reader.getProperty('node:1', 'weight')).toBe(42);
    expect(await reader.getProperty('node:2', 'color')).toBe('blue');
  });

  it('proto pollution safety (F10): __proto__ node props do not leak', async () => {
    const builder = new PropertyIndexBuilder();
    for (const { nodeId, key, value } of /** @type {*} */ (F10_PROTO_POLLUTION.props)) {
      builder.addProperty(nodeId, key, value);
    }

    const tree = builder.serialize();
    const { storage, oids } = mockStorageFromTree(tree);

    const reader = new PropertyIndexReader({ storage });
    reader.setup(oids);

    const props = await reader.getNodeProps('__proto__');
    expect(props).toEqual({ polluted: true });
    expect((/** @type {Record<string, unknown>} */ ({})).polluted).toBeUndefined();
  });

  it('throws a descriptive error when a shard OID is missing', async () => {
    const reader = new PropertyIndexReader({
      storage: { readBlob: async () => undefined },
    });
    reader.setup({ 'props_ab.cbor': 'oid_missing' });
    const abNodeId = `ab${'0'.repeat(38)}`;

    await expect(reader.getNodeProps(abNodeId)).rejects.toThrow(/missing blob.*oid_missing/i);
  });
});
