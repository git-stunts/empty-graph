import IndexError from './IndexError.js';

/**
 * Thrown when a shard's local ID counter exceeds 2^24.
 *
 * Each shard byte supports up to 2^24 local IDs. When this limit
 * is reached, no more nodes can be registered in that shard.
 *
 * @class ShardIdOverflowError
 * @extends IndexError
 */
export default class ShardIdOverflowError extends IndexError {
  /**
   * @param {string} message
   * @param {{ shardKey: string, nextLocalId: number }} context
   */
  constructor(message, { shardKey, nextLocalId }) {
    super(message, {
      code: 'E_SHARD_ID_OVERFLOW',
      context: { shardKey, nextLocalId },
    });
  }
}
