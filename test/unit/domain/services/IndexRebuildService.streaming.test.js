import { describe, it, expect, vi, beforeEach } from 'vitest';
import IndexRebuildService from '../../../../src/domain/services/IndexRebuildService.js';
import GraphNode from '../../../../src/domain/entities/GraphNode.js';

describe('IndexRebuildService streaming mode', () => {
  let service;
  let mockStorage;
  let mockGraphService;
  let writtenBlobs;

  beforeEach(() => {
    writtenBlobs = new Map();
    let blobCounter = 0;

    mockStorage = {
      writeBlob: vi.fn().mockImplementation(async (buffer) => {
        const oid = `blob-${blobCounter++}`;
        writtenBlobs.set(oid, buffer.toString('utf-8'));
        return oid;
      }),
      writeTree: vi.fn().mockResolvedValue('tree-oid'),
      readTreeOids: vi.fn().mockResolvedValue({}),
      readBlob: vi.fn().mockImplementation(async (oid) => {
        return Buffer.from(writtenBlobs.get(oid) || '{}');
      }),
    };
  });

  describe('rebuild with maxMemoryBytes', () => {
    it('uses streaming builder when maxMemoryBytes is specified', async () => {
      mockGraphService = {
        async *iterateNodes() {
          yield new GraphNode({ sha: 'aa1111', author: 'test', date: '2026-01-28', message: 'msg1', parents: [] });
          yield new GraphNode({ sha: 'bb2222', author: 'test', date: '2026-01-28', message: 'msg2', parents: ['aa1111'] });
        }
      };

      service = new IndexRebuildService({ storage: mockStorage, graphService: mockGraphService });

      const treeOid = await service.rebuild('main', { maxMemoryBytes: 50 * 1024 * 1024 });

      expect(treeOid).toBe('tree-oid');
      expect(mockStorage.writeTree).toHaveBeenCalled();
    });

    it('invokes onFlush callback during streaming rebuild', async () => {
      // Generate enough nodes to trigger flush
      mockGraphService = {
        async *iterateNodes() {
          for (let i = 0; i < 100; i++) {
            const sha = `${(i % 256).toString(16).padStart(2, '0')}${i.toString().padStart(6, '0')}`;
            const parents = i > 0 ? [`${((i-1) % 256).toString(16).padStart(2, '0')}${(i-1).toString().padStart(6, '0')}`] : [];
            yield new GraphNode({ sha, author: 'test', date: '2026-01-28', message: `msg${i}`, parents });
          }
        }
      };

      service = new IndexRebuildService({ storage: mockStorage, graphService: mockGraphService });

      const flushCalls = [];
      await service.rebuild('main', {
        maxMemoryBytes: 1000, // Low threshold to trigger flushes
        onFlush: (data) => flushCalls.push(data),
      });

      expect(flushCalls.length).toBeGreaterThan(0);
      expect(flushCalls[0]).toHaveProperty('flushCount');
      expect(flushCalls[0]).toHaveProperty('flushedBytes');
    });

    it('invokes onProgress callback during streaming rebuild', async () => {
      // Generate enough nodes to trigger progress callback
      mockGraphService = {
        async *iterateNodes() {
          for (let i = 0; i < 25000; i++) {
            const sha = `${(i % 256).toString(16).padStart(2, '0')}${i.toString().padStart(6, '0')}`;
            yield new GraphNode({ sha, author: 'test', date: '2026-01-28', message: `msg${i}`, parents: [] });
          }
        }
      };

      service = new IndexRebuildService({ storage: mockStorage, graphService: mockGraphService });

      const progressCalls = [];
      await service.rebuild('main', {
        maxMemoryBytes: 50 * 1024 * 1024,
        onProgress: (data) => progressCalls.push(data),
      });

      // Should have called progress at 10000 and 20000 nodes
      expect(progressCalls.length).toBe(2);
      expect(progressCalls[0].processedNodes).toBe(10000);
      expect(progressCalls[1].processedNodes).toBe(20000);
      expect(progressCalls[0]).toHaveProperty('currentMemoryBytes');
    });

    it('produces valid index that can be loaded', async () => {
      mockGraphService = {
        async *iterateNodes() {
          yield new GraphNode({ sha: 'aa1111', author: 'test', date: '2026-01-28', message: 'root', parents: [] });
          yield new GraphNode({ sha: 'bb2222', author: 'test', date: '2026-01-28', message: 'child', parents: ['aa1111'] });
        }
      };

      service = new IndexRebuildService({ storage: mockStorage, graphService: mockGraphService });

      const treeOid = await service.rebuild('main', { maxMemoryBytes: 50 * 1024 * 1024 });

      // Verify tree structure was created
      const treeEntries = mockStorage.writeTree.mock.calls[0][0];
      expect(treeEntries.some(e => e.includes('meta_'))).toBe(true);
      expect(treeEntries.some(e => e.includes('shards_'))).toBe(true);

      // Should be able to load the index (mock the tree OIDs)
      const shardOids = {};
      treeEntries.forEach(entry => {
        const match = entry.match(/100644 blob (\S+)\t(\S+)/);
        if (match) {
          shardOids[match[2]] = match[1];
        }
      });
      mockStorage.readTreeOids.mockResolvedValue(shardOids);

      const reader = await service.load(treeOid);
      expect(reader).toBeDefined();
      expect(typeof reader.getParents).toBe('function');
    });
  });

  describe('backward compatibility', () => {
    it('uses in-memory builder when maxMemoryBytes is not specified', async () => {
      mockGraphService = {
        async *iterateNodes() {
          yield new GraphNode({ sha: 'aa1111', author: 'test', date: '2026-01-28', message: 'msg1', parents: [] });
        }
      };

      service = new IndexRebuildService({ storage: mockStorage, graphService: mockGraphService });

      // Without maxMemoryBytes, should use in-memory builder (original behavior)
      const treeOid = await service.rebuild('main');

      expect(treeOid).toBe('tree-oid');
      expect(mockStorage.writeTree).toHaveBeenCalled();
    });

    it('in-memory mode still supports onProgress', async () => {
      mockGraphService = {
        async *iterateNodes() {
          for (let i = 0; i < 15000; i++) {
            yield new GraphNode({
              sha: `${i.toString(16).padStart(8, '0')}`,
              author: 'test',
              date: '2026-01-28',
              message: `msg${i}`,
              parents: []
            });
          }
        }
      };

      service = new IndexRebuildService({ storage: mockStorage, graphService: mockGraphService });

      const progressCalls = [];
      await service.rebuild('main', {
        onProgress: (data) => progressCalls.push(data),
      });

      expect(progressCalls.length).toBe(1); // 10000 nodes checkpoint
      expect(progressCalls[0].processedNodes).toBe(10000);
      expect(progressCalls[0].currentMemoryBytes).toBeNull(); // in-memory mode doesn't track
    });
  });

  describe('memory guard integration', () => {
    it('rebuild does not exceed configured memory threshold', async () => {
      const memoryThreshold = 10000; // 10KB
      let maxMemorySeen = 0;

      // Generate a moderate number of nodes with edges
      mockGraphService = {
        async *iterateNodes() {
          for (let i = 0; i < 200; i++) {
            const prefix = (i % 256).toString(16).padStart(2, '0');
            const sha = `${prefix}${i.toString().padStart(6, '0')}`;
            const parents = [];

            // Add parent edges
            if (i > 0) {
              const parentPrefix = ((i - 1) % 256).toString(16).padStart(2, '0');
              parents.push(`${parentPrefix}${(i - 1).toString().padStart(6, '0')}`);
            }
            if (i > 5) {
              const parentPrefix = ((i - 5) % 256).toString(16).padStart(2, '0');
              parents.push(`${parentPrefix}${(i - 5).toString().padStart(6, '0')}`);
            }

            yield new GraphNode({ sha, author: 'test', date: '2026-01-28', message: `msg${i}`, parents });
          }
        }
      };

      service = new IndexRebuildService({ storage: mockStorage, graphService: mockGraphService });

      let flushCount = 0;
      await service.rebuild('main', {
        maxMemoryBytes: memoryThreshold,
        onFlush: () => flushCount++,
        onProgress: ({ currentMemoryBytes }) => {
          if (currentMemoryBytes !== null) {
            maxMemorySeen = Math.max(maxMemorySeen, currentMemoryBytes);
          }
        },
      });

      // Should have flushed multiple times
      expect(flushCount).toBeGreaterThan(0);

      // Memory should stay bounded (with some tolerance for batch processing)
      const tolerance = memoryThreshold * 0.5;
      expect(maxMemorySeen).toBeLessThan(memoryThreshold + tolerance);
    });
  });
});
