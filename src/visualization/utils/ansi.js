// ANSI escape code regex (inlined from ansi-regex@6 / strip-ansi@7)
// Valid string terminator sequences: BEL, ESC\, 0x9c
const ST = '(?:\\u0007|\\u001B\\u005C|\\u009C)';
const osc = `(?:\\u001B\\][\\s\\S]*?${ST})`;
const csi =
  '[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]';
const ansiRegex = new RegExp(`${osc}|${csi}`, 'g');

/**
 * Strips ANSI escape codes from a string.
 * Used primarily for snapshot testing to get deterministic output.
 *
 * @param {string} str - The string potentially containing ANSI escape codes
 * @returns {string} The string with all ANSI codes removed
 */
export function stripAnsi(str) {
  return str.replace(ansiRegex, '');
}

export default { stripAnsi };
