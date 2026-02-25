import { describe, it, expect } from 'vitest';
import fnv1a from '../../../../src/domain/utils/fnv1a.js';
import { F11_SHARDKEY_VECTORS } from '../../../helpers/fixtureDsl.js';

describe('fnv1a', () => {
  it('matches known FNV-1a 32-bit vectors (F11)', () => {
    for (const { input, hash } of F11_SHARDKEY_VECTORS.vectors) {
      expect(fnv1a(input)).toBe(hash);
    }
  });

  it('empty string returns FNV offset basis', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
  });

  it('output is always unsigned (>= 0)', () => {
    // Test a variety of inputs including ones that could produce negative with signed int
    const inputs = ['', 'a', 'foobar', 'user:alice', '__proto__', 'longstringrepeated'.repeat(50)];
    for (const s of inputs) {
      expect(fnv1a(s)).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses Math.imul semantics (diverges from naive multiply at large values)', () => {
    // With naive multiply (no overflow handling), results would differ.
    // Math.imul correctly wraps to 32 bits.
    const result = fnv1a('foobar');
    expect(result).toBe(0xbf9cf968);
  });
});
