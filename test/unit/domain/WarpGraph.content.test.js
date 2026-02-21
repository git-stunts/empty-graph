import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createEmptyStateV5, encodeEdgeKey, encodeEdgePropKey } from '../../../src/domain/services/JoinReducer.js';
import { orsetAdd } from '../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../src/domain/crdt/Dot.js';
import { encodePropKey } from '../../../src/domain/services/KeyCodec.js';

function setupGraphState(/** @type {any} */ graph, /** @type {any} */ seedFn) {
  const state = createEmptyStateV5();
  /** @type {any} */ (graph)._cachedState = state;
  graph.materialize = vi.fn().mockResolvedValue(state);
  seedFn(state);
}

function addNode(/** @type {any} */ state, /** @type {any} */ nodeId, /** @type {any} */ counter) {
  orsetAdd(state.nodeAlive, nodeId, createDot('w1', counter));
}

function addEdge(/** @type {any} */ state, /** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ label, /** @type {any} */ counter) {
  const edgeKey = encodeEdgeKey(from, to, label);
  orsetAdd(state.edgeAlive, edgeKey, createDot('w1', counter));
  state.edgeBirthEvent.set(edgeKey, { lamport: 1, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 });
}

describe('WarpGraph content attachment (query methods)', () => {
  /** @type {any} */
  let mockPersistence;
  /** @type {any} */
  let graph;

  beforeEach(async () => {
    mockPersistence = {
      readRef: vi.fn().mockResolvedValue(null),
      listRefs: vi.fn().mockResolvedValue([]),
      updateRef: vi.fn().mockResolvedValue(undefined),
      configGet: vi.fn().mockResolvedValue(null),
      configSet: vi.fn().mockResolvedValue(undefined),
      readBlob: vi.fn().mockResolvedValue(Buffer.from('hello world')),
    };

    graph = await WarpGraph.open({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  describe('getContentOid()', () => {
    it('returns the _content property value for a node', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 'abc123' });
      });

      const oid = await graph.getContentOid('doc:1');
      expect(oid).toBe('abc123');
    });

    it('returns null when node has no _content property', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
      });

      const oid = await graph.getContentOid('doc:1');
      expect(oid).toBeNull();
    });

    it('returns null when node does not exist', async () => {
      setupGraphState(graph, () => {});

      const oid = await graph.getContentOid('nonexistent');
      expect(oid).toBeNull();
    });

    it('returns null when _content is not a string', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 42 });
      });

      const oid = await graph.getContentOid('doc:1');
      expect(oid).toBeNull();
    });
  });

  describe('getContent()', () => {
    it('reads and returns the blob buffer', async () => {
      const buf = Buffer.from('# ADR 001\n\nSome content');
      mockPersistence.readBlob.mockResolvedValue(buf);

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 'abc123' });
      });

      const content = await graph.getContent('doc:1');
      expect(content).toEqual(buf);
      expect(mockPersistence.readBlob).toHaveBeenCalledWith('abc123');
    });

    it('returns null when no content attached', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
      });

      const content = await graph.getContent('doc:1');
      expect(content).toBeNull();
      expect(mockPersistence.readBlob).not.toHaveBeenCalled();
    });

    it('returns null for nonexistent node', async () => {
      setupGraphState(graph, () => {});

      const content = await graph.getContent('nonexistent');
      expect(content).toBeNull();
    });
  });

  describe('getEdgeContentOid()', () => {
    it('returns the _content property value for an edge', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
        const propKey = encodeEdgePropKey('a', 'b', 'rel', '_content');
        state.prop.set(propKey, { eventId: { lamport: 2, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 }, value: 'def456' });
      });

      const oid = await graph.getEdgeContentOid('a', 'b', 'rel');
      expect(oid).toBe('def456');
    });

    it('returns null when edge has no _content', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
      });

      const oid = await graph.getEdgeContentOid('a', 'b', 'rel');
      expect(oid).toBeNull();
    });

    it('returns null when edge does not exist', async () => {
      setupGraphState(graph, () => {});

      const oid = await graph.getEdgeContentOid('a', 'b', 'rel');
      expect(oid).toBeNull();
    });
  });

  describe('getEdgeContent()', () => {
    it('reads and returns the blob buffer', async () => {
      const buf = Buffer.from('edge content');
      mockPersistence.readBlob.mockResolvedValue(buf);

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
        const propKey = encodeEdgePropKey('a', 'b', 'rel', '_content');
        state.prop.set(propKey, { eventId: { lamport: 2, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 }, value: 'def456' });
      });

      const content = await graph.getEdgeContent('a', 'b', 'rel');
      expect(content).toEqual(buf);
      expect(mockPersistence.readBlob).toHaveBeenCalledWith('def456');
    });

    it('returns null when no content attached', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
      });

      const content = await graph.getEdgeContent('a', 'b', 'rel');
      expect(content).toBeNull();
    });
  });
});
