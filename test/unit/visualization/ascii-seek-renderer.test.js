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
    // Current tick shown as [0] in header
    expect(output).toContain('[0]');
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
    expect(output).toContain('[5]');
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
    expect(output).toContain('[2]');
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
    expect(output).toContain('(no ticks)');
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

  it('does not duplicate tick 0 when ticks already contains 0', () => {
    const payload = {
      graph: 'zero',
      tick: 0,
      maxTick: 2,
      ticks: [0, 1, 2],
      nodes: 0,
      edges: 0,
      patchCount: 0,
      perWriter: {
        alice: { ticks: [1, 2], tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    // [0] should appear exactly once in the header (no duplicate column)
    const matches = output.match(/\[0\]/g) || [];
    expect(matches.length).toBe(1);
  });

  it('shows relative offsets in column headers', () => {
    const payload = {
      graph: 'offsets',
      tick: 2,
      maxTick: 4,
      ticks: [1, 2, 3, 4],
      nodes: 5,
      edges: 3,
      patchCount: 3,
      perWriter: {
        alice: { ticks: [1, 2, 3, 4], tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    // Header should contain relative labels and the current tick
    expect(output).toContain('[2]');
    expect(output).toContain('-1');
    expect(output).toContain('+1');
    expect(output).toContain('+2');
  });

  it('shows included markers (filled) and excluded markers (open)', () => {
    const payload = {
      graph: 'markers',
      tick: 1,
      maxTick: 2,
      ticks: [1, 2],
      nodes: 5,
      edges: 3,
      patchCount: 2,
      perWriter: {
        alice: {
          ticks: [1, 2],
          tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          tickShas: { 1: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 2: 'cccccccccccccccccccccccccccccccccccccccc' },
        },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    // Should contain filled dot (●) for included patch and open circle (○) for excluded
    expect(output).toContain('\u25CF'); // ●
    expect(output).toContain('\u25CB'); // ○
    // SHA should be from tick 1 (the included tick), not the tip
    expect(output).toContain('bbbbbbb');
  });

  it('renders state deltas when diff is provided', () => {
    const payload = {
      graph: 'delta',
      tick: 2,
      maxTick: 4,
      ticks: [1, 2, 3, 4],
      nodes: 10,
      edges: 15,
      patchCount: 6,
      diff: { nodes: 1, edges: 3 },
      perWriter: {
        alice: { ticks: [1, 2, 3, 4], tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));
    expect(output).toContain('State: 10 nodes (+1), 15 edges (+3), 6 patches');
  });

  it('renders a per-writer tick receipt section when tickReceipt is provided', () => {
    const payload = {
      graph: 'receipt',
      tick: 1,
      maxTick: 2,
      ticks: [1, 2],
      nodes: 3,
      edges: 2,
      patchCount: 2,
      tickReceipt: {
        alice: {
          sha: 'deadbeefaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          opSummary: { NodeAdd: 1, EdgeAdd: 2, PropSet: 0, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 },
        },
        bob: {
          sha: 'cafebabeaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          opSummary: { NodeAdd: 0, EdgeAdd: 0, PropSet: 2, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 },
        },
      },
      perWriter: {
        alice: { ticks: [1, 2], tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        bob: { ticks: [1], tipSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));
    expect(output).toContain('Tick 1:');
    expect(output).toContain('deadbee');
    expect(output).toContain('cafebab');
    expect(output).toContain('+1node');
    expect(output).toContain('+2edge');
    expect(output).toContain('~2prop');
  });

  it('shows current tick marker when tick is not in ticks array', () => {
    // Edge case: cursor references a tick that is absent from ticks
    // (e.g. saved cursor after writer refs changed). The renderer must
    // still show [5] in the header, not fall back to [0].
    const payload = {
      graph: 'orphan',
      tick: 5,
      maxTick: 10,
      ticks: [1, 2, 3, 4, 6, 7, 8, 9, 10],
      nodes: 3,
      edges: 1,
      patchCount: 2,
      perWriter: {
        alice: { ticks: [1, 3, 6, 9], tipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    // The current tick should appear as [5] in the header
    expect(output).toContain('[5]');
    // Should NOT show [0] as current tick
    expect(output).not.toMatch(/\[0\]/);
  });

  it('shows current tick marker when many ticks exceed window and tick is missing', () => {
    // More than MAX_COLS (9) ticks, and currentTick is absent from array
    const payload = {
      graph: 'big',
      tick: 7,
      maxTick: 20,
      ticks: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      nodes: 10,
      edges: 5,
      patchCount: 8,
      perWriter: {
        alice: { ticks: [1, 5, 10, 15, 20], tipSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      },
    };

    const output = stripAnsi(renderSeekView(payload));

    // The current tick 7 should appear as [7] in the header
    expect(output).toContain('[7]');
  });
});
