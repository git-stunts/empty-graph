/**
 * Synchronous SHA-1 for browser use with InMemoryGraphAdapter.
 *
 * NOT used for security — only for Git content addressing.
 */

/**
 * Computes a SHA-1 hash of the given data, returning a 40-character
 * lowercase hex string.
 *
 * @param data - The data to hash
 * @returns 40-character lowercase hex SHA-1 digest
 */
export function sha1sync(data: Uint8Array): string;
