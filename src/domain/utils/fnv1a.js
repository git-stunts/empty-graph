/**
 * FNV-1a 32-bit hash function.
 *
 * Used for shard key computation when the input is not a hex SHA.
 * Uses Math.imul for correct 32-bit multiplication semantics.
 *
 * @note Callers with non-ASCII node IDs should normalize to NFC before
 * hashing to ensure consistent shard placement.
 *
 * @param {string} str - Input string
 * @returns {number} Unsigned 32-bit FNV-1a hash
 */
export default function fnv1a(str) {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0; // Ensure unsigned
}
