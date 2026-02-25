import { EXIT_CODES, parseCommandArgs } from '../infrastructure.js';
import { reindexSchema } from '../schemas.js';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

/**
 * Handles the `reindex` command: forces a full bitmap index rebuild
 * by clearing cached index state and re-materializing.
 *
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export default async function handleReindex({ options, args }) {
  parseCommandArgs(args, {}, reindexSchema);

  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);

  // Clear cached index to force full rebuild
  graph._cachedIndexTree = null;
  graph._cachedViewHash = null;

  await graph.materialize();

  return {
    payload: {
      graph: graphName,
      status: 'ok',
      message: 'Index rebuilt successfully',
    },
    exitCode: EXIT_CODES.OK,
  };
}
