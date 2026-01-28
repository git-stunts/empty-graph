import { describe, it, expect, vi, beforeEach } from 'vitest';
import BitmapIndexReader from '../../../../src/domain/services/BitmapIndexReader.js';
import BitmapIndexBuilder from '../../../../src/domain/services/BitmapIndexBuilder.js';
import { ShardLoadError, ShardCorruptionError, ShardValidationError } from '../../../../src/domain/errors/index.js';

describe('BitmapIndexReader', () => {
  let mockStorage;
  let reader;

  beforeEach(() => {
    mockStorage = {
      readBlob: vi.fn(),
    };
    reader = new BitmapIndexReader({ storage: mockStorage });
  });

  describe('setup', () => {
    it('stores shard OIDs for lazy loading', () => {
      reader.setup({ 'meta_aa.json': 'oid1', 'shards_fwd_aa.json': 'oid2' });
      expect(reader.shardOids.size).toBe(2);
    });

    it('clears cache when called', () => {
      reader._idToShaCache = ['test'];
      reader.loadedShards.set('test', {});

      reader.setup({});

      expect(reader._idToShaCache).toBeNull();
      expect(reader.loadedShards.size).toBe(0);
    });
  });

  describe('getParents / getChildren', () => {
    it('returns empty array for unknown SHA', async () => {
      reader.setup({});
      const parents = await reader.getParents('unknown');
      expect(parents).toEqual([]);
    });

    it('loads and decodes bitmap data', async () => {
      // Build a real index
      const builder = new BitmapIndexBuilder();
      builder.addEdge('aabbccdd', 'eeffgghh');
      const tree = builder.serialize();

      // Mock storage to return serialized data
      mockStorage.readBlob.mockImplementation(async (oid) => {
        if (oid === 'meta-oid') return tree['meta_aa.json'] || tree['meta_ee.json'];
        if (oid === 'rev-oid') return tree['shards_rev_ee.json'];
        return Buffer.from('{}');
      });

      reader.setup({
        'meta_aa.json': 'meta-oid',
        'meta_ee.json': 'meta-oid',
        'shards_rev_ee.json': 'rev-oid',
      });

      const parents = await reader.getParents('eeffgghh');
      expect(parents).toContain('aabbccdd');
    });
  });

  describe('lookupId', () => {
    it('returns undefined for unknown SHA', async () => {
      reader.setup({});
      const id = await reader.lookupId('unknown');
      expect(id).toBeUndefined();
    });
  });

  describe('corrupt shard recovery', () => {
    it('throws ShardLoadError when shard OID points to non-existent blob', async () => {
      mockStorage.readBlob.mockRejectedValue(new Error('object not found'));

      reader.setup({
        'meta_ab.json': 'nonexistent-oid',
        'shards_rev_ab.json': 'also-nonexistent'
      });

      await expect(reader.getParents('abcd1234')).rejects.toThrow(ShardLoadError);
    });

    it('returns empty array when shard contains invalid JSON', async () => {
      mockStorage.readBlob.mockResolvedValue(Buffer.from('not valid json {{{'));

      reader.setup({
        'meta_ab.json': 'corrupt-oid',
        'shards_rev_ab.json': 'corrupt-oid'
      });

      const parents = await reader.getParents('abcd1234');
      expect(parents).toEqual([]);
    });

    it('returns empty array when shard contains wrong data type', async () => {
      // Valid JSON but wrong structure (array instead of object)
      mockStorage.readBlob.mockResolvedValue(Buffer.from('[1,2,3]'));

      reader.setup({
        'shards_rev_ab.json': 'wrong-type-oid'
      });

      const parents = await reader.getParents('abcd1234');
      expect(parents).toEqual([]);
    });

    it('throws ShardLoadError on storage failure but continues after', async () => {
      // Build a real index for comparison
      const builder = new BitmapIndexBuilder();
      builder.addEdge('aabbccdd', 'eeffgghh');
      const tree = builder.serialize();

      let callCount = 0;
      mockStorage.readBlob.mockImplementation(async (oid) => {
        callCount++;
        // First call fails, subsequent calls succeed
        if (callCount === 1) {
          throw new Error('transient failure');
        }
        // Return real data for subsequent calls
        if (oid === 'meta-oid') return tree['meta_aa.json'] || tree['meta_ee.json'];
        if (oid === 'rev-oid') return tree['shards_rev_ee.json'];
        return Buffer.from('{}');
      });

      reader.setup({
        'meta_aa.json': 'meta-oid',
        'meta_ee.json': 'meta-oid',
        'shards_rev_ee.json': 'rev-oid',
        'shards_rev_aa.json': 'corrupt-oid' // This one fails
      });

      // First query hits storage error - should throw ShardLoadError
      await expect(reader.getParents('aabbccdd')).rejects.toThrow(ShardLoadError);

      // Reader should still be functional for other queries
      // (the reader wasn't corrupted by the error)
      expect(reader.shardOids.size).toBe(4);
    });

    it('in strict mode throws ShardValidationError on version mismatch', async () => {
      const strictReader = new BitmapIndexReader({ storage: mockStorage, strict: true });
      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify({
        version: 999, // Wrong version
        checksum: 'abc',
        data: {}
      })));

      strictReader.setup({
        'shards_rev_ab.json': 'bad-version-oid'
      });

      await expect(strictReader.getParents('abcd1234')).rejects.toThrow(ShardValidationError);
    });

    it('in strict mode throws ShardCorruptionError on invalid format', async () => {
      const strictReader = new BitmapIndexReader({ storage: mockStorage, strict: true });
      mockStorage.readBlob.mockResolvedValue(Buffer.from('not valid json {{{'));

      strictReader.setup({
        'shards_rev_ab.json': 'corrupt-oid'
      });

      await expect(strictReader.getParents('abcd1234')).rejects.toThrow(ShardCorruptionError);
    });

    it('in strict mode throws ShardValidationError on checksum mismatch', async () => {
      const strictReader = new BitmapIndexReader({ storage: mockStorage, strict: true });
      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify({
        version: 1,
        checksum: 'wrong-checksum-value',
        data: { someKey: 'someValue' }
      })));

      strictReader.setup({
        'meta_ab.json': 'bad-checksum-oid'
      });

      await expect(strictReader.lookupId('abcd1234')).rejects.toThrow(ShardValidationError);
    });

    it('error objects contain useful context for debugging', async () => {
      const strictReader = new BitmapIndexReader({ storage: mockStorage, strict: true });
      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify({
        version: 999,
        checksum: 'abc',
        data: {}
      })));

      strictReader.setup({
        'shards_fwd_cd.json': 'context-test-oid'
      });

      try {
        await strictReader.getChildren('cdcd1234');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ShardValidationError);
        expect(err.code).toBe('SHARD_VALIDATION_ERROR');
        expect(err.field).toBe('version');
        expect(err.expected).toBe(1);
        expect(err.actual).toBe(999);
        expect(err.shardPath).toBe('shards_fwd_cd.json');
      }
    });

    it('ShardLoadError contains cause and context', async () => {
      const originalError = new Error('network timeout');
      mockStorage.readBlob.mockRejectedValue(originalError);

      reader.setup({
        'meta_ef.json': 'network-fail-oid'
      });

      try {
        await reader.lookupId('efgh5678');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ShardLoadError);
        expect(err.code).toBe('SHARD_LOAD_ERROR');
        expect(err.shardPath).toBe('meta_ef.json');
        expect(err.oid).toBe('network-fail-oid');
        expect(err.cause).toBe(originalError);
      }
    });

    it('non-strict mode returns empty but strict mode throws for same corruption', async () => {
      const corruptData = Buffer.from('{"not": "a valid shard format"}');

      // Non-strict reader (default)
      const nonStrictReader = new BitmapIndexReader({ storage: mockStorage, strict: false });
      mockStorage.readBlob.mockResolvedValue(corruptData);
      nonStrictReader.setup({ 'shards_rev_ab.json': 'corrupt-oid' });

      const nonStrictResult = await nonStrictReader.getParents('abcd1234');
      expect(nonStrictResult).toEqual([]); // Graceful degradation

      // Strict reader
      const strictReader = new BitmapIndexReader({ storage: mockStorage, strict: true });
      strictReader.setup({ 'shards_rev_ab.json': 'corrupt-oid' });

      await expect(strictReader.getParents('abcd1234')).rejects.toThrow(ShardValidationError);
    });
  });
});
