/**
 * Utilities for parsing seek-cursor blobs stored as Git refs.
 *
 * @module parseCursorBlob
 */

/**
 * Parses and validates a cursor blob (Uint8Array) into a cursor object.
 *
 * The blob must contain UTF-8-encoded JSON representing a plain object with at
 * minimum a finite numeric `tick` field.  Any additional fields (e.g. `mode`,
 * `name`) are preserved in the returned object.
 *
 * @param {Uint8Array} buf - Raw blob contents (UTF-8 encoded JSON)
 * @param {string} label - Human-readable label used in error messages
 *   (e.g. `"active cursor"`, `"saved cursor 'foo'"`)
 * @returns {{ tick: number, mode?: string, [key: string]: unknown }}
 *   The validated cursor object.  `tick` is guaranteed to be a finite number.
 * @throws {Error} If `buf` is not valid JSON
 * @throws {Error} If the parsed value is not a plain JSON object (e.g. array,
 *   null, or primitive)
 * @throws {Error} If the `tick` field is missing, non-numeric, NaN, or
 *   Infinity
 *
 * @example
 * const buf = Buffer.from('{"tick":5,"mode":"lamport"}', 'utf8');
 * const cursor = parseCursorBlob(buf, 'active cursor');
 * // => { tick: 5, mode: 'lamport' }
 *
 * @example
 * // Throws: "Corrupted active cursor: blob is not valid JSON"
 * parseCursorBlob(Buffer.from('not json', 'utf8'), 'active cursor');
 */
export function parseCursorBlob(buf, label) {
  let obj;
  try {
    obj = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new Error(`Corrupted ${label}: blob is not valid JSON`);
  }

  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error(`Corrupted ${label}: expected a JSON object`);
  }

  if (typeof obj.tick !== 'number' || !Number.isFinite(obj.tick)) {
    throw new Error(`Corrupted ${label}: missing or invalid numeric tick`);
  }

  return obj;
}
