import Table from 'cli-table3';

/**
 * Creates a cli-table3 instance with default WARP styling.
 *
 * @param {{ head?: string[], style?: Record<string, unknown>, [key: string]: unknown }} [options] - Options forwarded to cli-table3 constructor
 * @returns {InstanceType<typeof Table>} A cli-table3 instance
 */
export function createTable(options = {}) {
  const defaultStyle = { head: ['cyan'], border: ['gray'] };
  return new Table({
    ...options,
    style: { ...defaultStyle, ...options.style },
  });
}

export default createTable;
