/**
 * Normalizes a decoded byte payload to a Uint8Array.
 *
 * CBOR decoders may yield Buffer, Uint8Array, or plain number[] depending
 * on runtime and codec implementation (e.g. cbor-x on Node vs Deno).
 * This helper ensures Roaring bitmap deserialization and other binary APIs
 * always receive a Uint8Array.
 *
 * @param {Uint8Array|ArrayLike<number>} value
 * @returns {Uint8Array}
 */
export default function toBytes(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  return Uint8Array.from(value);
}
