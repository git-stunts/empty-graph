/**
 * Canonical JSON utilities for deterministic serialization.
 *
 * @module domain/utils/canonicalJson
 */

/**
 * JSON.stringify replacer that sorts object keys alphabetically.
 * Arrays and primitives pass through unchanged.
 *
 * @param {string} _key
 * @param {unknown} value
 * @returns {unknown}
 */
export function sortedReplacer(_key, value) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted = /** @type {Record<string, unknown>} */ ({});
    const obj = /** @type {Record<string, unknown>} */ (value);
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = obj[k];
    }
    return sorted;
  }
  return value;
}

/**
 * Produces a canonical JSON string with deterministic key ordering.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalStringify(value) {
  return JSON.stringify(value, sortedReplacer);
}
