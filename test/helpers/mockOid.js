/**
 * Generates a valid 40-character hex OID for use in test mocks.
 *
 * Converts the tag to hex where possible and pads to 40 chars.
 * Deterministic: same tag always produces the same OID.
 *
 * @param {string} tag - A human-readable label (e.g. 'meta', 'blob-1', 'frontier')
 * @returns {string} A valid 40-character lowercase hex string
 *
 * @example
 * mockOid('meta')     // '6d657461000000000000000000000000000000000'
 * mockOid('blob-1')   // '626c6f622d310000000000000000000000000000'
 */
export function mockOid(tag) {
  const hex = Buffer.from(tag, 'utf8').toString('hex');
  return hex.slice(0, 40).padEnd(40, '0');
}
