import { describe, it, expect } from 'vitest';
import {
  makeFixture,
  toAdjacencyMaps,
  runCrossProvider,
} from '../../helpers/fixtureDsl.js';

describe('fixtureDsl helpers', () => {
  it('toAdjacencyMaps sorts adjacency lists deterministically', () => {
    const fixture = makeFixture({
      nodes: ['A', 'B', 'C'],
      edges: [
        { from: 'A', to: 'C', label: 'z' },
        { from: 'A', to: 'B', label: 'b' },
        { from: 'A', to: 'B', label: 'a' },
      ],
    });

    const { outgoing, incoming } = toAdjacencyMaps(fixture);

    expect(outgoing.get('A')).toEqual([
      { neighborId: 'B', label: 'a' },
      { neighborId: 'B', label: 'b' },
      { neighborId: 'C', label: 'z' },
    ]);
    expect(incoming.get('B')).toEqual([
      { neighborId: 'A', label: 'a' },
      { neighborId: 'A', label: 'b' },
    ]);
  });

  it('runCrossProvider fails when providers diverge on throw-vs-return behavior', async () => {
    const fixture = makeFixture({
      nodes: ['A'],
      edges: [],
    });

    /** @type {Array<{name: string, provider: import('../../../src/ports/NeighborProviderPort.js').default}>} */
    const providers = [
      {
        name: 'returns',
        provider: {
          async getNeighbors() { return []; },
          async hasNode() { return true; },
          /** @returns {'async-local'} */
          get latencyClass() { return 'async-local'; },
        },
      },
      {
        name: 'throws',
        provider: {
          async getNeighbors() { throw new Error('boom'); },
          async hasNode() { return true; },
          /** @returns {'async-local'} */
          get latencyClass() { return 'async-local'; },
        },
      },
    ];

    await expect(runCrossProvider({
      fixture,
      providers,
      run: (engine) => engine.bfs({ start: 'A' }),
      assert: () => {},
    })).rejects.toThrow(/Provider mismatch/);
  });
});
