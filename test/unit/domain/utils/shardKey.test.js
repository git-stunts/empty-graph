import { describe, it, expect } from 'vitest';
import computeShardKey from '../../../../src/domain/utils/shardKey.js';
import { F11_SHARDKEY_VECTORS } from '../../../helpers/fixtureDsl.js';

describe('computeShardKey', () => {
  it('matches F11 shard key vectors', () => {
    for (const { input, expectedShardKey } of F11_SHARDKEY_VECTORS.shardKeys) {
      expect(computeShardKey(input)).toBe(expectedShardKey);
    }
  });

  it('40-char hex SHA uses first 2 chars lowercase', () => {
    const sha40 = 'abcdef1234567890abcdef1234567890abcdef12';
    expect(computeShardKey(sha40)).toBe('ab');
  });

  it('64-char hex SHA uses first 2 chars lowercase', () => {
    const sha64 = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    expect(computeShardKey(sha64)).toBe('ab');
  });

  it('uppercase hex SHA is case-insensitive', () => {
    const upper = 'ABCDEF1234567890ABCDEF1234567890ABCDEF12';
    expect(computeShardKey(upper)).toBe('ab');
  });

  it('non-hex 40-char string uses FNV-1a path', () => {
    // 40 chars but contains non-hex characters
    const nonHex = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
    const result = computeShardKey(nonHex);
    expect(result).toHaveLength(2);
    // Should NOT be 'zz' since 'z' is not hex
    expect(result).not.toBe('zz');
  });

  it('always produces 2-char zero-padded output', () => {
    const inputs = ['', 'a', 'user:alice', '__proto__', 'short', 'x'.repeat(100)];
    for (const input of inputs) {
      const key = computeShardKey(input);
      expect(key).toHaveLength(2);
      expect(key).toMatch(/^[0-9a-f]{2}$/);
    }
  });
});
