/**
 * Canonical CBOR encoding/decoding.
 *
 * Delegates to defaultCodec which already sorts keys recursively
 * and handles Maps, null-prototype objects, and arrays.
 *
 * Deterministic output relies on cbor-x's key-sorting behaviour,
 * which approximates RFC 7049 Section 3.9 (Canonical CBOR) by sorting
 * map keys in length-first lexicographic order. This is sufficient for
 * content-addressed equality within the WARP system but should not be
 * assumed to match other canonical CBOR implementations byte-for-byte.
 *
 * @module domain/utils/canonicalCbor
 */

import defaultCodec from './defaultCodec.js';

/**
 * Encodes a value to canonical CBOR bytes with sorted keys.
 *
 * @param {unknown} value - The value to encode
 * @returns {Uint8Array} CBOR-encoded bytes
 */
export function encodeCanonicalCbor(value) {
  return defaultCodec.encode(value);
}

/**
 * Decodes CBOR bytes to a value.
 *
 * @param {Buffer|Uint8Array} buffer - CBOR bytes
 * @returns {unknown} Decoded value
 */
export function decodeCanonicalCbor(buffer) {
  return defaultCodec.decode(buffer);
}
