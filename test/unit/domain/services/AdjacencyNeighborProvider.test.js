import { describe, it, expect } from 'vitest';
import AdjacencyNeighborProvider from '../../../../src/domain/services/AdjacencyNeighborProvider.js';

/**
 * Helper: build adjacency maps from a list of edges.
 * Each edge: { from, to, label }
 */
function buildMaps(edges) {
  const outgoing = new Map();
  const incoming = new Map();
  const allNodes = new Set();

  for (const { from, to, label } of edges) {
    allNodes.add(from);
    allNodes.add(to);
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push({ neighborId: to, label });
    if (!incoming.has(to)) incoming.set(to, []);
    incoming.get(to).push({ neighborId: from, label });
  }
  return { outgoing, incoming, aliveNodes: allNodes };
}

describe('AdjacencyNeighborProvider', () => {
  const edges = [
    { from: 'a', to: 'b', label: 'knows' },
    { from: 'a', to: 'c', label: 'manages' },
    { from: 'a', to: 'c', label: 'knows' },
    { from: 'b', to: 'c', label: 'knows' },
  ];
  const { outgoing, incoming, aliveNodes } = buildMaps(edges);

  it('returns outgoing neighbors sorted by (neighborId, label)', async () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    const result = await provider.getNeighbors('a', 'out');
    expect(result).toEqual([
      { neighborId: 'b', label: 'knows' },
      { neighborId: 'c', label: 'knows' },
      { neighborId: 'c', label: 'manages' },
    ]);
  });

  it('returns incoming neighbors sorted', async () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    const result = await provider.getNeighbors('c', 'in');
    expect(result).toEqual([
      { neighborId: 'a', label: 'knows' },
      { neighborId: 'a', label: 'manages' },
      { neighborId: 'b', label: 'knows' },
    ]);
  });

  it('returns merged "both" with dedup by (neighborId, label)', async () => {
    // a→b:knows and b→a would have 'a' in both in-list and out-list
    const edges2 = [
      { from: 'a', to: 'b', label: 'x' },
      { from: 'b', to: 'a', label: 'x' },
    ];
    const maps = buildMaps(edges2);
    const provider = new AdjacencyNeighborProvider(maps);

    // From 'a': out=[b:x], in=[b:x] → merged+dedup=[b:x]
    const result = await provider.getNeighbors('a', 'both');
    expect(result).toEqual([{ neighborId: 'b', label: 'x' }]);
  });

  it('filters by labels', async () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    const result = await provider.getNeighbors('a', 'out', { labels: new Set(['manages']) });
    expect(result).toEqual([{ neighborId: 'c', label: 'manages' }]);
  });

  it('returns empty for unknown label filter', async () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    const result = await provider.getNeighbors('a', 'out', { labels: new Set(['nonexistent']) });
    expect(result).toEqual([]);
  });

  it('returns empty for unknown node', async () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    const result = await provider.getNeighbors('unknown', 'out');
    expect(result).toEqual([]);
  });

  it('hasNode returns true for alive nodes', async () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    expect(await provider.hasNode('a')).toBe(true);
    expect(await provider.hasNode('z')).toBe(false);
  });

  it('hasNode fallback without aliveNodes', async () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming });
    expect(await provider.hasNode('a')).toBe(true);
    expect(await provider.hasNode('z')).toBe(false);
  });

  it('latencyClass is sync', () => {
    const provider = new AdjacencyNeighborProvider({ outgoing, incoming, aliveNodes });
    expect(provider.latencyClass).toBe('sync');
  });

  it('multi-label union for "both" keeps separate label entries', async () => {
    const edges3 = [
      { from: 'x', to: 'y', label: 'a' },
      { from: 'y', to: 'x', label: 'b' },
    ];
    const maps = buildMaps(edges3);
    const provider = new AdjacencyNeighborProvider(maps);

    // From 'x': out=[y:a], in=[y:b] → merged=[y:a, y:b] (different labels)
    const result = await provider.getNeighbors('x', 'both');
    expect(result).toEqual([
      { neighborId: 'y', label: 'a' },
      { neighborId: 'y', label: 'b' },
    ]);
  });
});
