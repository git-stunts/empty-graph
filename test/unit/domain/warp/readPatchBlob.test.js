/**
 * Tests for _readPatchBlob null-guard on readBlob return value.
 *
 * @see src/domain/warp/patch.methods.js
 */

import { describe, it, expect, vi } from 'vitest';
import { _readPatchBlob } from '../../../../src/domain/warp/patch.methods.js';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.js';

/**
 * Builds a minimal mock context for _readPatchBlob.call().
 * Cast to `any` so tsc doesn't require the full WarpGraphWithMixins surface.
 *
 * @param {{ readBlob: import('vitest').Mock }} persistence
 * @param {{ retrieve: import('vitest').Mock }|null} [patchBlobStorage]
 * @returns {*}
 */
function mockCtx(persistence, patchBlobStorage = null) {
  return /** @type {*} */ ({ _persistence: persistence, _patchBlobStorage: patchBlobStorage });
}

describe('_readPatchBlob', () => {
  it('returns blob when readBlob succeeds', async () => {
    const expected = new Uint8Array([1, 2, 3]);
    const ctx = mockCtx({ readBlob: vi.fn().mockResolvedValue(expected) });
    const result = await _readPatchBlob.call(ctx, {
      patchOid: 'a'.repeat(40),
      encrypted: false,
    });
    expect(result).toBe(expected);
  });

  it('throws PersistenceError with E_MISSING_OBJECT when readBlob returns null', async () => {
    const oid = 'dead'.padEnd(40, '0');
    const ctx = mockCtx({ readBlob: vi.fn().mockResolvedValue(null) });
    await expect(
      _readPatchBlob.call(ctx, { patchOid: oid, encrypted: false }),
    ).rejects.toThrow(PersistenceError);

    try {
      await _readPatchBlob.call(ctx, { patchOid: oid, encrypted: false });
    } catch (/** @type {*} */ err) {
      expect(err.code).toBe(PersistenceError.E_MISSING_OBJECT);
      expect(err.message).toContain(oid);
      expect(err.context.oid).toBe(oid);
    }
  });

  it('throws PersistenceError when readBlob returns undefined', async () => {
    const oid = 'b'.repeat(40);
    const ctx = mockCtx({ readBlob: vi.fn().mockResolvedValue(undefined) });
    await expect(
      _readPatchBlob.call(ctx, { patchOid: oid, encrypted: false }),
    ).rejects.toThrow(PersistenceError);
  });

  it('delegates to patchBlobStorage for encrypted patches', async () => {
    const expected = new Uint8Array([4, 5, 6]);
    const oid = 'c'.repeat(40);
    const ctx = mockCtx(
      { readBlob: vi.fn() },
      { retrieve: vi.fn().mockResolvedValue(expected) },
    );
    const result = await _readPatchBlob.call(ctx, {
      patchOid: oid,
      encrypted: true,
    });
    expect(result).toBe(expected);
    expect(ctx._persistence.readBlob).not.toHaveBeenCalled();
    expect(ctx._patchBlobStorage.retrieve).toHaveBeenCalledWith(oid);
  });
});
