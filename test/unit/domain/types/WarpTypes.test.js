import { describe, it, expect } from 'vitest';
import {
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
  createBlobValue,
  createPatch,
  createEventId,
} from '../../../../src/domain/types/WarpTypes.js';

describe('WarpTypes', () => {
  describe('Value Reference Factory Functions', () => {
    describe('createInlineValue', () => {
      it('creates inline value with string', () => {
        const result = createInlineValue('hello');

        expect(result).toEqual({ type: 'inline', value: 'hello' });
      });

      it('creates inline value with number', () => {
        const result = createInlineValue(42);

        expect(result).toEqual({ type: 'inline', value: 42 });
      });

      it('creates inline value with object', () => {
        const obj = { name: 'Alice', age: 30 };
        const result = createInlineValue(obj);

        expect(result).toEqual({ type: 'inline', value: obj });
      });

      it('creates inline value with array', () => {
        const arr = [1, 2, 3];
        const result = createInlineValue(arr);

        expect(result).toEqual({ type: 'inline', value: arr });
      });

      it('creates inline value with null', () => {
        const result = createInlineValue(null);

        expect(result).toEqual({ type: 'inline', value: null });
      });

      it('creates inline value with boolean', () => {
        const result = createInlineValue(true);

        expect(result).toEqual({ type: 'inline', value: true });
      });
    });

    describe('createBlobValue', () => {
      it('creates blob value with OID', () => {
        const oid = 'abc123def456';
        const result = createBlobValue(oid);

        expect(result).toEqual({ type: 'blob', oid: 'abc123def456' });
      });

      it('creates blob value with full SHA', () => {
        const oid = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        const result = createBlobValue(oid);

        expect(result).toEqual({ type: 'blob', oid });
      });
    });
  });

  describe('Operation Factory Functions', () => {
    describe('createNodeAdd', () => {
      it('creates NodeAdd operation', () => {
        const result = createNodeAdd('user:alice');

        expect(result).toEqual({
          type: 'NodeAdd',
          node: 'user:alice',
        });
      });

      it('creates NodeAdd with UUID-style node ID', () => {
        const nodeId = '550e8400-e29b-41d4-a716-446655440000';
        const result = createNodeAdd(nodeId);

        expect(result).toEqual({
          type: 'NodeAdd',
          node: nodeId,
        });
      });
    });

    describe('createNodeTombstone', () => {
      it('creates NodeTombstone operation', () => {
        const result = createNodeTombstone('user:bob');

        expect(result).toEqual({
          type: 'NodeTombstone',
          node: 'user:bob',
        });
      });
    });

    describe('createEdgeAdd', () => {
      it('creates EdgeAdd operation', () => {
        const result = createEdgeAdd('user:alice', 'user:bob', 'follows');

        expect(result).toEqual({
          type: 'EdgeAdd',
          from: 'user:alice',
          to: 'user:bob',
          label: 'follows',
        });
      });

      it('creates EdgeAdd with different label', () => {
        const result = createEdgeAdd('post:123', 'user:alice', 'authored_by');

        expect(result).toEqual({
          type: 'EdgeAdd',
          from: 'post:123',
          to: 'user:alice',
          label: 'authored_by',
        });
      });
    });

    describe('createEdgeTombstone', () => {
      it('creates EdgeTombstone operation', () => {
        const result = createEdgeTombstone('user:alice', 'user:bob', 'follows');

        expect(result).toEqual({
          type: 'EdgeTombstone',
          from: 'user:alice',
          to: 'user:bob',
          label: 'follows',
        });
      });
    });

    describe('createPropSet', () => {
      it('creates PropSet operation with inline value', () => {
        const value = createInlineValue('Alice');
        const result = createPropSet('user:alice', 'name', value);

        expect(result).toEqual({
          type: 'PropSet',
          node: 'user:alice',
          key: 'name',
          value: { type: 'inline', value: 'Alice' },
        });
      });

      it('creates PropSet operation with blob value', () => {
        const value = createBlobValue('abc123');
        const result = createPropSet('user:alice', 'avatar', value);

        expect(result).toEqual({
          type: 'PropSet',
          node: 'user:alice',
          key: 'avatar',
          value: { type: 'blob', oid: 'abc123' },
        });
      });

      it('creates PropSet with complex inline value', () => {
        const value = createInlineValue({ nested: { data: [1, 2, 3] } });
        const result = createPropSet('config:main', 'settings', value);

        expect(result).toEqual({
          type: 'PropSet',
          node: 'config:main',
          key: 'settings',
          value: { type: 'inline', value: { nested: { data: [1, 2, 3] } } },
        });
      });
    });
  });

  describe('Patch Factory Function', () => {
    describe('createPatch', () => {
      it('creates PatchV1 with required fields', () => {
        const ops = [createNodeAdd('user:alice')];
        const result = createPatch({
          writer: 'writer-1',
          lamport: 1,
          ops,
        });

        expect(result).toEqual({
          schema: 1,
          writer: 'writer-1',
          lamport: 1,
          ops: [{ type: 'NodeAdd', node: 'user:alice' }],
        });
      });

      it('creates PatchV1 with baseCheckpoint', () => {
        const ops = [createNodeAdd('user:bob')];
        const result = createPatch({
          writer: 'writer-2',
          lamport: 5,
          ops,
          baseCheckpoint: 'checkpoint-sha-123',
        });

        expect(result).toEqual({
          schema: 1,
          writer: 'writer-2',
          lamport: 5,
          ops: [{ type: 'NodeAdd', node: 'user:bob' }],
          baseCheckpoint: 'checkpoint-sha-123',
        });
      });

      it('creates PatchV1 with multiple operations', () => {
        const ops = [
          createNodeAdd('user:alice'),
          createNodeAdd('user:bob'),
          createEdgeAdd('user:alice', 'user:bob', 'follows'),
          createPropSet('user:alice', 'name', createInlineValue('Alice')),
        ];
        const result = createPatch({
          writer: 'writer-1',
          lamport: 10,
          ops,
        });

        expect(result.schema).toBe(1);
        expect(result.writer).toBe('writer-1');
        expect(result.lamport).toBe(10);
        expect(result.ops).toHaveLength(4);
        expect(result.ops[0].type).toBe('NodeAdd');
        expect(result.ops[1].type).toBe('NodeAdd');
        expect(result.ops[2].type).toBe('EdgeAdd');
        expect(result.ops[3].type).toBe('PropSet');
      });

      it('creates PatchV1 with empty ops array', () => {
        const result = createPatch({
          writer: 'writer-1',
          lamport: 0,
          ops: [],
        });

        expect(result).toEqual({
          schema: 1,
          writer: 'writer-1',
          lamport: 0,
          ops: [],
        });
      });

      it('does not include baseCheckpoint when undefined', () => {
        const result = createPatch({
          writer: 'writer-1',
          lamport: 1,
          ops: [],
          baseCheckpoint: undefined,
        });

        expect(result).not.toHaveProperty('baseCheckpoint');
      });

      it('always sets schema to 1', () => {
        const result = createPatch({
          writer: 'any-writer',
          lamport: 999,
          ops: [],
        });

        expect(result.schema).toBe(1);
      });
    });
  });

  describe('EventId Factory Function', () => {
    describe('createEventId', () => {
      it('creates EventId with all fields', () => {
        const result = createEventId({
          lamport: 5,
          writerId: 'writer-1',
          patchSha: 'abc123def456',
          opIndex: 0,
        });

        expect(result).toEqual({
          lamport: 5,
          writerId: 'writer-1',
          patchSha: 'abc123def456',
          opIndex: 0,
        });
      });

      it('creates EventId with different opIndex', () => {
        const result = createEventId({
          lamport: 10,
          writerId: 'writer-2',
          patchSha: 'sha256hash',
          opIndex: 3,
        });

        expect(result.opIndex).toBe(3);
      });

      it('creates EventId with zero lamport', () => {
        const result = createEventId({
          lamport: 0,
          writerId: 'initial-writer',
          patchSha: 'genesis',
          opIndex: 0,
        });

        expect(result.lamport).toBe(0);
      });
    });
  });

  describe('Type Discriminators', () => {
    it('all operation types have distinct type field', () => {
      const nodeAdd = createNodeAdd('n1');
      const nodeTombstone = createNodeTombstone('n1');
      const edgeAdd = createEdgeAdd('n1', 'n2', 'rel');
      const edgeTombstone = createEdgeTombstone('n1', 'n2', 'rel');
      const propSet = createPropSet('n1', 'key', createInlineValue('val'));

      const types = [
        nodeAdd.type,
        nodeTombstone.type,
        edgeAdd.type,
        edgeTombstone.type,
        propSet.type,
      ];

      // All types should be unique
      const uniqueTypes = new Set(types);
      expect(uniqueTypes.size).toBe(5);
    });

    it('value refs have distinct type field', () => {
      const inline = createInlineValue('test');
      const blob = createBlobValue('oid');

      expect(inline.type).toBe('inline');
      expect(blob.type).toBe('blob');
      expect(inline.type).not.toBe(blob.type);
    });
  });

  describe('Integration - Building Complete Patches', () => {
    it('creates a realistic patch with mixed operations', () => {
      // Simulate creating a user and setting properties
      const patch = createPatch({
        writer: 'app-server-1',
        lamport: 42,
        ops: [
          createNodeAdd('user:123'),
          createPropSet('user:123', 'email', createInlineValue('alice@example.com')),
          createPropSet('user:123', 'name', createInlineValue('Alice')),
          createPropSet('user:123', 'profilePic', createBlobValue('sha256-of-image')),
        ],
        baseCheckpoint: 'previous-checkpoint-sha',
      });

      expect(patch.schema).toBe(1);
      expect(patch.ops).toHaveLength(4);
      expect(patch.ops[0]).toEqual({ type: 'NodeAdd', node: 'user:123' });
      expect(patch.ops[1].type).toBe('PropSet');
      expect(patch.ops[1].value.type).toBe('inline');
      expect(patch.ops[3].value.type).toBe('blob');
    });

    it('creates a social graph patch', () => {
      const patch = createPatch({
        writer: 'social-service',
        lamport: 100,
        ops: [
          createNodeAdd('user:alice'),
          createNodeAdd('user:bob'),
          createEdgeAdd('user:alice', 'user:bob', 'follows'),
          createEdgeAdd('user:bob', 'user:alice', 'follows'),
          createPropSet('user:alice', 'followingCount', createInlineValue(1)),
          createPropSet('user:bob', 'followingCount', createInlineValue(1)),
        ],
      });

      expect(patch.ops).toHaveLength(6);

      // Verify edge operations
      const edges = patch.ops.filter((op) => op.type === 'EdgeAdd');
      expect(edges).toHaveLength(2);
      expect(edges[0].label).toBe('follows');
    });

    it('creates a deletion patch', () => {
      const patch = createPatch({
        writer: 'cleanup-job',
        lamport: 200,
        ops: [
          createEdgeTombstone('user:alice', 'user:bob', 'follows'),
          createNodeTombstone('user:bob'),
        ],
      });

      expect(patch.ops).toHaveLength(2);
      expect(patch.ops[0].type).toBe('EdgeTombstone');
      expect(patch.ops[1].type).toBe('NodeTombstone');
    });
  });
});
