/**
 * Error thrown when a patch contains operations unsupported by the current schema version.
 *
 * This error is raised during sync when a v2 reader encounters edge property ops
 * (schema v3 feature) that it cannot process. Failing fast prevents silent data
 * corruption — edge properties would be dropped without this guard.
 *
 * @class SchemaUnsupportedError
 * @extends Error
 *
 * @property {string} name - The error name ('SchemaUnsupportedError')
 * @property {string} code - Error code ('E_SCHEMA_UNSUPPORTED')
 * @property {Object} context - Serializable context object for debugging
 *
 * @example
 * throw new SchemaUnsupportedError(
 *   'Upgrade to >=7.3.0 (WEIGHTED) to sync edge properties.',
 *   { context: { patchSchema: 3, localSchema: 2 } }
 * );
 */
export default class SchemaUnsupportedError extends Error {
  /**
   * Creates a new SchemaUnsupportedError.
   *
   * @param {string} message - Human-readable error message
   * @param {Object} [options={}] - Error options
   * @param {Object} [options.context={}] - Serializable context for debugging
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'SchemaUnsupportedError';
    this.code = 'E_SCHEMA_UNSUPPORTED';
    this.context = options.context || {};
    Error.captureStackTrace?.(this, this.constructor);
  }
}
