import { describe, it, expect } from 'vitest';
import {
  createEmptyState,
  encodeEdgeKey,
  decodeEdgeKey,
  encodePropKey,
  decodePropKey,
  expandPatch,
  applyOp,
  reduce,
} from '../../../../src/domain/services/Reducer.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import { lwwValue } from '../../../../src/domain/crdt/LWW.js';
import {
  createPatch,
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
} from '../../../../src/domain/types/WarpTypes.js';

describe('Reducer', () => {
  describe('createEmptyState', () => {
    it('returns state with empty Maps', () => {
      const state = createEmptyState();

      expect(state.nodeAlive).toBeInstanceOf(Map);
      expect(state.edgeAlive).toBeInstanceOf(Map);
      expect(state.prop).toBeInstanceOf(Map);
      expect(state.nodeAlive.size).toBe(0);
      expect(state.edgeAlive.size).toBe(0);
      expect(state.prop.size).toBe(0);
    });

    it('returns independent state objects', () => {
      const state1 = createEmptyState();
      const state2 = createEmptyState();

      state1.nodeAlive.set('a', { eventId: {}, value: true });

      expect(state2.nodeAlive.size).toBe(0);
    });
  });

  describe('encodeEdgeKey', () => {
    it('encodes edge key with NUL separator', () => {
      const key = encodeEdgeKey('from', 'to', 'label');

      expect(key).toBe('from\0to\0label');
    });

    it('handles empty strings', () => {
      const key = encodeEdgeKey('', '', '');

      expect(key).toBe('\0\0');
    });

    it('handles special characters in components', () => {
      const key = encodeEdgeKey('node:1', 'node:2', 'rel-type');

      expect(key).toBe('node:1\0node:2\0rel-type');
    });

    it('preserves unicode characters', () => {
      const key = encodeEdgeKey('user:alice', 'user:bob', 'follows');

      expect(key).toBe('user:alice\0user:bob\0follows');
    });
  });

  describe('decodeEdgeKey', () => {
    it('decodes edge key back to components', () => {
      const result = decodeEdgeKey('from\0to\0label');

      expect(result).toEqual({ from: 'from', to: 'to', label: 'label' });
    });

    it('roundtrips with encodeEdgeKey', () => {
      const original = { from: 'node:a', to: 'node:b', label: 'edge-type' };
      const encoded = encodeEdgeKey(original.from, original.to, original.label);
      const decoded = decodeEdgeKey(encoded);

      expect(decoded).toEqual(original);
    });

    it('handles empty strings', () => {
      const result = decodeEdgeKey('\0\0');

      expect(result).toEqual({ from: '', to: '', label: '' });
    });
  });

  describe('encodePropKey', () => {
    it('encodes property key with NUL separator', () => {
      const key = encodePropKey('node1', 'name');

      expect(key).toBe('node1\0name');
    });

    it('handles empty strings', () => {
      const key = encodePropKey('', '');

      expect(key).toBe('\0');
    });

    it('handles special characters', () => {
      const key = encodePropKey('user:alice', 'display-name');

      expect(key).toBe('user:alice\0display-name');
    });
  });

  describe('decodePropKey', () => {
    it('decodes property key back to components', () => {
      const result = decodePropKey('node1\0name');

      expect(result).toEqual({ nodeId: 'node1', propKey: 'name' });
    });

    it('roundtrips with encodePropKey', () => {
      const original = { nodeId: 'user:alice', propKey: 'age' };
      const encoded = encodePropKey(original.nodeId, original.propKey);
      const decoded = decodePropKey(encoded);

      expect(decoded).toEqual(original);
    });

    it('handles empty strings', () => {
      const result = decodePropKey('\0');

      expect(result).toEqual({ nodeId: '', propKey: '' });
    });
  });

  describe('expandPatch', () => {
    it('expands patch to (EventId, Op) tuples', () => {
      const patch = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [createNodeAdd('x'), createNodeAdd('y')],
      });
      const sha = 'abcd1234';

      const tuples = expandPatch(patch, sha);

      expect(tuples).toHaveLength(2);
      expect(tuples[0].eventId).toEqual({
        lamport: 1,
        writerId: 'alice',
        patchSha: 'abcd1234',
        opIndex: 0,
      });
      expect(tuples[0].op).toEqual({ type: 'NodeAdd', node: 'x' });
      expect(tuples[1].eventId).toEqual({
        lamport: 1,
        writerId: 'alice',
        patchSha: 'abcd1234',
        opIndex: 1,
      });
      expect(tuples[1].op).toEqual({ type: 'NodeAdd', node: 'y' });
    });

    it('returns empty array for empty ops', () => {
      const patch = createPatch({
        writer: 'alice',
        lamport: 1,
        ops: [],
      });

      const tuples = expandPatch(patch, 'abcd1234');

      expect(tuples).toHaveLength(0);
    });

    it('handles all operation types', () => {
      const patch = createPatch({
        writer: 'writer',
        lamport: 5,
        ops: [
          createNodeAdd('n1'),
          createNodeTombstone('n2'),
          createEdgeAdd('n1', 'n2', 'rel'),
          createEdgeTombstone('n2', 'n1', 'back'),
          createPropSet('n1', 'key', createInlineValue('value')),
        ],
      });

      const tuples = expandPatch(patch, 'abcd12345678');

      expect(tuples).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(tuples[i].eventId.opIndex).toBe(i);
        expect(tuples[i].eventId.lamport).toBe(5);
        expect(tuples[i].eventId.writerId).toBe('writer');
      }
    });
  });

  describe('applyOp', () => {
    describe('NodeAdd', () => {
      it('adds node to nodeAlive with true value', () => {
        const state = createEmptyState();
        const eventId = createEventId(1, 'writer', 'abcd1234', 0);
        const op = createNodeAdd('x');

        applyOp(state, eventId, op);

        expect(lwwValue(state.nodeAlive.get('x'))).toBe(true);
      });

      it('overwrites existing node if EventId is greater', () => {
        const state = createEmptyState();
        const eventId1 = createEventId(1, 'writer', 'abcd1234', 0);
        const eventId2 = createEventId(2, 'writer', 'abcd1234', 0);

        applyOp(state, eventId1, createNodeTombstone('x'));
        applyOp(state, eventId2, createNodeAdd('x'));

        expect(lwwValue(state.nodeAlive.get('x'))).toBe(true);
      });

      it('does not overwrite if existing EventId is greater', () => {
        const state = createEmptyState();
        const eventId1 = createEventId(2, 'writer', 'abcd1234', 0);
        const eventId2 = createEventId(1, 'writer', 'abcd1234', 0);

        applyOp(state, eventId1, createNodeTombstone('x'));
        applyOp(state, eventId2, createNodeAdd('x'));

        expect(lwwValue(state.nodeAlive.get('x'))).toBe(false);
      });
    });

    describe('NodeTombstone', () => {
      it('sets node to false in nodeAlive', () => {
        const state = createEmptyState();
        const eventId = createEventId(1, 'writer', 'abcd1234', 0);
        const op = createNodeTombstone('x');

        applyOp(state, eventId, op);

        expect(lwwValue(state.nodeAlive.get('x'))).toBe(false);
      });
    });

    describe('EdgeAdd', () => {
      it('adds edge to edgeAlive with true value', () => {
        const state = createEmptyState();
        const eventId = createEventId(1, 'writer', 'abcd1234', 0);
        const op = createEdgeAdd('a', 'b', 'rel');

        applyOp(state, eventId, op);

        const edgeKey = encodeEdgeKey('a', 'b', 'rel');
        expect(lwwValue(state.edgeAlive.get(edgeKey))).toBe(true);
      });
    });

    describe('EdgeTombstone', () => {
      it('sets edge to false in edgeAlive', () => {
        const state = createEmptyState();
        const eventId = createEventId(1, 'writer', 'abcd1234', 0);
        const op = createEdgeTombstone('a', 'b', 'rel');

        applyOp(state, eventId, op);

        const edgeKey = encodeEdgeKey('a', 'b', 'rel');
        expect(lwwValue(state.edgeAlive.get(edgeKey))).toBe(false);
      });
    });

    describe('PropSet', () => {
      it('sets property value', () => {
        const state = createEmptyState();
        const eventId = createEventId(1, 'writer', 'abcd1234', 0);
        const value = createInlineValue('hello');
        const op = createPropSet('x', 'name', value);

        applyOp(state, eventId, op);

        const propKey = encodePropKey('x', 'name');
        expect(lwwValue(state.prop.get(propKey))).toEqual(value);
      });

      it('overwrites property if EventId is greater', () => {
        const state = createEmptyState();
        const eventId1 = createEventId(1, 'writer', 'abcd1234', 0);
        const eventId2 = createEventId(2, 'writer', 'abcd1234', 0);
        const value1 = createInlineValue('old');
        const value2 = createInlineValue('new');

        applyOp(state, eventId1, createPropSet('x', 'name', value1));
        applyOp(state, eventId2, createPropSet('x', 'name', value2));

        const propKey = encodePropKey('x', 'name');
        expect(lwwValue(state.prop.get(propKey))).toEqual(value2);
      });
    });
  });

  describe('reduce', () => {
    describe('empty patches', () => {
      it('returns empty state for empty array', () => {
        const state = reduce([]);

        expect(state.nodeAlive.size).toBe(0);
        expect(state.edgeAlive.size).toBe(0);
        expect(state.prop.size).toBe(0);
      });
    });

    describe('single patch', () => {
      it('applies single patch correctly', () => {
        const patch = createPatch({
          writer: 'alice',
          lamport: 1,
          ops: [createNodeAdd('x'), createPropSet('x', 'name', createInlineValue('Node X'))],
        });

        const state = reduce([{ patch, sha: 'abcd1234' }]);

        expect(lwwValue(state.nodeAlive.get('x'))).toBe(true);
        expect(lwwValue(state.prop.get(encodePropKey('x', 'name')))).toEqual(
          createInlineValue('Node X')
        );
      });
    });

    describe('determinism under interleaving (WARP spec Section 14.3)', () => {
      it('reduce([A, B]) equals reduce([B, A])', () => {
        // Writer A: NodeAdd("x"), PropSet("x", "a", 1) @ lamport=1
        const patchA = createPatch({
          writer: 'A',
          lamport: 1,
          ops: [createNodeAdd('x'), createPropSet('x', 'a', createInlineValue(1))],
        });
        const shaA = 'aaaa1234';

        // Writer B: NodeAdd("y"), EdgeAdd("x", "y", "rel") @ lamport=1
        const patchB = createPatch({
          writer: 'B',
          lamport: 1,
          ops: [createNodeAdd('y'), createEdgeAdd('x', 'y', 'rel')],
        });
        const shaB = 'bbbb1234';

        const stateAB = reduce([
          { patch: patchA, sha: shaA },
          { patch: patchB, sha: shaB },
        ]);

        const stateBA = reduce([
          { patch: patchB, sha: shaB },
          { patch: patchA, sha: shaA },
        ]);

        // Both states should have the same nodes
        expect(lwwValue(stateAB.nodeAlive.get('x'))).toBe(true);
        expect(lwwValue(stateAB.nodeAlive.get('y'))).toBe(true);
        expect(lwwValue(stateBA.nodeAlive.get('x'))).toBe(true);
        expect(lwwValue(stateBA.nodeAlive.get('y'))).toBe(true);

        // Both states should have the same properties
        const propKeyXA = encodePropKey('x', 'a');
        expect(lwwValue(stateAB.prop.get(propKeyXA))).toEqual(createInlineValue(1));
        expect(lwwValue(stateBA.prop.get(propKeyXA))).toEqual(createInlineValue(1));

        // Both states should have the same edges
        const edgeKey = encodeEdgeKey('x', 'y', 'rel');
        expect(lwwValue(stateAB.edgeAlive.get(edgeKey))).toBe(true);
        expect(lwwValue(stateBA.edgeAlive.get(edgeKey))).toBe(true);

        // Verify same sizes
        expect(stateAB.nodeAlive.size).toBe(stateBA.nodeAlive.size);
        expect(stateAB.edgeAlive.size).toBe(stateBA.edgeAlive.size);
        expect(stateAB.prop.size).toBe(stateBA.prop.size);
      });

      it('produces identical state regardless of input order with many patches', () => {
        const patches = [
          {
            patch: createPatch({
              writer: 'w1',
              lamport: 1,
              ops: [createNodeAdd('a')],
            }),
            sha: 'aaa11111',
          },
          {
            patch: createPatch({
              writer: 'w2',
              lamport: 1,
              ops: [createNodeAdd('b')],
            }),
            sha: 'bbb22222',
          },
          {
            patch: createPatch({
              writer: 'w3',
              lamport: 2,
              ops: [createEdgeAdd('a', 'b', 'link')],
            }),
            sha: 'ccc33333',
          },
        ];

        // Test all permutations produce same result
        const state123 = reduce([patches[0], patches[1], patches[2]]);
        const state132 = reduce([patches[0], patches[2], patches[1]]);
        const state213 = reduce([patches[1], patches[0], patches[2]]);
        const state231 = reduce([patches[1], patches[2], patches[0]]);
        const state312 = reduce([patches[2], patches[0], patches[1]]);
        const state321 = reduce([patches[2], patches[1], patches[0]]);

        // All should have same nodes
        for (const state of [state123, state132, state213, state231, state312, state321]) {
          expect(lwwValue(state.nodeAlive.get('a'))).toBe(true);
          expect(lwwValue(state.nodeAlive.get('b'))).toBe(true);
          expect(state.nodeAlive.size).toBe(2);
          expect(state.edgeAlive.size).toBe(1);
        }
      });
    });

    describe('tombstone stability (WARP spec Section 14.3)', () => {
      it('PropSet with higher lamport wins over NodeTombstone', () => {
        // Writer A: NodeAdd("x") @ lamport=1
        const patchA = createPatch({
          writer: 'A',
          lamport: 1,
          ops: [createNodeAdd('x')],
        });

        // Writer B: NodeTombstone("x") @ lamport=2
        const patchB = createPatch({
          writer: 'B',
          lamport: 2,
          ops: [createNodeTombstone('x')],
        });

        // Writer C: PropSet("x", "k", "v") @ lamport=3
        const patchC = createPatch({
          writer: 'C',
          lamport: 3,
          ops: [createPropSet('x', 'k', createInlineValue('v'))],
        });

        const state = reduce([
          { patch: patchA, sha: 'aaa1aaaa' },
          { patch: patchB, sha: 'bbb2bbbb' },
          { patch: patchC, sha: 'ccc3cccc' },
        ]);

        // Node should be tombstoned (lamport=2 for tombstone)
        // But note: PropSet doesn't affect nodeAlive - it only sets the property
        // The property should still be set
        expect(lwwValue(state.nodeAlive.get('x'))).toBe(false);
        expect(lwwValue(state.prop.get(encodePropKey('x', 'k')))).toEqual(createInlineValue('v'));
      });

      it('later NodeAdd can resurrect tombstoned node', () => {
        // Create, delete, resurrect sequence
        const patchCreate = createPatch({
          writer: 'A',
          lamport: 1,
          ops: [createNodeAdd('x')],
        });

        const patchDelete = createPatch({
          writer: 'A',
          lamport: 2,
          ops: [createNodeTombstone('x')],
        });

        const patchResurrect = createPatch({
          writer: 'A',
          lamport: 3,
          ops: [createNodeAdd('x')],
        });

        const state = reduce([
          { patch: patchCreate, sha: 'aaa1aaaa' },
          { patch: patchDelete, sha: 'bbb2bbbb' },
          { patch: patchResurrect, sha: 'ccc3cccc' },
        ]);

        // Node should be alive after resurrection
        expect(lwwValue(state.nodeAlive.get('x'))).toBe(true);
      });
    });

    describe('LWW semantics', () => {
      it('same property set by two writers, higher EventId wins', () => {
        // Writer A sets property @ lamport=1
        const patchA = createPatch({
          writer: 'A',
          lamport: 1,
          ops: [createPropSet('x', 'name', createInlineValue('A-value'))],
        });

        // Writer B sets same property @ lamport=2
        const patchB = createPatch({
          writer: 'B',
          lamport: 2,
          ops: [createPropSet('x', 'name', createInlineValue('B-value'))],
        });

        const state = reduce([
          { patch: patchA, sha: 'aaa1aaaa' },
          { patch: patchB, sha: 'bbb2bbbb' },
        ]);

        // B wins because higher lamport
        expect(lwwValue(state.prop.get(encodePropKey('x', 'name')))).toEqual(
          createInlineValue('B-value')
        );
      });

      it('with same lamport, writerId is used as tiebreaker', () => {
        // Writer A sets property @ lamport=1
        const patchA = createPatch({
          writer: 'A',
          lamport: 1,
          ops: [createPropSet('x', 'name', createInlineValue('A-value'))],
        });

        // Writer B sets same property @ lamport=1
        const patchB = createPatch({
          writer: 'B',
          lamport: 1,
          ops: [createPropSet('x', 'name', createInlineValue('B-value'))],
        });

        const state = reduce([
          { patch: patchA, sha: 'aaa1aaaa' },
          { patch: patchB, sha: 'bbb2bbbb' },
        ]);

        // B wins because 'B' > 'A' lexicographically
        expect(lwwValue(state.prop.get(encodePropKey('x', 'name')))).toEqual(
          createInlineValue('B-value')
        );
      });

      it('with same lamport and writerId, patchSha is used as tiebreaker', () => {
        // Same writer, same lamport, different SHAs
        const patchA = createPatch({
          writer: 'W',
          lamport: 1,
          ops: [createPropSet('x', 'name', createInlineValue('first'))],
        });

        const patchB = createPatch({
          writer: 'W',
          lamport: 1,
          ops: [createPropSet('x', 'name', createInlineValue('second'))],
        });

        const state = reduce([
          { patch: patchA, sha: 'aaaa1234' },
          { patch: patchB, sha: 'bbbb1234' },
        ]);

        // patchB wins because 'bbbb1234' > 'aaaa1234' lexicographically
        expect(lwwValue(state.prop.get(encodePropKey('x', 'name')))).toEqual(
          createInlineValue('second')
        );
      });
    });

    describe('initial state (incremental reduce)', () => {
      it('starts from provided initial state', () => {
        // Create initial state with existing node
        const initialPatch = createPatch({
          writer: 'init',
          lamport: 1,
          ops: [createNodeAdd('existing')],
        });
        const initialState = reduce([{ patch: initialPatch, sha: 'aaaa1234' }]);

        // Apply new patch on top
        const newPatch = createPatch({
          writer: 'new',
          lamport: 2,
          ops: [createNodeAdd('new')],
        });

        const finalState = reduce([{ patch: newPatch, sha: 'bbbb12345' }], initialState);

        // Should have both nodes
        expect(lwwValue(finalState.nodeAlive.get('existing'))).toBe(true);
        expect(lwwValue(finalState.nodeAlive.get('new'))).toBe(true);
      });

      it('does not mutate the initial state', () => {
        const initialPatch = createPatch({
          writer: 'init',
          lamport: 1,
          ops: [createNodeAdd('x')],
        });
        const initialState = reduce([{ patch: initialPatch, sha: 'aaaa1234' }]);

        const newPatch = createPatch({
          writer: 'new',
          lamport: 2,
          ops: [createNodeAdd('y')],
        });

        reduce([{ patch: newPatch, sha: 'bbbb12345' }], initialState);

        // Initial state should still only have 'x'
        expect(initialState.nodeAlive.size).toBe(1);
        expect(lwwValue(initialState.nodeAlive.get('x'))).toBe(true);
        expect(initialState.nodeAlive.has('y')).toBe(false);
      });
    });

    describe('complex scenarios', () => {
      it('handles multiple operations on same entity', () => {
        const patch = createPatch({
          writer: 'W',
          lamport: 1,
          ops: [
            createNodeAdd('x'),
            createPropSet('x', 'a', createInlineValue(1)),
            createPropSet('x', 'b', createInlineValue(2)),
            createPropSet('x', 'a', createInlineValue(3)), // Override earlier prop
          ],
        });

        const state = reduce([{ patch, sha: 'abcd1234' }]);

        // Node exists
        expect(lwwValue(state.nodeAlive.get('x'))).toBe(true);
        // Property 'a' should have value 3 (later op wins by opIndex)
        expect(lwwValue(state.prop.get(encodePropKey('x', 'a')))).toEqual(createInlineValue(3));
        // Property 'b' should have value 2
        expect(lwwValue(state.prop.get(encodePropKey('x', 'b')))).toEqual(createInlineValue(2));
      });

      it('handles edge lifecycle', () => {
        const patches = [
          {
            patch: createPatch({
              writer: 'W',
              lamport: 1,
              ops: [createNodeAdd('a'), createNodeAdd('b'), createEdgeAdd('a', 'b', 'link')],
            }),
            sha: 'aaa11111',
          },
          {
            patch: createPatch({
              writer: 'W',
              lamport: 2,
              ops: [createEdgeTombstone('a', 'b', 'link')],
            }),
            sha: 'bbb22222',
          },
          {
            patch: createPatch({
              writer: 'W',
              lamport: 3,
              ops: [createEdgeAdd('a', 'b', 'link')],
            }),
            sha: 'ccc33333',
          },
        ];

        const state = reduce(patches);

        // Edge should be alive after re-adding
        const edgeKey = encodeEdgeKey('a', 'b', 'link');
        expect(lwwValue(state.edgeAlive.get(edgeKey))).toBe(true);
      });

      it('handles concurrent edge operations from different writers', () => {
        // Writer A adds edge at lamport=1
        const patchA = createPatch({
          writer: 'A',
          lamport: 1,
          ops: [createEdgeAdd('x', 'y', 'rel')],
        });

        // Writer B tombstones same edge at lamport=1 (concurrent)
        const patchB = createPatch({
          writer: 'B',
          lamport: 1,
          ops: [createEdgeTombstone('x', 'y', 'rel')],
        });

        const state = reduce([
          { patch: patchA, sha: 'aaa1aaaa' },
          { patch: patchB, sha: 'bbb2bbbb' },
        ]);

        // B wins because 'B' > 'A' lexicographically (same lamport, writerId tiebreaker)
        const edgeKey = encodeEdgeKey('x', 'y', 'rel');
        expect(lwwValue(state.edgeAlive.get(edgeKey))).toBe(false);
      });
    });

    describe('operations are sorted by EventId', () => {
      it('applies operations in EventId order regardless of input order', () => {
        // Create patches out of order
        const patchLater = createPatch({
          writer: 'W',
          lamport: 2,
          ops: [createPropSet('x', 'val', createInlineValue('later'))],
        });

        const patchEarlier = createPatch({
          writer: 'W',
          lamport: 1,
          ops: [createPropSet('x', 'val', createInlineValue('earlier'))],
        });

        // Apply in wrong order
        const state = reduce([
          { patch: patchLater, sha: 'bbbb1234' },
          { patch: patchEarlier, sha: 'aaaa1234' },
        ]);

        // Later should win
        expect(lwwValue(state.prop.get(encodePropKey('x', 'val')))).toEqual(
          createInlineValue('later')
        );
      });
    });
  });
});
