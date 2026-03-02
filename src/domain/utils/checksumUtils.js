/**
 * Shared checksum utility for bitmap index builders.
 *
 * Extracted from BitmapIndexBuilder and StreamingBitmapIndexBuilder
 * to eliminate the duplicated computeChecksum function (B136).
 *
 * @module domain/utils/checksumUtils
 * @private
 */

import { canonicalStringify } from './canonicalStringify.js';

/**
 * Computes a SHA-256 checksum of the given data.
 * Uses canonical JSON stringification for deterministic output
 * across different JavaScript engines.
 *
 * @param {Record<string, unknown>} data - The data object to checksum
 * @param {import('../../ports/CryptoPort.js').default} crypto - CryptoPort instance
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export const computeChecksum = async (data, crypto) => {
  const json = canonicalStringify(data);
  return await crypto.hash('sha256', json);
};
