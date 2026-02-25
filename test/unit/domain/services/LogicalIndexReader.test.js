import { describe, it, expect, vi, beforeEach } from 'vitest';
import LogicalIndexReader from '../../../../src/domain/services/LogicalIndexReader.js';
import LogicalIndexBuildService from '../../../../src/domain/services/LogicalIndexBuildService.js';
import {
  makeFixture,
  F7_MULTILABEL_SAME_NEIGHBOR,
  F10_PROTO_POLLUTION,
} from '../../../helpers/fixtureDsl.js';
import { createEmptyStateV5, applyOpV2 } from '../../../../src/domain/services/JoinReducer.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a WarpStateV5 from a fixture (mirrors fixtureDsl._fixtureToState).
 * @param {{nodes: string[], edges: Array<{from: string, to: string, label: string}>, props?: Array<{nodeId: string, key: string, value: unknown}>}} fixture
 */
function fixtureToState(fixture) {
  const state = createEmptyStateV5();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIdx = 0;
  let lamport = 1;

  for (const nodeId of fixture.nodes) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    lamport++;
  }

  for (const { from, to, label } of fixture.edges) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'EdgeAdd', from, to, label, dot }, eventId);
    lamport++;
  }

  for (const { nodeId, key, value } of fixture.props || []) {
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'PropSet', node: nodeId, key, value }, eventId);
    lamport++;
  }

  return state;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LogicalIndexReader', () => {
  describe('loadFromTree', () => {
    it('hydrates a LogicalIndex from F7_MULTILABEL tree', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new LogicalIndexBuildService();
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
      reader.loadFromTree(tree);
      const idx = reader.toLogicalIndex();

      // isAlive
      expect(idx.isAlive('A')).toBe(true);
      expect(idx.isAlive('B')).toBe(true);
      expect(idx.isAlive('Z')).toBe(false);

      // getGlobalId round-trips
      const gidA = idx.getGlobalId('A');
      expect(typeof gidA).toBe('number');
      if (gidA === undefined) { throw new Error('expected gidA'); }
      expect(idx.getNodeId(gidA)).toBe('A');

      // getEdges returns both labels sorted
      const outEdges = idx.getEdges('A', 'out');
      expect(outEdges.length).toBe(2);
      const labels = outEdges.map((e) => e.label).sort();
      expect(labels).toEqual(['manages', 'owns']);

      // getLabelRegistry
      const registry = idx.getLabelRegistry();
      expect(registry.has('manages')).toBe(true);
      expect(registry.has('owns')).toBe(true);
    });

    it('returns empty results for nonexistent nodes', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new LogicalIndexBuildService();
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
      reader.loadFromTree(tree);
      const idx = reader.toLogicalIndex();

      expect(idx.isAlive('Z')).toBe(false);
      expect(idx.getGlobalId('Z')).toBeUndefined();
      expect(idx.getEdges('Z', 'out')).toEqual([]);
    });
  });

  describe('loadFromOids', () => {
    it('loads shards lazily via mock storage', async () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new LogicalIndexBuildService();
      const { tree } = service.build(state);

      // Simulate OID→buffer mapping
      /** @type {Record<string, string>} */ const shardOids = {};
      const blobStore = new Map();
      let oidCounter = 0;
      for (const [path, buf] of Object.entries(tree)) {
        const oid = `oid_${String(oidCounter++).padStart(4, '0')}`;
        shardOids[path] = oid;
        blobStore.set(oid, buf);
      }

      const mockStorage = {
        readBlob: vi.fn((oid) => Promise.resolve(blobStore.get(oid))),
      };

      const reader = new LogicalIndexReader();
      await reader.loadFromOids(shardOids, mockStorage);
      const idx = reader.toLogicalIndex();

      expect(idx.isAlive('A')).toBe(true);
      expect(idx.isAlive('B')).toBe(true);

      const outEdges = idx.getEdges('A', 'out');
      expect(outEdges.length).toBe(2);

      // Verify storage was called
      expect(mockStorage.readBlob).toHaveBeenCalled();
    });
  });

  describe('F10 proto pollution safety', () => {
    it('__proto__ node survives roundtrip without mutating Object.prototype', () => {
      const protoBefore = Object.getOwnPropertyNames(Object.prototype).sort();

      const state = fixtureToState(F10_PROTO_POLLUTION);
      const service = new LogicalIndexBuildService();
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
      reader.loadFromTree(tree);
      const idx = reader.toLogicalIndex();

      // __proto__ node exists and round-trips
      expect(idx.isAlive('__proto__')).toBe(true);
      const gid = idx.getGlobalId('__proto__');
      expect(typeof gid).toBe('number');
      if (gid === undefined) { throw new Error('expected gid'); }
      expect(idx.getNodeId(gid)).toBe('__proto__');

      // Object.prototype not mutated
      const protoAfter = Object.getOwnPropertyNames(Object.prototype).sort();
      expect(protoAfter).toEqual(protoBefore);
    });
  });

  describe('toLogicalIndex returns a proper LogicalIndex interface', () => {
    it('has all required methods', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new LogicalIndexBuildService();
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
      reader.loadFromTree(tree);
      const idx = reader.toLogicalIndex();

      expect(typeof idx.getGlobalId).toBe('function');
      expect(typeof idx.isAlive).toBe('function');
      expect(typeof idx.getNodeId).toBe('function');
      expect(typeof idx.getEdges).toBe('function');
      expect(typeof idx.getLabelRegistry).toBe('function');
    });
  });

  describe('getEdges with label filter', () => {
    it('filters by label IDs', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new LogicalIndexBuildService();
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
      reader.loadFromTree(tree);
      const idx = reader.toLogicalIndex();

      const registry = idx.getLabelRegistry();
      const managesId = registry.get('manages');
      expect(managesId).toBeDefined();
      if (managesId === undefined) { throw new Error('expected managesId'); }

      const filtered = idx.getEdges('A', 'out', [managesId]);
      expect(filtered.length).toBe(1);
      expect(filtered[0].label).toBe('manages');
      expect(filtered[0].neighborId).toBe('B');
    });
  });
});
