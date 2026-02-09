import { describe, it, expect } from 'vitest';
import { renderSeekView } from '../../../src/visualization/renderers/ascii/seek.js';
import { stripAnsi } from '../../../src/visualization/utils/ansi.js';

describe('renderSeekView', () => {
  it('renders seek status with multiple writers', () => {
    const payload = {
      graph: 'sandbox',
      tick: 1,
      maxTick: 2,
      ticks: [1, 2],
      nodes: 9,
      edges: 12,
      patchCount: 6,
      perWriter: {
        alice: { ticks: [1, 2], tipSha: '5f14fc7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        bob: { ticks: [1, 2], tipSha: '575d6f8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        charlie: { ticks: [1], tipSha: '6804b59aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('SEEK');
    expect(output).toContain('GRAPH: sandbox');
    expect(output).toContain('POSITION: tick 1 of 2');
    expect(output).toContain('alice');
    expect(output).toContain('bob');
    expect(output).toContain('charlie');
    expect(output).toContain('9 nodes, 12 edges');
  });

  it('renders seek status at tick 0 (empty state)', () => {
    const payload = {
      graph: 'test',
      tick: 0,
      maxTick: 3,
      ticks: [1, 2, 3],
      nodes: 0,
      edges: 0,
      patchCount: 0,
      perWriter: {
        alice: { ticks: [1, 2, 3], tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('POSITION: tick 0 of 3');
    expect(output).toContain('0 nodes, 0 edges');
  });

  it('renders seek at latest tick', () => {
    const payload = {
      graph: 'mydb',
      tick: 5,
      maxTick: 5,
      ticks: [1, 2, 3, 4, 5],
      nodes: 100,
      edges: 200,
      patchCount: 15,
      perWriter: {
        writer1: { ticks: [1, 3, 5], tipSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('POSITION: tick 5 of 5');
    expect(output).toContain('100 nodes, 200 edges');
  });

  it('renders with single writer', () => {
    const payload = {
      graph: 'solo',
      tick: 2,
      maxTick: 3,
      ticks: [1, 2, 3],
      nodes: 5,
      edges: 3,
      patchCount: 2,
      perWriter: {
        alice: { ticks: [1, 2, 3], tipSha: 'cccccccccccccccccccccccccccccccccccccccc' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('GRAPH: solo');
    expect(output).toContain('alice');
    expect(output).toContain('5 nodes, 3 edges');
  });

  it('handles empty graph (no ticks)', () => {
    const payload = {
      graph: 'empty',
      tick: 0,
      maxTick: 0,
      ticks: [],
      nodes: 0,
      edges: 0,
      patchCount: 0,
      perWriter: {},
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('POSITION: tick 0 of 0');
    expect(output).toContain('0 nodes, 0 edges');
  });

  it('renders singular labels for 1 node, 1 edge, 1 patch', () => {
    const payload = {
      graph: 'tiny',
      tick: 1,
      maxTick: 1,
      ticks: [1],
      nodes: 1,
      edges: 1,
      patchCount: 1,
      perWriter: {
        alice: { ticks: [1], tipSha: 'dddddddddddddddddddddddddddddddddddddd' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('1 node, 1 edge, 1 patch');
  });

  it('accepts perWriter as a Map', () => {
    const perWriter = new Map([
      ['alice', { ticks: [1, 2], tipSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' }],
    ]);

    const payload = {
      graph: 'maptest',
      tick: 1,
      maxTick: 2,
      ticks: [1, 2],
      nodes: 3,
      edges: 2,
      patchCount: 1,
      perWriter,
    };

    const output = stripAnsi(renderSeekView(payload));

    expect(output).toContain('alice');
    expect(output).toContain('3 nodes, 2 edges');
  });
});
