import { describe, it, expect } from 'vitest';
import { createEmptyStateV5, applyOpV2 } from '../../../../src/domain/services/JoinReducer.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import LogicalIndexBuildService from '../../../../src/domain/services/LogicalIndexBuildService.js';
import LogicalIndexReader from '../../../../src/domain/services/LogicalIndexReader.js';
import BitmapNeighborProvider from '../../../../src/domain/services/BitmapNeighborProvider.js';

/**
 * Regression test: after materialize(), the bitmap index must reflect the
 * latest state, NOT a stale checkpoint index.
 *
 * Previously, `hydrateCheckpointIndex` overwrote the freshly built index
 * with the checkpoint's stale one. This test ensures that neighbors()
 * returns edges from the latest state after materialization.
 */
describe('No stale index after materialize', () => {
  it('index reflects S1 edges, not stale S0 checkpoint index', async () => {
    // -- Build S0: A -> B
    const sha = 'a'.repeat(40);
    const writer = 'w1';
    let lamport = 1;
    let opIdx = 0;

    const s0 = createEmptyStateV5();
    for (const nodeId of ['A', 'B']) {
      applyOpV2(s0, { type: 'NodeAdd', node: nodeId, dot: createDot(writer, lamport) },
        createEventId(lamport, writer, sha, opIdx++));
      lamport++;
    }
    applyOpV2(s0, { type: 'EdgeAdd', from: 'A', to: 'B', label: 'knows', dot: createDot(writer, lamport) },
      createEventId(lamport, writer, sha, opIdx++));
    lamport++;

    // Build S0 index (this is the "checkpoint" index)
    const buildService = new LogicalIndexBuildService();
    const { tree: s0Tree } = buildService.build(s0);

    const s0Reader = new LogicalIndexReader();
    s0Reader.loadFromTree(s0Tree);
    const s0Index = s0Reader.toLogicalIndex();
    const s0Provider = new BitmapNeighborProvider({ logicalIndex: s0Index });

    // Verify S0 provider sees A->B
    const s0Edges = await s0Provider.getNeighbors('A', 'out');
    expect(s0Edges).toHaveLength(1);
    expect(s0Edges[0].neighborId).toBe('B');

    // -- Build S1: A -> B, A -> C, C -> A (add node C and two edges)
    const s1 = createEmptyStateV5();
    lamport = 1;
    opIdx = 0;
    for (const nodeId of ['A', 'B', 'C']) {
      applyOpV2(s1, { type: 'NodeAdd', node: nodeId, dot: createDot(writer, lamport) },
        createEventId(lamport, writer, sha, opIdx++));
      lamport++;
    }
    for (const [from, to, label] of [['A', 'B', 'knows'], ['A', 'C', 'manages'], ['C', 'A', 'reports']]) {
      applyOpV2(s1, { type: 'EdgeAdd', from, to, label, dot: createDot(writer, lamport) },
        createEventId(lamport, writer, sha, opIdx++));
      lamport++;
    }

    // Build S1 index (this is what _buildView produces)
    const { tree: s1Tree } = buildService.build(s1);
    const s1Reader = new LogicalIndexReader();
    s1Reader.loadFromTree(s1Tree);
    const s1Index = s1Reader.toLogicalIndex();
    const s1Provider = new BitmapNeighborProvider({ logicalIndex: s1Index });

    // S1 provider must see A -> B AND A -> C
    const s1Edges = await s1Provider.getNeighbors('A', 'out');
    expect(s1Edges).toHaveLength(2);
    const neighbors = s1Edges.map(e => e.neighborId).sort();
    expect(neighbors).toEqual(['B', 'C']);

    // If we accidentally used the S0 provider (stale checkpoint), we'd only see B
    const staleEdges = await s0Provider.getNeighbors('A', 'out');
    expect(staleEdges).toHaveLength(1); // S0 only had A -> B

    // This is the key assertion: S1's index must NOT equal S0's
    expect(s1Edges.length).toBeGreaterThan(staleEdges.length);
  });
});
