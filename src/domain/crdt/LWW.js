import { compareEventIds } from '../utils/EventId.js';

/**
 * LWW Register - stores value with EventId for conflict resolution
 * @template T
 * @typedef {Object} LWWRegister
 * @property {import('../utils/EventId.js').EventId} eventId
 * @property {T} value
 */

/**
 * Creates an LWW register with the given EventId and value.
 * @template T
 * @param {import('../utils/EventId.js').EventId} eventId
 * @param {T} value
 * @returns {LWWRegister<T>}
 */
export function lwwSet(eventId, value) {
  return { eventId, value };
}

/**
 * Returns the LWW register with the greater EventId.
 * This is the join operation for LWW registers.
 *
 * Properties:
 * - Commutative: lwwMax(a, b) === lwwMax(b, a)
 * - Associative: lwwMax(lwwMax(a, b), c) === lwwMax(a, lwwMax(b, c))
 * - Idempotent: lwwMax(a, a) === a
 *
 * @template T
 * @param {LWWRegister<T> | null | undefined} a
 * @param {LWWRegister<T> | null | undefined} b
 * @returns {LWWRegister<T> | null}
 */
export function lwwMax(a, b) {
  // Handle null/undefined cases
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;

  // Compare EventIds - return the one with greater EventId
  // On equal EventIds, return first argument (deterministic)
  const cmp = compareEventIds(a.eventId, b.eventId);
  return cmp >= 0 ? a : b;
}

/**
 * Extracts just the value from an LWW register.
 * @template T
 * @param {LWWRegister<T> | null | undefined} reg
 * @returns {T | undefined}
 */
export function lwwValue(reg) {
  return reg?.value;
}
