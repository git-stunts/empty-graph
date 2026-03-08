import process from 'node:process';
import { parseCommandArgs, usageError, notFoundError } from '../infrastructure.js';
import { serveSchema } from '../schemas.js';
import { createPersistence, listGraphNames } from '../shared.js';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import WebCryptoAdapter from '../../../src/infrastructure/adapters/WebCryptoAdapter.js';
import NodeWsAdapter from '../../../src/infrastructure/adapters/NodeWsAdapter.js';
import WarpServeService from '../../../src/domain/services/WarpServeService.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const SERVE_OPTIONS = {
  port: { type: 'string', default: '3000' },
  host: { type: 'string', default: '127.0.0.1' },
};

/**
 * Opens WarpGraph instances for the specified graph names.
 *
 * @param {import('../types.js').Persistence} persistence
 * @param {string[]} graphNames
 * @param {string} writerId
 * @returns {Promise<Array<import('../../../src/domain/WarpGraph.js').default>>}
 */
async function openGraphs(persistence, graphNames, writerId) {
  const graphs = [];
  for (const graphName of graphNames) {
    const graph = await WarpGraph.open({
      persistence: /** @type {import('../../../src/domain/types/WarpPersistence.js').CorePersistence} */ (/** @type {unknown} */ (persistence)),
      graphName,
      writerId,
      crypto: new WebCryptoAdapter(),
    });
    graphs.push(graph);
  }
  return graphs;
}

/**
 * Handles the `serve` command: starts a WebSocket server exposing
 * graph(s) in the repository for browser-based viewing and mutation.
 *
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: {url: string, host: string, port: number, graphs: string[]}, close: () => Promise<void>}>}
 */
export default async function handleServe({ options, args }) {
  const { values } = parseCommandArgs(args, SERVE_OPTIONS, serveSchema, { allowPositionals: false });
  const { port, host } = values;

  const { persistence } = await createPersistence(options.repo);
  const graphNames = await listGraphNames(persistence);

  if (graphNames.length === 0) {
    throw usageError('No WARP graphs found in this repository');
  }
  if (options.graph && !graphNames.includes(options.graph)) {
    throw notFoundError(`Graph not found: ${options.graph}`);
  }

  const targetGraphs = options.graph ? [options.graph] : graphNames;
  const graphs = await openGraphs(persistence, targetGraphs, `serve:${host}:${port}`);

  const wsPort = new NodeWsAdapter();
  const service = new WarpServeService({ wsPort, graphs });
  const addr = await service.listen(port, host);

  const url = `ws://${addr.host}:${addr.port}`;
  process.stderr.write(`Listening on ${url}\n`);
  process.stderr.write(`Serving graph(s): ${targetGraphs.join(', ')}\n`);

  return {
    payload: { url, host: addr.host, port: addr.port, graphs: targetGraphs },
    close: () => service.close(),
  };
}
