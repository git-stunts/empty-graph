import { describe, it, expect, vi, beforeEach } from 'vitest';
import CacheRebuildService from '../../../../src/domain/services/CacheRebuildService.js';
import GraphNode from '../../../../src/domain/entities/GraphNode.js';

describe('CacheRebuildService', () => {
  let service;
  let mockPersistence;
  let mockGraphService;

  beforeEach(() => {
    mockPersistence = {
      writeBlob: vi.fn().mockResolvedValue('blob-oid'),
      writeTree: vi.fn().mockResolvedValue('tree-oid'),
    };
    mockGraphService = {
      listNodes: vi.fn().mockResolvedValue([
        new GraphNode({ sha: 'sha1', message: 'msg1' }),
        new GraphNode({ sha: 'sha2', message: 'msg2' })
      ])
    };
    service = new CacheRebuildService({ 
      persistence: mockPersistence, 
      graphService: mockGraphService 
    });
  });

  it('rebuilds the index and persists it', async () => {
    const treeOid = await service.rebuild('main');
    
    expect(mockGraphService.listNodes).toHaveBeenCalledWith({ ref: 'main', limit: 100000 });
    expect(mockPersistence.writeBlob).toHaveBeenCalled();
    expect(mockPersistence.writeTree).toHaveBeenCalled();
    expect(treeOid).toBe('tree-oid');
  });
});
