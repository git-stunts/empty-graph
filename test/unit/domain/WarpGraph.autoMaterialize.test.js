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

describe('WarpGraph autoMaterialize option (AP/LAZY/1)', () => {
  it('stores flag when opened with autoMaterialize: true', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: true,
    });

    expect(graph._autoMaterialize).toBe(true);
  });

  it('stores flag when opened with autoMaterialize: false', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: false,
    });

    expect(graph._autoMaterialize).toBe(false);
  });

  it('defaults to false when autoMaterialize is not provided', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
    });

    expect(graph._autoMaterialize).toBe(false);
  });

  it('defaults to false when autoMaterialize is explicitly undefined', async () => {
    const graph = await WarpGraph.open({
      persistence: createMockPersistence(),
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: undefined,
    });

    expect(graph._autoMaterialize).toBe(false);
  });

  it('rejects autoMaterialize: "yes" (string)', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: 'yes',
      }),
    ).rejects.toThrow('autoMaterialize must be a boolean');
  });

  it('rejects autoMaterialize: 1 (number)', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: 1,
      }),
    ).rejects.toThrow('autoMaterialize must be a boolean');
  });

  it('rejects autoMaterialize: null', async () => {
    await expect(
      WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: null,
      }),
    ).rejects.toThrow('autoMaterialize must be a boolean');
  });
});
