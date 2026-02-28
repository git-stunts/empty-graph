/**
 * Default codec implementation for domain services.
 *
 * Provides canonical CBOR encoding/decoding using cbor-x directly,
 * avoiding concrete adapter imports from the infrastructure layer.
 * This follows the same pattern as defaultClock.js.
 *
 * Keys are recursively sorted before encoding for deterministic output,
 * which is critical for content-addressed storage (Git SHA matching).
 *
 * @module domain/utils/defaultCodec
 */

import { Encoder, decode as cborDecode } from 'cbor-x';

const encoder = new Encoder({
  useRecords: false,
  mapsAsObjects: true,
});

/**
 * Recursively sorts object keys for deterministic CBOR encoding.
 * @param {unknown} value - The value to sort keys of
 * @returns {unknown} The value with sorted keys
 */
function sortKeys(value) {
  if (value === null || value === undefined) { return value; }
  if (Array.isArray(value)) { return value.map(sortKeys); }
  if (value instanceof Map) {
    /** @type {Record<string, unknown>} */
    const sorted = {};
    for (const key of Array.from(value.keys()).sort()) {
      sorted[key] = sortKeys(value.get(key));
    }
    return sorted;
  }
  if (typeof value === 'object' && (/** @type {Record<string, unknown>} */ (value).constructor === Object || /** @type {Record<string, unknown>} */ (value).constructor === undefined)) {
    /** @type {Record<string, unknown>} */
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(/** @type {Record<string, unknown>} */ (value)[key]);
    }
    return sorted;
  }
  return value;
}

/** @type {import('../../ports/CodecPort.js').default} */
const defaultCodec = {
  encode(data) {
    return encoder.encode(sortKeys(data));
  },
  decode(buffer) {
    return cborDecode(buffer);
  },
};

export default defaultCodec;
