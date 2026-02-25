/**
 * PatchDiff — captures alive-ness transitions during patch application.
 *
 * A diff entry is produced only when the alive-ness state of a node or edge
 * actually changes, or when an LWW property winner changes. Redundant ops
 * (e.g. NodeAdd on an already-alive node) produce no diff entries.
 *
 * @module domain/types/PatchDiff
 */

/**
 * @typedef {Object} EdgeDiffEntry
 * @property {string} from  - Source node ID
 * @property {string} to    - Target node ID
 * @property {string} label - Edge label
 */

/**
 * @typedef {Object} PropDiffEntry
 * @property {string} nodeId   - Node (or edge-prop owner) ID
 * @property {string} key      - Property key
 * @property {unknown} value   - New LWW winner value
 * @property {unknown} prevValue - Previous LWW winner value (undefined if none)
 */

/**
 * @typedef {Object} PatchDiff
 * @property {string[]} nodesAdded           - Nodes that transitioned not-alive → alive
 * @property {string[]} nodesRemoved         - Nodes that transitioned alive → not-alive
 * @property {EdgeDiffEntry[]} edgesAdded    - Edges that transitioned not-alive → alive
 * @property {EdgeDiffEntry[]} edgesRemoved  - Edges that transitioned alive → not-alive
 * @property {PropDiffEntry[]} propsChanged  - Properties whose LWW winner actually changed
 */

/**
 * Creates an empty PatchDiff.
 *
 * @returns {PatchDiff}
 */
export function createEmptyDiff() {
  return {
    nodesAdded: [],
    nodesRemoved: [],
    edgesAdded: [],
    edgesRemoved: [],
    propsChanged: [],
  };
}

/**
 * Merges two PatchDiff objects by concatenating their arrays.
 *
 * @param {PatchDiff} a
 * @param {PatchDiff} b
 * @returns {PatchDiff}
 */
export function mergeDiffs(a, b) {
  return {
    nodesAdded: a.nodesAdded.concat(b.nodesAdded),
    nodesRemoved: a.nodesRemoved.concat(b.nodesRemoved),
    edgesAdded: a.edgesAdded.concat(b.edgesAdded),
    edgesRemoved: a.edgesRemoved.concat(b.edgesRemoved),
    propsChanged: a.propsChanged.concat(b.propsChanged),
  };
}
