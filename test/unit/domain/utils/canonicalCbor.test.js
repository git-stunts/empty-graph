import { describe, it, expect } from 'vitest';
import { encodeCanonicalCbor, decodeCanonicalCbor } from '../../../../src/domain/utils/canonicalCbor.js';

describe('canonicalCbor', () => {
  it('round-trips plain objects', () => {
    const obj = { name: 'alice', age: 30 };
    const bytes = encodeCanonicalCbor(obj);
    expect(decodeCanonicalCbor(bytes)).toEqual(obj);
  });

  it('round-trips arrays', () => {
    const arr = [1, 'two', { three: 3 }];
    const bytes = encodeCanonicalCbor(arr);
    expect(decodeCanonicalCbor(bytes)).toEqual(arr);
  });

  it('round-trips nested objects', () => {
    const nested = { a: { b: { c: [1, 2, 3] } } };
    const bytes = encodeCanonicalCbor(nested);
    expect(decodeCanonicalCbor(bytes)).toEqual(nested);
  });

  it('{z:1, a:2} and {a:2, z:1} produce identical bytes', () => {
    const a = encodeCanonicalCbor({ z: 1, a: 2 });
    const b = encodeCanonicalCbor({ a: 2, z: 1 });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('Map produces same bytes as equivalent sorted object', () => {
    const fromMap = encodeCanonicalCbor(new Map([['z', 1], ['a', 2]]));
    const fromObj = encodeCanonicalCbor({ a: 2, z: 1 });
    expect(Buffer.from(fromMap).equals(Buffer.from(fromObj))).toBe(true);
  });

  it('null-prototype objects round-trip', () => {
    const npo = Object.create(null);
    npo.x = 1;
    npo.a = 2;
    const bytes = encodeCanonicalCbor(npo);
    const decoded = decodeCanonicalCbor(bytes);
    expect(decoded).toEqual({ a: 2, x: 1 });
  });

  it('Uint8Array survives round-trip as binary', () => {
    const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const bytes = encodeCanonicalCbor(data);
    const decoded = decodeCanonicalCbor(bytes);
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect([.../** @type {Uint8Array} */ (decoded)]).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it('round-trips null and primitives', () => {
    for (const val of [null, true, false, 42, -1, 0, 'hello']) {
      expect(decodeCanonicalCbor(encodeCanonicalCbor(val))).toEqual(val);
    }
  });
});
