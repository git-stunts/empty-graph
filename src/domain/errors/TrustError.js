import WarpError from './WarpError.js';

/**
 * Error class for trust operations.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_TRUST_UNSUPPORTED_ALGORITHM` | Algorithm is not `ed25519` |
 * | `E_TRUST_INVALID_KEY` | Public key is malformed (wrong length or bad base64) |
 * | `E_TRUST_CAS_CONFLICT` | Concurrent append advanced the trust chain; caller must rebuild + re-sign |
 * | `E_TRUST_CAS_EXHAUSTED` | CAS retry budget exhausted (transient failures) |
 * | `TRUST_ERROR` | Generic/default trust error |
 *
 * @class TrustError
 * @extends WarpError
 *
 * @property {string} name - Always 'TrustError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Object} context - Serializable context object with error details
 */
export default class TrustError extends WarpError {
  /**
   * @param {string} message
   * @param {{ code?: string, context?: Record<string, unknown> }} [options={}]
   */
  constructor(message, options = {}) {
    super(message, 'TRUST_ERROR', options);
  }
}
