import WarpError from './WarpError.js';

/**
 * Error class for trust-related failures.
 *
 * @class TrustError
 * @extends WarpError
 *
 * Codes:
 * - E_TRUST_SCHEMA_INVALID  — malformed trust.json or failed Zod validation
 * - E_TRUST_REF_CONFLICT    — CAS mismatch updating trust ref
 * - E_TRUST_PIN_INVALID     — pinned commit does not exist or has invalid content
 * - E_TRUST_NOT_CONFIGURED  — trust ref does not exist
 * - E_TRUST_POLICY_RESERVED — policy value reserved for future release
 * - E_TRUST_EPOCH_REGRESSION — new epoch predates current epoch
 */
export default class TrustError extends WarpError {
  /**
   * @param {string} message
   * @param {{ code?: string, context?: Record<string, *> }} [options]
   */
  constructor(message, options = {}) {
    super(message, 'E_TRUST_SCHEMA_INVALID', options);
  }
}
