/**
 * GraphTraversal.bfs — determinism + correctness tests using canonical fixtures.
 */

import { describe, it, expect } from 'vitest';
import GraphTraversal from '../../../../src/domain/services/GraphTraversal.js';
import {
  makeAdjacencyProvider,
  F1_BFS_LEVEL_SORT_TRAP,
  F3_DIAMOND_EQUAL_PATHS,
  F9_UNICODE_CODEPOINT_ORDER,
} from '../../../helpers/fixtureDsl.js';

describe('GraphTraversal.bfs', () => {
  // F1 — the trap that catches fake BFS determinism
  describe('F1 — BFS_LEVEL_SORT_TRAP', () => {
    it('visits nodes in depth-sorted lex order, not insertion order', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'A' });

      // A naive queue BFS gives A, B, C, Z, D (wrong).
      // Correct depth-sorted BFS: depth 0=[A], depth 1=[B,C], depth 2=[D,Z]
      expect(nodes).toEqual(['A', 'B', 'C', 'D', 'Z']);
    });

    it('shortestPath(A, D) returns A→C→D (C is parent of D)', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const result = await engine.shortestPath({ start: 'A', goal: 'D' });

      expect(result.found).toBe(true);
      expect(result.length).toBe(2);
      // A→C→D (C is the direct parent of D in this graph)
      expect(result.path).toEqual(['A', 'C', 'D']);
    });

    it('shortestPath(A, Z) returns A→B→Z', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const result = await engine.shortestPath({ start: 'A', goal: 'Z' });

      expect(result.found).toBe(true);
      expect(result.length).toBe(2);
      expect(result.path).toEqual(['A', 'B', 'Z']);
    });
  });

  // F3 — diamond: same-depth nodes in lex order
  describe('F3 — DIAMOND_EQUAL_PATHS', () => {
    it('visits B before C at depth 1', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'A' });
      expect(nodes).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  // F9 — unicode codepoint order, not locale
  describe('F9 — UNICODE_CODEPOINT_ORDER', () => {
    it('visits A (65) before a (97) before ä (228)', async () => {
      const provider = makeAdjacencyProvider(F9_UNICODE_CODEPOINT_ORDER);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'S' });
      expect(nodes).toEqual(['S', 'A', 'a', 'ä']);
    });
  });

  // Limits
  describe('limits', () => {
    it('respects maxDepth', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'A', maxDepth: 1 });
      expect(nodes).toEqual(['A', 'B', 'C']);
    });

    it('respects maxNodes', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'A', maxNodes: 3 });
      expect(nodes).toEqual(['A', 'B', 'C']);
    });

    it('respects AbortSignal', async () => {
      const provider = makeAdjacencyProvider(F1_BFS_LEVEL_SORT_TRAP);
      const engine = new GraphTraversal({ provider });
      const ac = new AbortController();
      ac.abort();
      await expect(engine.bfs({ start: 'A', signal: ac.signal })).rejects.toThrow(/aborted/i);
    });
  });

  // Direction
  describe('direction', () => {
    it('"in" follows incoming edges', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'D', direction: 'in' });
      expect(nodes).toEqual(['D', 'B', 'C', 'A']);
    });

    it('"both" finds all connected nodes', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { nodes } = await engine.bfs({ start: 'B', direction: 'both' });
      expect(nodes.sort()).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  // Stats
  describe('stats', () => {
    it('returns accurate node/edge counts', async () => {
      const provider = makeAdjacencyProvider(F3_DIAMOND_EQUAL_PATHS);
      const engine = new GraphTraversal({ provider });
      const { stats } = await engine.bfs({ start: 'A' });
      expect(stats.nodesVisited).toBe(4);
      expect(stats.edgesTraversed).toBeGreaterThan(0);
    });
  });
});
