import { describe, it, expect } from 'vitest';
import {
  nodeVisible,
  edgeVisible,
  propVisible,
  serializeState,
  computeStateHash,
  deserializeState,
} from '../../../../src/domain/services/StateSerializer.js';
import {
  createEmptyState,
  encodeEdgeKey,
  encodePropKey,
  reduce,
} from '../../../../src/domain/services/Reducer.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import { lwwSet } from '../../../../src/domain/crdt/LWW.js';
import {
  createPatch,
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
} from '../../../../src/domain/types/WarpTypes.js';

/**
 * Helper to create a mock EventId for testing.
 * Uses valid hex sha (4-64 chars), positive lamport.
 */
function mockEventId(lamport = 1, writerId = 'test', patchSha = 'abcd1234', opIndex = 0) {
  return createEventId(lamport, writerId, patchSha, opIndex);
}

/**
 * Helper to build a state with specific nodes, edges, and props
 */
function buildState({ nodes = [], edges = [], props = [] }) {
  const state = createEmptyState();

  // Add nodes
  for (const { nodeId, alive, eventId } of nodes) {
    state.nodeAlive.set(nodeId, lwwSet(eventId ?? mockEventId(), alive));
  }

  // Add edges
  for (const { from, to, label, alive, eventId } of edges) {
    const key = encodeEdgeKey(from, to, label);
    state.edgeAlive.set(key, lwwSet(eventId ?? mockEventId(), alive));
  }

  // Add props
  for (const { nodeId, key, value, eventId } of props) {
    const propKey = encodePropKey(nodeId, key);
    state.prop.set(propKey, lwwSet(eventId ?? mockEventId(), value));
  }

  return state;
}

describe('StateSerializer', () => {
  describe('nodeVisible', () => {
    it('returns true for alive nodes', () => {
      const state = buildState({
        nodes: [{ nodeId: 'a', alive: true }],
      });

      expect(nodeVisible(state, 'a')).toBe(true);
    });

    it('returns false for tombstoned nodes', () => {
      const state = buildState({
        nodes: [{ nodeId: 'a', alive: false }],
      });

      expect(nodeVisible(state, 'a')).toBe(false);
    });

    it('returns false for unknown nodes', () => {
      const state = createEmptyState();

      expect(nodeVisible(state, 'nonexistent')).toBe(false);
    });

    it('returns false when nodeAlive register has undefined value', () => {
      const state = createEmptyState();
      state.nodeAlive.set('a', { eventId: mockEventId(), value: undefined });

      expect(nodeVisible(state, 'a')).toBe(false);
    });
  });

  describe('edgeVisible', () => {
    it('returns true when edge alive AND both endpoints visible', () => {
      const state = buildState({
        nodes: [
          { nodeId: 'a', alive: true },
          { nodeId: 'b', alive: true },
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows', alive: true }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisible(state, edgeKey)).toBe(true);
    });

    it('returns false when edge tombstoned', () => {
      const state = buildState({
        nodes: [
          { nodeId: 'a', alive: true },
          { nodeId: 'b', alive: true },
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows', alive: false }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisible(state, edgeKey)).toBe(false);
    });

    it('returns false when source endpoint tombstoned', () => {
      const state = buildState({
        nodes: [
          { nodeId: 'a', alive: false }, // tombstoned
          { nodeId: 'b', alive: true },
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows', alive: true }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisible(state, edgeKey)).toBe(false);
    });

    it('returns false when target endpoint tombstoned', () => {
      const state = buildState({
        nodes: [
          { nodeId: 'a', alive: true },
          { nodeId: 'b', alive: false }, // tombstoned
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows', alive: true }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisible(state, edgeKey)).toBe(false);
    });

    it('returns false when both endpoints tombstoned', () => {
      const state = buildState({
        nodes: [
          { nodeId: 'a', alive: false },
          { nodeId: 'b', alive: false },
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows', alive: true }],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisible(state, edgeKey)).toBe(false);
    });

    it('returns false for unknown edges', () => {
      const state = buildState({
        nodes: [
          { nodeId: 'a', alive: true },
          { nodeId: 'b', alive: true },
        ],
      });

      const edgeKey = encodeEdgeKey('a', 'b', 'knows');
      expect(edgeVisible(state, edgeKey)).toBe(false);
    });
  });

  describe('propVisible', () => {
    it('returns true when node visible and prop exists', () => {
      const state = buildState({
        nodes: [{ nodeId: 'a', alive: true }],
        props: [{ nodeId: 'a', key: 'name', value: createInlineValue('Alice') }],
      });

      const propKey = encodePropKey('a', 'name');
      expect(propVisible(state, propKey)).toBe(true);
    });

    it('returns false when node tombstoned', () => {
      const state = buildState({
        nodes: [{ nodeId: 'a', alive: false }],
        props: [{ nodeId: 'a', key: 'name', value: createInlineValue('Alice') }],
      });

      const propKey = encodePropKey('a', 'name');
      expect(propVisible(state, propKey)).toBe(false);
    });

    it('returns false when prop does not exist', () => {
      const state = buildState({
        nodes: [{ nodeId: 'a', alive: true }],
      });

      const propKey = encodePropKey('a', 'name');
      expect(propVisible(state, propKey)).toBe(false);
    });

    it('returns false when node unknown', () => {
      const state = createEmptyState();

      const propKey = encodePropKey('a', 'name');
      expect(propVisible(state, propKey)).toBe(false);
    });
  });

  describe('serializeState', () => {
    it('includes only visible nodes', () => {
      const state = buildState({
        nodes: [
          { nodeId: 'a', alive: true },
          { nodeId: 'b', alive: false }, // tombstoned
          { nodeId: 'c', alive: true },
        ],
      });

      const bytes = serializeState(state);
      const result = deserializeState(bytes);

      expect(result.nodes).toEqual(['a', 'c']);
    });

    it('sorts nodes alphabetically', () => {
      const state = buildState({
        nodes: [
          { nodeId: 'zebra', alive: true },
          { nodeId: 'apple', alive: true },
          { nodeId: 'mango', alive: true },
        ],
      });

      const bytes = serializeState(state);
      const result = deserializeState(bytes);

      expect(result.nodes).toEqual(['apple', 'mango', 'zebra']);
    });

    it('sorts edges by (from, to, label)', () => {
      const state = buildState({
        nodes: [
          { nodeId: 'a', alive: true },
          { nodeId: 'b', alive: true },
          { nodeId: 'c', alive: true },
        ],
        edges: [
          { from: 'b', to: 'c', label: 'x', alive: true },
          { from: 'a', to: 'c', label: 'y', alive: true },
          { from: 'a', to: 'b', label: 'z', alive: true },
          { from: 'a', to: 'b', label: 'a', alive: true },
        ],
      });

      const bytes = serializeState(state);
      const result = deserializeState(bytes);

      expect(result.edges).toEqual([
        { from: 'a', to: 'b', label: 'a' },
        { from: 'a', to: 'b', label: 'z' },
        { from: 'a', to: 'c', label: 'y' },
        { from: 'b', to: 'c', label: 'x' },
      ]);
    });

    it('sorts props by (node, key)', () => {
      const state = buildState({
        nodes: [
          { nodeId: 'b', alive: true },
          { nodeId: 'a', alive: true },
        ],
        props: [
          { nodeId: 'b', key: 'age', value: createInlineValue(30) },
          { nodeId: 'a', key: 'name', value: createInlineValue('Alice') },
          { nodeId: 'a', key: 'age', value: createInlineValue(25) },
          { nodeId: 'b', key: 'name', value: createInlineValue('Bob') },
        ],
      });

      const bytes = serializeState(state);
      const result = deserializeState(bytes);

      expect(result.props).toEqual([
        { node: 'a', key: 'age', value: createInlineValue(25) },
        { node: 'a', key: 'name', value: createInlineValue('Alice') },
        { node: 'b', key: 'age', value: createInlineValue(30) },
        { node: 'b', key: 'name', value: createInlineValue('Bob') },
      ]);
    });

    it('excludes tombstoned items from serialization', () => {
      const state = buildState({
        nodes: [
          { nodeId: 'a', alive: true },
          { nodeId: 'b', alive: false }, // tombstoned node
          { nodeId: 'c', alive: true },
        ],
        edges: [
          { from: 'a', to: 'c', label: 'knows', alive: true },
          { from: 'a', to: 'b', label: 'follows', alive: true }, // invisible (b tombstoned)
        ],
        props: [
          { nodeId: 'a', key: 'name', value: createInlineValue('Alice') },
          { nodeId: 'b', key: 'name', value: createInlineValue('Bob') }, // invisible (b tombstoned)
        ],
      });

      const bytes = serializeState(state);
      const result = deserializeState(bytes);

      expect(result.nodes).toEqual(['a', 'c']);
      expect(result.edges).toEqual([{ from: 'a', to: 'c', label: 'knows' }]);
      expect(result.props).toEqual([
        { node: 'a', key: 'name', value: createInlineValue('Alice') },
      ]);
    });

    it('excludes tombstoned edges even with visible endpoints', () => {
      const state = buildState({
        nodes: [
          { nodeId: 'a', alive: true },
          { nodeId: 'b', alive: true },
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows', alive: false }], // tombstoned edge
      });

      const bytes = serializeState(state);
      const result = deserializeState(bytes);

      expect(result.edges).toEqual([]);
    });

    it('serializes empty state correctly', () => {
      const state = createEmptyState();

      const bytes = serializeState(state);
      const result = deserializeState(bytes);

      expect(result).toEqual({ nodes: [], edges: [], props: [] });
    });
  });

  describe('computeStateHash', () => {
    it('returns 64-char hex string (SHA-256)', () => {
      const state = buildState({
        nodes: [{ nodeId: 'a', alive: true }],
      });

      const hash = computeStateHash(state);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces same hash for same state (determinism)', () => {
      const state1 = buildState({
        nodes: [
          { nodeId: 'a', alive: true },
          { nodeId: 'b', alive: true },
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows', alive: true }],
        props: [{ nodeId: 'a', key: 'name', value: createInlineValue('Alice') }],
      });

      const state2 = buildState({
        nodes: [
          { nodeId: 'a', alive: true },
          { nodeId: 'b', alive: true },
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows', alive: true }],
        props: [{ nodeId: 'a', key: 'name', value: createInlineValue('Alice') }],
      });

      expect(computeStateHash(state1)).toBe(computeStateHash(state2));
    });

    it('produces different hashes for different states', () => {
      const state1 = buildState({
        nodes: [{ nodeId: 'a', alive: true }],
      });

      const state2 = buildState({
        nodes: [{ nodeId: 'b', alive: true }],
      });

      expect(computeStateHash(state1)).not.toBe(computeStateHash(state2));
    });

    it('empty state has consistent hash', () => {
      const state = createEmptyState();
      const hash1 = computeStateHash(state);
      const hash2 = computeStateHash(state);

      expect(hash1).toBe(hash2);
    });
  });

  describe('deserializeState', () => {
    it('roundtrips with serializeState', () => {
      const state = buildState({
        nodes: [
          { nodeId: 'a', alive: true },
          { nodeId: 'b', alive: true },
        ],
        edges: [{ from: 'a', to: 'b', label: 'knows', alive: true }],
        props: [
          { nodeId: 'a', key: 'name', value: createInlineValue('Alice') },
          { nodeId: 'b', key: 'age', value: createInlineValue(30) },
        ],
      });

      const bytes = serializeState(state);
      const result = deserializeState(bytes);

      expect(result.nodes).toEqual(['a', 'b']);
      expect(result.edges).toEqual([{ from: 'a', to: 'b', label: 'knows' }]);
      expect(result.props).toHaveLength(2);
    });

    it('preserves complex values in props', () => {
      const complexValue = createInlineValue({
        nested: { array: [1, 2, 3], flag: true },
      });
      const state = buildState({
        nodes: [{ nodeId: 'a', alive: true }],
        props: [{ nodeId: 'a', key: 'data', value: complexValue }],
      });

      const bytes = serializeState(state);
      const result = deserializeState(bytes);

      expect(result.props[0].value).toEqual(complexValue);
    });
  });

  describe('determinism (CRITICAL WARP invariant)', () => {
    it('same state via different operation orders -> same hash', () => {
      // Build state via order 1: A, B, edge, prop on A, prop on B
      const patch1Order1 = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAdd('a'), createNodeAdd('b')],
      });
      const patch2Order1 = createPatch({
        writer: 'alice',
        lamport: 2,
        ops: [
          createEdgeAdd('a', 'b', 'knows'),
          createPropSet('a', 'name', createInlineValue('Alice')),
        ],
      });
      const patch3Order1 = createPatch({
        writer: 'alice',
        lamport: 3,
        ops: [createPropSet('b', 'name', createInlineValue('Bob'))],
      });

      // Build state via order 2: B, A, prop on B, edge, prop on A
      const patch1Order2 = createPatch({
        writer: 'bob',
        lamport: 1,
        ops: [createNodeAdd('b'), createNodeAdd('a')],
      });
      const patch2Order2 = createPatch({
        writer: 'bob',
        lamport: 2,
        ops: [createPropSet('b', 'name', createInlineValue('Bob'))],
      });
      const patch3Order2 = createPatch({
        writer: 'bob',
        lamport: 3,
        ops: [
          createEdgeAdd('a', 'b', 'knows'),
          createPropSet('a', 'name', createInlineValue('Alice')),
        ],
      });

      const stateOrder1 = reduce([
        { patch: patch1Order1, sha: 'aaaa1111' },
        { patch: patch2Order1, sha: 'aaaa2222' },
        { patch: patch3Order1, sha: 'aaaa3333' },
      ]);

      const stateOrder2 = reduce([
        { patch: patch1Order2, sha: 'bbbb1111' },
        { patch: patch2Order2, sha: 'bbbb2222' },
        { patch: patch3Order2, sha: 'bbbb3333' },
      ]);

      expect(computeStateHash(stateOrder1)).toBe(computeStateHash(stateOrder2));
    });

    it('concurrent adds with different timestamps produce same final hash', () => {
      // Writer 1 adds nodes a, b
      const patchW1 = createPatch({
        writer: 'writer1',
        lamport: 1,
        ops: [createNodeAdd('a'), createNodeAdd('b')],
      });

      // Writer 2 adds nodes b, c (overlapping b)
      const patchW2 = createPatch({
        writer: 'writer2',
        lamport: 2,
        ops: [createNodeAdd('b'), createNodeAdd('c')],
      });

      // Apply in different orders
      const stateOrder1 = reduce([
        { patch: patchW1, sha: 'aaaa0001' },
        { patch: patchW2, sha: 'aaaa0002' },
      ]);

      const stateOrder2 = reduce([
        { patch: patchW2, sha: 'aaaa0002' },
        { patch: patchW1, sha: 'aaaa0001' },
      ]);

      expect(computeStateHash(stateOrder1)).toBe(computeStateHash(stateOrder2));
    });

    it('add then tombstone same node produces same hash regardless of order', () => {
      // Scenario: Node added then tombstoned by same writer
      const patchAdd = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAdd('doomed')],
      });
      const patchTombstone = createPatch({
        writer: 'alice',
        lamport: 2,
        ops: [createNodeTombstone('doomed')],
      });

      // Scenario: Two different writers do the same thing
      const patchAddBob = createPatch({
        writer: 'bob',
        lamport: 1,
        ops: [createNodeAdd('doomed')],
      });
      const patchTombstoneBob = createPatch({
        writer: 'bob',
        lamport: 2,
        ops: [createNodeTombstone('doomed')],
      });

      const state1 = reduce([
        { patch: patchAdd, sha: 'aaaa0001' },
        { patch: patchTombstone, sha: 'aaaa0002' },
      ]);

      const state2 = reduce([
        { patch: patchAddBob, sha: 'bbbb0001' },
        { patch: patchTombstoneBob, sha: 'bbbb0002' },
      ]);

      // Both should have empty visible state (node tombstoned)
      expect(computeStateHash(state1)).toBe(computeStateHash(state2));
    });

    it('complex multi-writer scenario with interleaved operations', () => {
      // Three writers building the same final graph
      const patchA1 = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAdd('n1'), createPropSet('n1', 'owner', createInlineValue('alice'))],
      });
      const patchB1 = createPatch({
        writer: 'bob',
        lamport: 1,
        ops: [createNodeAdd('n2'), createPropSet('n2', 'owner', createInlineValue('bob'))],
      });
      const patchC1 = createPatch({
        writer: 'carol',
        lamport: 1,
        ops: [createNodeAdd('n3')],
      });
      const patchA2 = createPatch({
        writer: 'alice',
        lamport: 2,
        ops: [createEdgeAdd('n1', 'n2', 'link')],
      });
      const patchB2 = createPatch({
        writer: 'bob',
        lamport: 2,
        ops: [createEdgeAdd('n2', 'n3', 'link')],
      });
      const patchC2 = createPatch({
        writer: 'carol',
        lamport: 2,
        ops: [createPropSet('n3', 'owner', createInlineValue('carol'))],
      });

      // Order 1: Alice, Bob, Carol, then second round
      const state1 = reduce([
        { patch: patchA1, sha: 'aaaa0001' },
        { patch: patchB1, sha: 'bbbb0001' },
        { patch: patchC1, sha: 'cccc0001' },
        { patch: patchA2, sha: 'aaaa0002' },
        { patch: patchB2, sha: 'bbbb0002' },
        { patch: patchC2, sha: 'cccc0002' },
      ]);

      // Order 2: Interleaved differently
      const state2 = reduce([
        { patch: patchC1, sha: 'cccc0001' },
        { patch: patchA1, sha: 'aaaa0001' },
        { patch: patchB2, sha: 'bbbb0002' },
        { patch: patchB1, sha: 'bbbb0001' },
        { patch: patchC2, sha: 'cccc0002' },
        { patch: patchA2, sha: 'aaaa0002' },
      ]);

      // Order 3: Completely reversed
      const state3 = reduce([
        { patch: patchC2, sha: 'cccc0002' },
        { patch: patchB2, sha: 'bbbb0002' },
        { patch: patchA2, sha: 'aaaa0002' },
        { patch: patchC1, sha: 'cccc0001' },
        { patch: patchB1, sha: 'bbbb0001' },
        { patch: patchA1, sha: 'aaaa0001' },
      ]);

      const hash1 = computeStateHash(state1);
      const hash2 = computeStateHash(state2);
      const hash3 = computeStateHash(state3);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('LWW conflict resolution produces same hash regardless of patch order', () => {
      // Two writers set the same property with different values
      // Writer with higher EventId wins (lamport:2 > lamport:1)
      const patchLow = createPatch({
        writer: 'writer1',
        lamport: 1,
        ops: [createNodeAdd('n'), createPropSet('n', 'x', createInlineValue('low'))],
      });
      const patchHigh = createPatch({
        writer: 'writer2',
        lamport: 2,
        ops: [createNodeAdd('n'), createPropSet('n', 'x', createInlineValue('high'))],
      });

      const stateOrder1 = reduce([
        { patch: patchLow, sha: 'aaaa1111' },
        { patch: patchHigh, sha: 'bbbb2222' },
      ]);

      const stateOrder2 = reduce([
        { patch: patchHigh, sha: 'bbbb2222' },
        { patch: patchLow, sha: 'aaaa1111' },
      ]);

      expect(computeStateHash(stateOrder1)).toBe(computeStateHash(stateOrder2));

      // Verify the winner is the high value
      const bytes = serializeState(stateOrder1);
      const result = deserializeState(bytes);
      expect(result.props[0].value).toEqual(createInlineValue('high'));
    });
  });
});
