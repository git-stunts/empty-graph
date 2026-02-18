import IndexError from './IndexError.js';

/**
 * Error thrown when shard validation fails.
 *
 * This error indicates that a shard file failed validation checks,
 * where expected values do not match actual values for specific fields.
 *
 * @class ShardValidationError
 * @extends IndexError
 *
 * @property {string} name - The error name ('ShardValidationError')
 * @property {string} code - Error code ('SHARD_VALIDATION_ERROR')
 * @property {string} shardPath - Path to the shard file that failed validation
 * @property {*} expected - The expected value for the field
 * @property {*} actual - The actual value found in the shard
 * @property {string} field - The field that failed validation (e.g., 'checksum', 'version')
 * @property {Record<string, unknown>} context - Serializable context object for debugging
 *
 * @example
 * if (shard.version !== EXPECTED_VERSION) {
 *   throw new ShardValidationError('Shard version mismatch', {
 *     shardPath: '/path/to/shard',
 *     expected: EXPECTED_VERSION,
 *     actual: shard.version,
 *     field: 'version'
 *   });
 * }
 */
export default class ShardValidationError extends IndexError {
  /**
   * Creates a new ShardValidationError.
   *
   * @param {string} message - Human-readable error message
   * @param {{ shardPath?: string, expected?: *, actual?: *, field?: string, context?: Record<string, unknown> }} [options={}] - Error options
   */
  constructor(message, options = {}) {
    const context = {
      ...options.context,
      shardPath: options.shardPath,
      expected: options.expected,
      actual: options.actual,
      field: options.field,
    };

    super(message, {
      code: 'SHARD_VALIDATION_ERROR',
      context,
    });

    this.shardPath = options.shardPath;
    this.expected = options.expected;
    this.actual = options.actual;
    this.field = options.field;
  }
}
