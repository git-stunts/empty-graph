/**
 * CBOR Codec with Canonical/Deterministic Encoding
 *
 * Wraps cbor-x to provide canonical CBOR encoding where:
 * - Map keys are always sorted lexicographically
 * - Same input always produces identical bytes
 *
 * cbor-x does not have built-in canonical encoding, so we
 * recursively sort object keys before encoding.
 */

import { Encoder, decode as cborDecode } from 'cbor-x';

// Configure cbor-x encoder
// - useRecords: false - don't use record extension, encode as standard CBOR maps
// - mapsAsObjects: true - decode CBOR maps as JavaScript objects
const encoder = new Encoder({
  useRecords: false,
  mapsAsObjects: true,
});

/**
 * Recursively sorts object keys to ensure deterministic encoding.
 * Arrays are preserved but their object elements are also sorted.
 *
 * @param {unknown} value - The value to sort
 * @returns {unknown} - Value with all object keys sorted
 */
function sortKeys(value) {
  if (value === null || value === undefined) {
    return value;
  }

  // Handle arrays - recursively sort elements
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  // Handle plain objects - sort keys and recursively process values
  if (typeof value === 'object' && value.constructor === Object) {
    const sorted = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  }

  // Handle Map instances - convert to sorted object
  if (value instanceof Map) {
    const sorted = {};
    const keys = Array.from(value.keys()).sort();
    for (const key of keys) {
      sorted[key] = sortKeys(value.get(key));
    }
    return sorted;
  }

  // Primitive values (number, string, boolean, bigint) pass through
  return value;
}

/**
 * Encode data to canonical CBOR bytes.
 *
 * Keys are sorted lexicographically to ensure deterministic output.
 * Same input will always produce identical bytes.
 *
 * @param {unknown} data - The data to encode
 * @returns {Buffer} - CBOR-encoded bytes
 */
export function encode(data) {
  const sorted = sortKeys(data);
  return encoder.encode(sorted);
}

/**
 * Decode CBOR bytes to JavaScript value.
 *
 * @param {Buffer|Uint8Array} buffer - CBOR-encoded bytes
 * @returns {unknown} - Decoded JavaScript value
 */
export function decode(buffer) {
  return cborDecode(buffer);
}

export default { encode, decode };
