/**
 * Default crypto implementation for domain services.
 *
 * Provides SHA hashing, HMAC, and timing-safe comparison using
 * node:crypto directly, avoiding concrete adapter imports from
 * the infrastructure layer. This follows the same pattern as
 * defaultCodec.js and defaultClock.js.
 *
 * Since git-warp requires Git (and therefore Node 20+, Deno, or Bun),
 * node:crypto is always available.
 *
 * @module domain/utils/defaultCrypto
 */

import {
  createHash,
  createHmac,
  timingSafeEqual as nodeTimingSafeEqual,
} from 'node:crypto';

/** @type {import('../../ports/CryptoPort.js').default} */
const defaultCrypto = {
  // eslint-disable-next-line @typescript-eslint/require-await -- async matches CryptoPort contract
  async hash(algorithm, data) {
    return createHash(algorithm).update(data).digest('hex');
  },
  // eslint-disable-next-line @typescript-eslint/require-await -- async matches CryptoPort contract
  async hmac(algorithm, key, data) {
    return createHmac(algorithm, key).update(data).digest();
  },
  timingSafeEqual(a, b) {
    return nodeTimingSafeEqual(a, b);
  },
};

export default defaultCrypto;
