import IndexError from './IndexError.js';

/**
 * Error thrown when shard data is corrupted or invalid.
 *
 * This error indicates that a shard file contains invalid or corrupted data,
 * such as invalid checksums, unsupported versions, or malformed content.
 *
 * @class ShardCorruptionError
 * @extends IndexError
 *
 * @property {string} name - The error name ('ShardCorruptionError')
 * @property {string} code - Error code ('SHARD_CORRUPTION_ERROR')
 * @property {string} shardPath - Path to the corrupted shard file
 * @property {string} oid - Object ID associated with the shard
 * @property {string} reason - Reason for corruption (e.g., 'invalid_checksum', 'invalid_version', 'parse_error')
 * @property {Record<string, unknown>} context - Serializable context object for debugging
 *
 * @example
 * if (!validateChecksum(data)) {
 *   throw new ShardCorruptionError('Shard checksum mismatch', {
 *     shardPath: '/path/to/shard',
 *     oid: 'abc123',
 *     reason: 'invalid_checksum'
 *   });
 * }
 */
export default class ShardCorruptionError extends IndexError {
  /**
   * Creates a new ShardCorruptionError.
   *
   * @param {string} message - Human-readable error message
   * @param {{ shardPath?: string, oid?: string, reason?: string, context?: Record<string, unknown> }} [options={}] - Error options
   */
  constructor(message, options = {}) {
    const context = {
      ...options.context,
      shardPath: options.shardPath,
      oid: options.oid,
      reason: options.reason,
    };

    super(message, {
      code: 'SHARD_CORRUPTION_ERROR',
      context,
    });

    this.shardPath = options.shardPath;
    this.oid = options.oid;
    this.reason = options.reason;
  }
}
