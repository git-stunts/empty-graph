/**
 * Cross-provider equivalence tests.
 *
 * Every GraphTraversal algorithm is run against both AdjacencyNeighborProvider
 * and LogicalBitmapNeighborProvider, asserting identical results.
 */

import { describe, it, expect } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/GraphTraversal.js';
import {
  makeAdjacencyProvider,
  makeLogicalBitmapProvider,
  F1_BFS_LEVEL_SORT_TRAP,
  F2_DFS_LEFTMOST_REVERSE_PUSH,
  F3_DIAMOND_EQUAL_PATHS,
  F4_DIJKSTRA_EQUAL_COST_PREDECESSOR,
  F4_WEIGHTS,
  F5_ASTAR_TIE_BREAK,
  F5_WEIGHTS,
  F8_TOPO_CYCLE_3,
  F9_UNICODE_CODEPOINT_ORDER,
  makeWeightFn,
} from '../../../helpers/fixtureDsl.js';

const PROVIDERS = [
  { name: 'Adjacency', make: makeAdjacencyProvider },
  { name: 'LogicalBitmap', make: makeLogicalBitmapProvider },
];

function forEachProvider(fixture, fn) {
  for (const { name, make } of PROVIDERS) {
    it(`[${name}]`, async () => {
      const provider = make(fixture);
      const engine = new GraphTraversal({ provider });
      await fn(engine);
    });
  }
}

describe('Cross-provider equivalence', () => {
  describe('BFS: F1 level-sort trap', () => {
    forEachProvider(F1_BFS_LEVEL_SORT_TRAP, async (engine) => {
      const { nodes } = await engine.bfs({ start: 'A' });
      expect(nodes).toEqual(['A', 'B', 'C', 'D', 'Z']);
    });
  });

  describe('BFS: F9 unicode codepoint order', () => {
    forEachProvider(F9_UNICODE_CODEPOINT_ORDER, async (engine) => {
      const { nodes } = await engine.bfs({ start: 'S' });
      expect(nodes).toEqual(['S', 'A', 'a', 'ä']);
    });
  });

  describe('DFS: F2 leftmost reverse push', () => {
    forEachProvider(F2_DFS_LEFTMOST_REVERSE_PUSH, async (engine) => {
      const { nodes } = await engine.dfs({ start: 'A' });
      expect(nodes).toEqual(['A', 'B', 'D', 'C', 'E']);
    });
  });

  describe('shortestPath: F3 diamond', () => {
    forEachProvider(F3_DIAMOND_EQUAL_PATHS, async (engine) => {
      const result = await engine.shortestPath({ start: 'A', goal: 'D' });
      expect(result.found).toBe(true);
      expect(result.path).toEqual(['A', 'B', 'D']);
    });
  });

  describe('Dijkstra: F4 equal cost predecessor update', () => {
    forEachProvider(F4_DIJKSTRA_EQUAL_COST_PREDECESSOR, async (engine) => {
      const weightFn = makeWeightFn(F4_WEIGHTS);
      const result = await engine.weightedShortestPath({ start: 'S', goal: 'G', weightFn });
      expect(result.totalCost).toBe(5);
      expect(result.path).toEqual(['S', 'B', 'G']);
    });
  });

  describe('A*: F5 tie-break expansion', () => {
    forEachProvider(F5_ASTAR_TIE_BREAK, async (engine) => {
      const weightFn = makeWeightFn(F5_WEIGHTS);
      const result = await engine.aStarSearch({
        start: 'S',
        goal: 'G',
        weightFn,
        heuristicFn: () => 0,
      });
      expect(result.totalCost).toBe(11);
      expect(result.path).toEqual(['S', 'B', 'G']);
    });
  });

  describe('topologicalSort: F3 diamond', () => {
    forEachProvider(F3_DIAMOND_EQUAL_PATHS, async (engine) => {
      const { sorted } = await engine.topologicalSort({ start: 'A' });
      expect(sorted).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  describe('topologicalSort: F8 cycle detection', () => {
    forEachProvider(F8_TOPO_CYCLE_3, async (engine) => {
      const { sorted } = await engine.topologicalSort({ start: 'A' });
      // Cycle → topoSort returns only acyclic prefix
      expect(sorted.length).toBeLessThan(3);
    });
  });

  describe('BFS: direction "in" on F3', () => {
    forEachProvider(F3_DIAMOND_EQUAL_PATHS, async (engine) => {
      const { nodes } = await engine.bfs({ start: 'D', direction: 'in' });
      expect(nodes).toEqual(['D', 'B', 'C', 'A']);
    });
  });
});
