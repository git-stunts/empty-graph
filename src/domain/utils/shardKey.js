import fnv1a from './fnv1a.js';

const HEX_RE = /^[0-9a-fA-F]{40,64}$/;

/**
 * Computes a 2-character hex shard key for a given ID.
 *
 * For hex SHAs (40+ hex chars), uses the first two characters (lowercased).
 * For all other strings, computes FNV-1a hash and takes the low byte.
 *
 * @param {string} id - Node ID or SHA
 * @returns {string} 2-character lowercase hex shard key (e.g. 'ab', '0f')
 */
export default function computeShardKey(id) {
  if (HEX_RE.test(id)) {
    return id.substring(0, 2).toLowerCase();
  }
  const hash = fnv1a(id);
  return (hash & 0xff).toString(16).padStart(2, '0');
}
