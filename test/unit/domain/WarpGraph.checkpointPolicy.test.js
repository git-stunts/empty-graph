import { describe, it, expect, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';

function createMockPersistence() {
  return {
    readRef: vi.fn(),
    showNode: vi.fn(),
    writeBlob: vi.fn(),
    writeTree: vi.fn(),
    readBlob: vi.fn(),
    readTreeOids: vi.fn(),
    commitNode: vi.fn(),
    commitNodeWithTree: vi.fn(),
    updateRef: vi.fn(),
    listRefs: vi.fn().mockResolvedValue([]),
    getNodeInfo: vi.fn(),
    ping: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
  };
}

describe('WarpGraph checkpointPolicy (AP/CKPT/1)', () => {
  it('stores checkpointPolicy when opened with { every: 500 }', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      checkpointPolicy: { every: 500 },
    });

    expect(graph._checkpointPolicy).toEqual({ every: 500 });
  });

  it('accepts minimum valid value { every: 1 }', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      checkpointPolicy: { every: 1 },
    });

    expect(graph._checkpointPolicy).toEqual({ every: 1 });
  });

  it('defaults _checkpointPolicy to null when not provided', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
    });

    expect(graph._checkpointPolicy).toBeNull();
  });

  it('rejects every: 0', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: { every: 0 },
      })
    ).rejects.toThrow('checkpointPolicy.every must be a positive integer');
  });

  it('rejects every: -1', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: { every: -1 },
      })
    ).rejects.toThrow('checkpointPolicy.every must be a positive integer');
  });

  it('rejects every: "foo" (non-integer string)', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: { every: 'foo' },
      })
    ).rejects.toThrow('checkpointPolicy.every must be a positive integer');
  });

  it('rejects every: 1.5 (non-integer float)', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: { every: 1.5 },
      })
    ).rejects.toThrow('checkpointPolicy.every must be a positive integer');
  });

  it('rejects checkpointPolicy that is not an object', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        checkpointPolicy: 'auto',
      })
    ).rejects.toThrow('checkpointPolicy must be an object with { every: number }');
  });

  it('treats checkpointPolicy: null as no policy', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      checkpointPolicy: null,
    });

    expect(graph._checkpointPolicy).toBeNull();
  });
});
