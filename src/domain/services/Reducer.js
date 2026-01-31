import { compareEventIds, createEventId } from '../utils/EventId.js';
import { lwwSet, lwwMax } from '../crdt/LWW.js';

/**
 * @typedef {Object} WarpState
 * @property {Map<string, import('../crdt/LWW.js').LWWRegister<boolean>>} nodeAlive
 * @property {Map<string, import('../crdt/LWW.js').LWWRegister<boolean>>} edgeAlive
 * @property {Map<string, import('../crdt/LWW.js').LWWRegister<import('../types/WarpTypes.js').ValueRef>>} prop
 */

/**
 * Creates an empty state.
 * @returns {WarpState}
 */
export function createEmptyState() {
  return {
    nodeAlive: new Map(),
    edgeAlive: new Map(),
    prop: new Map(),
  };
}

/**
 * Encodes an EdgeKey to a string for Map storage.
 * @param {string} from
 * @param {string} to
 * @param {string} label
 * @returns {string}
 */
export function encodeEdgeKey(from, to, label) {
  return `${from}\0${to}\0${label}`;
}

/**
 * Decodes an EdgeKey string back to components.
 * @param {string} key
 * @returns {{from: string, to: string, label: string}}
 */
export function decodeEdgeKey(key) {
  const [from, to, label] = key.split('\0');
  return { from, to, label };
}

/**
 * Encodes a property key for Map storage.
 * @param {string} nodeId
 * @param {string} propKey
 * @returns {string}
 */
export function encodePropKey(nodeId, propKey) {
  return `${nodeId}\0${propKey}`;
}

/**
 * Decodes a property key string.
 * @param {string} key
 * @returns {{nodeId: string, propKey: string}}
 */
export function decodePropKey(key) {
  const [nodeId, propKey] = key.split('\0');
  return { nodeId, propKey };
}

/**
 * Expands a patch into (EventId, Op) tuples.
 * @param {import('../types/WarpTypes.js').PatchV1} patch
 * @param {string} patchSha - The patch commit SHA
 * @returns {Array<{eventId: import('../utils/EventId.js').EventId, op: import('../types/WarpTypes.js').OpV1}>}
 */
export function expandPatch(patch, patchSha) {
  return patch.ops.map((op, index) => ({
    eventId: createEventId(patch.lamport, patch.writer, patchSha, index),
    op,
  }));
}

/**
 * Applies a single operation to state using LWW semantics.
 * Mutates state in place.
 * @param {WarpState} state
 * @param {import('../utils/EventId.js').EventId} eventId
 * @param {import('../types/WarpTypes.js').OpV1} op
 */
export function applyOp(state, eventId, op) {
  switch (op.type) {
    case 'NodeAdd': {
      const current = state.nodeAlive.get(op.node);
      const newReg = lwwSet(eventId, true);
      state.nodeAlive.set(op.node, lwwMax(current, newReg));
      break;
    }
    case 'NodeTombstone': {
      const current = state.nodeAlive.get(op.node);
      const newReg = lwwSet(eventId, false);
      state.nodeAlive.set(op.node, lwwMax(current, newReg));
      break;
    }
    case 'EdgeAdd': {
      const key = encodeEdgeKey(op.from, op.to, op.label);
      const current = state.edgeAlive.get(key);
      const newReg = lwwSet(eventId, true);
      state.edgeAlive.set(key, lwwMax(current, newReg));
      break;
    }
    case 'EdgeTombstone': {
      const key = encodeEdgeKey(op.from, op.to, op.label);
      const current = state.edgeAlive.get(key);
      const newReg = lwwSet(eventId, false);
      state.edgeAlive.set(key, lwwMax(current, newReg));
      break;
    }
    case 'PropSet': {
      const key = encodePropKey(op.node, op.key);
      const current = state.prop.get(key);
      const newReg = lwwSet(eventId, op.value);
      state.prop.set(key, lwwMax(current, newReg));
      break;
    }
  }
}

/**
 * Deep clones a WarpState.
 * @param {WarpState} state
 * @returns {WarpState}
 */
function cloneState(state) {
  return {
    nodeAlive: new Map(state.nodeAlive),
    edgeAlive: new Map(state.edgeAlive),
    prop: new Map(state.prop),
  };
}

/**
 * Reduces patches to state using deterministic fold.
 *
 * Algorithm (from spec Section 9.1):
 * 1. Expand all patches to (EventId, Op) tuples
 * 2. Sort by EventId (total order)
 * 3. Apply sequentially using LWW semantics
 *
 * @param {Array<{patch: import('../types/WarpTypes.js').PatchV1, sha: string}>} patches
 * @param {WarpState} [initialState] - Optional starting state (for incremental)
 * @returns {WarpState}
 */
export function reduce(patches, initialState = null) {
  const state = initialState ? cloneState(initialState) : createEmptyState();

  // 1. Expand all patches to tuples
  const tuples = [];
  for (const { patch, sha } of patches) {
    tuples.push(...expandPatch(patch, sha));
  }

  // 2. Sort by EventId
  tuples.sort((a, b) => compareEventIds(a.eventId, b.eventId));

  // 3. Apply sequentially
  for (const { eventId, op } of tuples) {
    applyOp(state, eventId, op);
  }

  return state;
}
