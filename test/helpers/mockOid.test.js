import { describe, it, expect } from 'vitest';
import { mockOid } from './mockOid.js';

describe('mockOid', () => {
  it('returns a 40-character string', () => {
    expect(mockOid('test')).toHaveLength(40);
  });

  it('returns valid hex characters only', () => {
    expect(mockOid('hello-world')).toMatch(/^[0-9a-f]{40}$/);
  });

  it('is deterministic', () => {
    expect(mockOid('foo')).toBe(mockOid('foo'));
  });

  it('produces different OIDs for different tags', () => {
    expect(mockOid('alpha')).not.toBe(mockOid('beta'));
  });

  it('handles empty string', () => {
    const oid = mockOid('');
    expect(oid).toHaveLength(40);
    expect(oid).toMatch(/^[0-9a-f]{40}$/);
  });

  it('truncates long tags to 40 hex chars', () => {
    const longTag = 'a'.repeat(100);
    expect(mockOid(longTag)).toHaveLength(40);
  });
});
