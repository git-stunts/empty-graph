/**
 * Layout engine facade.
 *
 * Orchestrates: converter → ELK adapter → ELK runner → PositionedGraph.
 */

export {
  queryResultToGraphData,
  pathResultToGraphData,
  rawGraphToGraphData,
} from './converters.js';

export { toElkGraph, getDefaultLayoutOptions } from './elkAdapter.js';
export { runLayout } from './elkLayout.js';

import { toElkGraph } from './elkAdapter.js';
import { runLayout } from './elkLayout.js';

/**
 * Full pipeline: graphData → PositionedGraph.
 *
 * @param {{ nodes: Array<{ id: string, label: string }>, edges: Array<{ from: string, to: string, label?: string }> }} graphData - Normalised graph data
 * @param {{ type?: 'query'|'path'|'slice', layoutOptions?: Record<string, string> }} [options]
 * @returns {Promise<import('./elkLayout.js').PositionedGraph>} PositionedGraph
 */
export async function layoutGraph(graphData, options = {}) {
  const elkGraph = toElkGraph(graphData, options);
  return await runLayout(elkGraph);
}
