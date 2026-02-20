/**
 * ELK layout runner: lazy-loads elkjs and executes layout.
 *
 * The ELK engine (~2.5 MB) is loaded via dynamic import() only when
 * a layout is actually requested, keeping normal CLI startup fast.
 */

/**
 * @typedef {{ id: string, x?: number, y?: number, width?: number, height?: number, labels?: Array<{ text: string }> }} ElkResultChild
 * @typedef {{ id: string, sources?: string[], targets?: string[], labels?: Array<{ text: string }>, sections?: unknown[] }} ElkResultEdge
 * @typedef {{ children?: ElkResultChild[], edges?: ElkResultEdge[], width?: number, height?: number }} ElkResult
 * @typedef {{ id: string, x: number, y: number, width: number, height: number, label?: string }} PosNode
 * @typedef {{ x: number, y: number }} LayoutPoint
 * @typedef {{ startPoint?: LayoutPoint, endPoint?: LayoutPoint, bendPoints?: LayoutPoint[] }} LayoutSection
 * @typedef {{ id: string, source: string, target: string, label?: string, sections?: LayoutSection[] }} PosEdge
 * @typedef {{ nodes: PosNode[], edges: PosEdge[], width: number, height: number }} PositionedGraph
 * @typedef {{ id: string, children?: Array<{ id: string, width?: number, height?: number, labels?: Array<{ text: string }> }>, edges?: Array<{ id: string, sources?: string[], targets?: string[], labels?: Array<{ text: string }> }>, layoutOptions?: Record<string, string> }} ElkGraphInput
 * @typedef {{ layout: (graph: ElkGraphInput) => Promise<ElkResult> }} ElkEngine
 */

/** @type {Promise<unknown> | null} */
let elkPromise = null;

/**
 * Returns (or creates) a singleton ELK instance.
 * @returns {Promise<unknown>} ELK instance
 */
function getElk() {
  if (!elkPromise) {
    elkPromise = import('elkjs/lib/elk.bundled.js').then((mod) => new mod.default());
  }
  return elkPromise;
}

/**
 * Runs ELK layout on a graph and returns a PositionedGraph.
 *
 * @param {ElkGraphInput} elkGraph - ELK-format graph from toElkGraph()
 * @returns {Promise<PositionedGraph>} PositionedGraph
 */
export async function runLayout(elkGraph) {
  /** @type {ElkResult | undefined} */
  let result;
  try {
    const elk = /** @type {ElkEngine} */ (await getElk());
    result = await elk.layout(elkGraph);
  } catch {
    return fallbackLayout(elkGraph);
  }
  return toPositionedGraph(result);
}

/**
 * Converts ELK output to a PositionedGraph.
 * @param {ElkResult | undefined} result
 * @returns {PositionedGraph}
 */
function toPositionedGraph(result) {
  const nodes = (result?.children ?? []).map((c) => ({
    id: c.id,
    x: c.x ?? 0,
    y: c.y ?? 0,
    width: c.width ?? 80,
    height: c.height ?? 40,
    label: c.labels?.[0]?.text ?? c.id,
  }));

  const edges = (result?.edges ?? []).map((e) => ({
    id: e.id,
    source: e.sources?.[0] ?? '',
    target: e.targets?.[0] ?? '',
    label: e.labels?.[0]?.text,
    sections: /** @type {LayoutSection[]} */ (e.sections ?? []),
  }));

  return {
    nodes,
    edges,
    width: result?.width ?? 0,
    height: result?.height ?? 0,
  };
}

/**
 * Fallback: line nodes up horizontally when ELK fails.
 * @param {ElkGraphInput} elkGraph
 * @returns {PositionedGraph}
 */
function fallbackLayout(elkGraph) {
  let x = 20;
  const nodes = (elkGraph.children ?? []).map((c) => {
    const node = {
      id: c.id,
      x,
      y: 20,
      width: c.width ?? 80,
      height: c.height ?? 40,
      label: c.labels?.[0]?.text ?? c.id,
    };
    x += (c.width ?? 80) + 40;
    return node;
  });

  const edges = (elkGraph.edges ?? []).map((e) => ({
    id: e.id,
    source: e.sources?.[0] ?? '',
    target: e.targets?.[0] ?? '',
    label: e.labels?.[0]?.text,
    sections: [],
  }));

  const totalWidth = x;
  return { nodes, edges, width: totalWidth, height: 80 };
}
