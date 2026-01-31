import { createHash } from 'crypto';
import { encode, decode } from '../../infrastructure/codecs/CborCodec.js';
import { decodeEdgeKey, decodePropKey } from './Reducer.js';

/**
 * State Serialization and Hashing for WARP
 *
 * Provides visibility predicates for determining what is visible in the graph,
 * canonical state serialization for deterministic hashing, and state hash computation.
 *
 * @module StateSerializer
 * @see WARP Spec Section 8.3 (Visibility)
 * @see WARP Spec Section 10.3 (Canonical Serialization)
 */

// ============================================================================
// Visibility Predicates (WARP spec Section 8.3)
// ============================================================================

/**
 * Checks if a node is visible (not tombstoned).
 * @param {import('./Reducer.js').WarpState} state
 * @param {string} nodeId
 * @returns {boolean}
 */
export function nodeVisible(state, nodeId) {
  const reg = state.nodeAlive.get(nodeId);
  return reg?.value === true;
}

/**
 * Checks if an edge is visible.
 * Edge is visible if: edge_alive is true AND both endpoints are visible.
 * @param {import('./Reducer.js').WarpState} state
 * @param {string} edgeKey - Encoded edge key
 * @returns {boolean}
 */
export function edgeVisible(state, edgeKey) {
  const reg = state.edgeAlive.get(edgeKey);
  if (reg?.value !== true) return false;

  const { from, to } = decodeEdgeKey(edgeKey);
  return nodeVisible(state, from) && nodeVisible(state, to);
}

/**
 * Checks if a property is visible.
 * Property is visible if: node is visible AND prop exists.
 * @param {import('./Reducer.js').WarpState} state
 * @param {string} propKey - Encoded prop key
 * @returns {boolean}
 */
export function propVisible(state, propKey) {
  const { nodeId } = decodePropKey(propKey);
  if (!nodeVisible(state, nodeId)) return false;
  return state.prop.has(propKey);
}

// ============================================================================
// Canonical State Serialization (WARP spec Section 10.3)
// ============================================================================

/**
 * Serializes state to canonical CBOR bytes.
 * Only includes VISIBLE projection with stable ordering:
 * 1. Nodes sorted by NodeId
 * 2. Edges sorted by (from, to, label)
 * 3. Props sorted by (node, key)
 *
 * @param {import('./Reducer.js').WarpState} state
 * @returns {Buffer}
 */
export function serializeState(state) {
  // 1. Collect visible nodes, sorted
  const nodes = [];
  for (const [nodeId, reg] of state.nodeAlive) {
    if (reg.value === true) {
      nodes.push(nodeId);
    }
  }
  nodes.sort();

  // 2. Collect visible edges, sorted by (from, to, label)
  const edges = [];
  for (const [edgeKey, reg] of state.edgeAlive) {
    if (reg.value === true) {
      const { from, to, label } = decodeEdgeKey(edgeKey);
      if (nodeVisible(state, from) && nodeVisible(state, to)) {
        edges.push({ from, to, label });
      }
    }
  }
  edges.sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    if (a.to !== b.to) return a.to < b.to ? -1 : 1;
    if (a.label !== b.label) return a.label < b.label ? -1 : 1;
    return 0;
  });

  // 3. Collect visible props, sorted by (node, key)
  const props = [];
  for (const [propKey, reg] of state.prop) {
    const { nodeId, propKey: key } = decodePropKey(propKey);
    if (nodeVisible(state, nodeId)) {
      props.push({ node: nodeId, key, value: reg.value });
    }
  }
  props.sort((a, b) => {
    if (a.node !== b.node) return a.node < b.node ? -1 : 1;
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    return 0;
  });

  // Encode as canonical CBOR
  return encode({ nodes, edges, props });
}

/**
 * Computes SHA-256 hash of canonical state bytes.
 * @param {import('./Reducer.js').WarpState} state
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function computeStateHash(state) {
  const bytes = serializeState(state);
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Deserializes state from CBOR bytes.
 * Note: This reconstructs the visible projection only.
 * @param {Buffer} buffer
 * @returns {{nodes: string[], edges: Array<{from: string, to: string, label: string}>, props: Array<{node: string, key: string, value: *}>}}
 */
export function deserializeState(buffer) {
  return decode(buffer);
}
