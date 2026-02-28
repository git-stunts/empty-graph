import IndexError from './IndexError.js';

/**
 * Error thrown when a storage operation fails.
 *
 * StorageError extends IndexError because storage errors originate from
 * index operations. This hierarchy is intentional — IndexError provides
 * the storage-specific error context.
 *
 * This error indicates that a read or write operation to storage failed,
 * typically due to I/O errors, permission issues, or storage unavailability.
 *
 * @class StorageError
 * @extends IndexError
 *
 * @property {string} name - The error name ('StorageError')
 * @property {string} code - Error code ('STORAGE_ERROR')
 * @property {string} operation - The operation that failed ('read' or 'write')
 * @property {string} oid - Object ID associated with the operation
 * @property {Error} cause - The original error that caused the failure
 * @property {Record<string, unknown>} context - Serializable context object for debugging
 *
 * @example
 * try {
 *   await storage.write(oid, data);
 * } catch (err) {
 *   throw new StorageError('Failed to write to storage', {
 *     operation: 'write',
 *     oid: 'abc123',
 *     cause: err
 *   });
 * }
 */
export default class StorageError extends IndexError {
  /**
   * Creates a new StorageError.
   *
   * Context is merged via Object.assign — duplicate keys from the second
   * argument overwrite the first. Callers should ensure context keys don't
   * collide, or use unique prefixes.
   *
   * @param {string} message - Human-readable error message
   * @param {{ operation?: string, oid?: string, cause?: Error, context?: Record<string, unknown> }} [options={}] - Error options
   */
  constructor(message, options = {}) {
    const context = {
      ...options.context,
      operation: options.operation,
      oid: options.oid,
    };

    super(message, {
      code: 'STORAGE_ERROR',
      context,
    });

    this.operation = options.operation;
    this.oid = options.oid;
    this.cause = options.cause;
  }
}
