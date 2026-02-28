/**
 * Recursively stringifies a value with sorted object keys for deterministic output.
 * Used for computing checksums that must match across builders and readers.
 *
 * Matches JSON.stringify semantics:
 * - Top-level undefined returns "null"
 * - Array elements that are undefined/function/symbol become "null"
 * - Object properties with undefined/function/symbol values are omitted
 *
 * Throws TypeError on circular references rather than stack-overflowing.
 *
 * @param {unknown} value - Any JSON-serializable value
 * @returns {string} Canonical JSON string with sorted keys
 */
export function canonicalStringify(value) {
  return _canonicalStringify(value, new WeakSet());
}

/**
 * Internal recursive helper with cycle detection.
 *
 * @param {unknown} value - Any JSON-serializable value
 * @param {WeakSet<object>} seen - Set of already-visited objects for cycle detection
 * @returns {string} Canonical JSON string with sorted keys
 * @private
 */
function _canonicalStringify(value, seen) {
  if (value === undefined) {
    return 'null';
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError('Circular reference detected in canonicalStringify');
    }
    seen.add(value);
    // Map elements: undefined/function/symbol -> "null", others recurse
    const elements = value.map(el => {
      if (el === undefined || typeof el === 'function' || typeof el === 'symbol') {
        return 'null';
      }
      return _canonicalStringify(el, seen);
    });
    return `[${elements.join(',')}]`;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new TypeError('Circular reference detected in canonicalStringify');
    }
    seen.add(value);
    const obj = /** @type {Record<string, unknown>} */ (value);
    // Filter out keys with undefined/function/symbol values, then sort
    const keys = Object.keys(obj)
      .filter(k => {
        const v = obj[k];
        return v !== undefined && typeof v !== 'function' && typeof v !== 'symbol';
      })
      .sort();
    const pairs = keys.map(k => `${JSON.stringify(k)}:${_canonicalStringify(obj[k], seen)}`);
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(value);
}
