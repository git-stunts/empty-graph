/**
 * Recursively stringifies a value with sorted object keys for deterministic output.
 * Used for computing checksums that must match across builders and readers.
 *
 * Matches JSON.stringify semantics:
 * - Top-level undefined returns "null"
 * - Array elements that are undefined/function/symbol become "null"
 * - Object properties with undefined/function/symbol values are omitted
 *
 * @param {unknown} value - Any JSON-serializable value
 * @returns {string} Canonical JSON string with sorted keys
 */
export function canonicalStringify(value) {
  if (value === undefined) {
    return 'null';
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    // Map elements: undefined/function/symbol -> "null", others recurse
    const elements = value.map(el => {
      if (el === undefined || typeof el === 'function' || typeof el === 'symbol') {
        return 'null';
      }
      return canonicalStringify(el);
    });
    return `[${elements.join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (value);
    // Filter out keys with undefined/function/symbol values, then sort
    const keys = Object.keys(obj)
      .filter(k => {
        const v = obj[k];
        return v !== undefined && typeof v !== 'function' && typeof v !== 'symbol';
      })
      .sort();
    const pairs = keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`);
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(value);
}
