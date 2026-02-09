/**
 * Parses and validates a cursor blob (Buffer) into a cursor object.
 *
 * Ensures the blob is valid JSON containing at minimum a numeric `tick` field.
 * Returns the validated cursor object, or throws a descriptive error on
 * corrupted / malformed data.
 *
 * @param {Buffer} buf - Raw blob contents
 * @param {string} label - Human-readable label for error messages (e.g. "active cursor", "saved cursor 'foo'")
 * @returns {{ tick: number, mode?: string, [key: string]: unknown }}
 * @throws {Error} If the blob is not valid JSON or is missing a numeric tick
 */
export function parseCursorBlob(buf, label) {
  let obj;
  try {
    obj = JSON.parse(buf.toString('utf8'));
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
