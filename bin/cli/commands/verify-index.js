import { EXIT_CODES, parseCommandArgs } from '../infrastructure.js';
import { verifyIndexSchema } from '../schemas.js';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const VERIFY_INDEX_OPTIONS = {
  seed: { type: 'string' },
  'sample-rate': { type: 'string' },
};

/**
 * Handles the `verify-index` command: samples alive nodes and cross-checks
 * bitmap index neighbors against adjacency ground truth.
 *
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export default async function handleVerifyIndex({ options, args }) {
  const { values } = parseCommandArgs(
    args,
    VERIFY_INDEX_OPTIONS,
    verifyIndexSchema,
  );
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);

  await graph.materialize();

  const logicalIndex = graph._logicalIndex;
  if (!logicalIndex) {
    return {
      payload: { error: 'No bitmap index available after materialization' },
      exitCode: EXIT_CODES.INTERNAL,
    };
  }

  const result = graph._viewService.verifyIndex({
    state: graph._cachedState,
    logicalIndex,
    options: { seed: values.seed, sampleRate: values.sampleRate },
  });

  return {
    payload: {
      graph: graphName,
      ...result,
      total: result.passed + result.failed,
    },
    exitCode: result.failed > 0 ? EXIT_CODES.INTERNAL : EXIT_CODES.OK,
  };
}
