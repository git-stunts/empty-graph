/**
 * Base error class for all WARP domain errors.
 *
 * Provides shared constructor logic: name (from constructor), code,
 * context, and stack trace capture. Subclasses reduce to a one-line
 * constructor calling super(message, defaultCode, options).
 *
 * @class WarpError
 * @extends Error
 *
 * @property {string} name - Error name (set from constructor.name)
 * @property {string} code - Machine-readable error code
 * @property {Record<string, unknown>} context - Serializable context for debugging
 */
export default class WarpError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {string} defaultCode - Default error code if not overridden by options
   * @param {{ code?: string, context?: Record<string, unknown> }} [options={}] - Error options
   */
  constructor(message, defaultCode, options = {}) {
    super(message);
    const opts = options || {};
    this.name = this.constructor.name;
    this.code = opts.code || defaultCode;
    this.context = opts.context || {};
    Error.captureStackTrace?.(this, this.constructor);
  }
}
