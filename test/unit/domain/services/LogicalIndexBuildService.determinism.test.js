import { describe, it, expect } from 'vitest';
import LogicalIndexBuildService from '../../../../src/domain/services/LogicalIndexBuildService.js';
import { createEmptyStateV5, applyOpV2 } from '../../../../src/domain/services/JoinReducer.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.js';

/**
 * Helper: builds a WarpStateV5 from nodes and edges, applying ops in the
 * given order. Different orderings of the same final state should produce
 * identical index mappings after the determinism sort fix.
 */
function buildState(nodes, edges) {
  const state = createEmptyStateV5();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIdx = 0;
  let lamport = 1;

  for (const nodeId of nodes) {
    applyOpV2(state,
      { type: 'NodeAdd', node: nodeId, dot: createDot(writer, lamport) },
      createEventId(lamport, writer, sha, opIdx++));
    lamport++;
  }

  for (const { from, to, label } of edges) {
    applyOpV2(state,
      { type: 'EdgeAdd', from, to, label, dot: createDot(writer, lamport) },
      createEventId(lamport, writer, sha, opIdx++));
    lamport++;
  }

  return state;
}

/**
 * Extracts nodeToGlobal mappings from all meta shards in a serialized tree.
 */
function extractNodeMappings(tree) {
  const mappings = new Map();
  for (const [path, buf] of Object.entries(tree)) {
    if (path.startsWith('meta_') && path.endsWith('.cbor')) {
      const meta = defaultCodec.decode(buf);
      for (const [nodeId, globalId] of meta.nodeToGlobal) {
        mappings.set(nodeId, globalId);
      }
    }
  }
  return mappings;
}

/**
 * Extracts label registry from a serialized tree.
 */
function extractLabelRegistry(tree) {
  return defaultCodec.decode(tree['labels.cbor']);
}

describe('LogicalIndexBuildService determinism', () => {
  const edges = [
    { from: 'A', to: 'B', label: 'knows' },
    { from: 'B', to: 'C', label: 'manages' },
    { from: 'C', to: 'A', label: 'reports' },
  ];

  it('same state from different node insertion orders produces identical ID assignments', () => {
    // Order 1: A, B, C
    const state1 = buildState(['A', 'B', 'C'], edges);
    // Order 2: C, A, B (different insertion order, same final OR-Set)
    const state2 = buildState(['C', 'A', 'B'], edges);

    const service = new LogicalIndexBuildService();
    const { tree: tree1 } = service.build(state1);
    const { tree: tree2 } = service.build(state2);

    const mappings1 = extractNodeMappings(tree1);
    const mappings2 = extractNodeMappings(tree2);

    // Both should have the same nodeId → globalId assignments
    expect(mappings1.size).toBe(3);
    expect(mappings2.size).toBe(3);
    for (const [nodeId, globalId] of mappings1) {
      expect(mappings2.get(nodeId)).toBe(globalId);
    }
  });

  it('same state from different edge insertion orders produces identical label assignments', () => {
    const edgesOrder1 = [
      { from: 'A', to: 'B', label: 'knows' },
      { from: 'B', to: 'C', label: 'manages' },
      { from: 'C', to: 'A', label: 'reports' },
    ];
    const edgesOrder2 = [
      { from: 'C', to: 'A', label: 'reports' },
      { from: 'A', to: 'B', label: 'knows' },
      { from: 'B', to: 'C', label: 'manages' },
    ];

    const state1 = buildState(['A', 'B', 'C'], edgesOrder1);
    const state2 = buildState(['A', 'B', 'C'], edgesOrder2);

    const service = new LogicalIndexBuildService();
    const { tree: tree1 } = service.build(state1);
    const { tree: tree2 } = service.build(state2);

    const labels1 = extractLabelRegistry(tree1);
    const labels2 = extractLabelRegistry(tree2);

    // Both should have the same label → labelId assignments
    expect(labels1).toEqual(labels2);
  });

  it('meta shard nodeToGlobal pairs are sorted by nodeId', () => {
    const state = buildState(['Z', 'A', 'M', 'B'], []);

    const service = new LogicalIndexBuildService();
    const { tree } = service.build(state);

    for (const [path, buf] of Object.entries(tree)) {
      if (path.startsWith('meta_') && path.endsWith('.cbor')) {
        const meta = defaultCodec.decode(buf);
        const nodeIds = meta.nodeToGlobal.map(([id]) => id);
        const sorted = [...nodeIds].sort();
        expect(nodeIds).toEqual(sorted);
      }
    }
  });
});
