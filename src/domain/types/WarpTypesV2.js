/**
 * WARP OpV2/PatchV2 Types and Schema
 *
 * Pure type definitions using JSDoc for IDE autocomplete and documentation.
 * Factory functions for creating WARP v5 operations and patches.
 *
 * Key differences from V1:
 * - Add operations carry dots (causal identifiers)
 * - Remove operations carry observedDots (set of dots being removed)
 * - PropSet uses EventId for identification (no dot field)
 * - PatchV2 includes context (VersionVector) for writer's observed frontier
 *
 * @module WarpTypesV2
 * @see WARP v5 Spec
 */

// ============================================================================
// Primitive Types
// ============================================================================

/**
 * String identifier for nodes (e.g., "user:alice", UUID)
 * @typedef {string} NodeId
 */

/**
 * Dot - causal identifier for an add operation
 * @typedef {import('../crdt/Dot.js').Dot} Dot
 */

/**
 * VersionVector - maps writer IDs to their maximum observed sequence numbers
 * @typedef {Object.<string, number>} VersionVector
 */

// ============================================================================
// Operations (OpV2)
// ============================================================================

/**
 * Node add operation - creates a new node with a dot
 * @typedef {Object} OpV2NodeAdd
 * @property {'NodeAdd'} type - Operation type discriminator
 * @property {NodeId} node - Node ID to add
 * @property {Dot} dot - Causal identifier for this add
 */

/**
 * Node remove operation - removes a node by observed dots
 * @typedef {Object} OpV2NodeRemove
 * @property {'NodeRemove'} type - Operation type discriminator
 * @property {NodeId} node - Node ID to remove
 * @property {string[]} observedDots - Encoded dot strings being removed (add events observed)
 */

/**
 * Edge add operation - creates a new edge with a dot
 * @typedef {Object} OpV2EdgeAdd
 * @property {'EdgeAdd'} type - Operation type discriminator
 * @property {NodeId} from - Source node ID
 * @property {NodeId} to - Target node ID
 * @property {string} label - Edge label/type
 * @property {Dot} dot - Causal identifier for this add
 */

/**
 * Edge remove operation - removes an edge by observed dots
 * @typedef {Object} OpV2EdgeRemove
 * @property {'EdgeRemove'} type - Operation type discriminator
 * @property {NodeId} from - Source node ID
 * @property {NodeId} to - Target node ID
 * @property {string} label - Edge label/type
 * @property {string[]} observedDots - Encoded dot strings being removed (add events observed)
 */

/**
 * Property set operation - sets a property value on a node (raw/persisted form).
 * Uses EventId for identification (derived from patch context).
 *
 * In raw patches, edge properties are also encoded as PropSet with the node
 * field carrying a \x01-prefixed edge identity. See {@link OpV2NodePropSet}
 * and {@link OpV2EdgePropSet} for the canonical (internal) representations.
 *
 * @typedef {Object} OpV2PropSet
 * @property {'PropSet'} type - Operation type discriminator
 * @property {NodeId} node - Node ID to set property on (may contain \x01 prefix for edge props)
 * @property {string} key - Property key
 * @property {unknown} value - Property value (any JSON-serializable type)
 */

/**
 * Canonical node property set operation (internal only — never persisted).
 * @typedef {Object} OpV2NodePropSet
 * @property {'NodePropSet'} type - Operation type discriminator
 * @property {NodeId} node - Node ID to set property on
 * @property {string} key - Property key
 * @property {unknown} value - Property value (any JSON-serializable type)
 */

/**
 * Canonical edge property set operation (internal only — never persisted).
 * @typedef {Object} OpV2EdgePropSet
 * @property {'EdgePropSet'} type - Operation type discriminator
 * @property {NodeId} from - Source node ID
 * @property {NodeId} to - Target node ID
 * @property {string} label - Edge label
 * @property {string} key - Property key
 * @property {unknown} value - Property value (any JSON-serializable type)
 */

/**
 * Union of all raw (persisted) v2 operation types.
 * @typedef {OpV2NodeAdd | OpV2NodeRemove | OpV2EdgeAdd | OpV2EdgeRemove | OpV2PropSet} RawOpV2
 */

/**
 * Union of all canonical (internal) v2 operation types.
 * Reducers, provenance, receipts, and queries operate on canonical ops only.
 * @typedef {OpV2NodeAdd | OpV2NodeRemove | OpV2EdgeAdd | OpV2EdgeRemove | OpV2NodePropSet | OpV2EdgePropSet} CanonicalOpV2
 */

/**
 * Union of all v2 operation types (raw + canonical).
 * Used in patch containers that may hold either raw ops (from disk)
 * or canonical ops (after normalization).
 * @typedef {RawOpV2 | CanonicalOpV2} OpV2
 */

// ============================================================================
// Patch
// ============================================================================

/**
 * PatchV2 - A batch of ordered operations from a single writer
 * @typedef {Object} PatchV2
 * @property {2|3} schema - Schema version (2 for node-only, 3 for edge properties)
 * @property {string} writer - Writer ID (identifies the source of the patch)
 * @property {number} lamport - Lamport timestamp for ordering
 * @property {VersionVector} context - Writer's observed frontier (NOT global stability)
 * @property {OpV2[]} ops - Ordered array of operations
 * @property {string[]} [reads] - Node/edge IDs read by this patch (for provenance tracking)
 * @property {string[]} [writes] - Node/edge IDs written by this patch (for provenance tracking)
 */

// ============================================================================
// Factory Functions - Operations
// ============================================================================

/**
 * Creates a NodeAdd operation with a dot
 * @param {NodeId} node - Node ID to add
 * @param {Dot} dot - Causal identifier for this add
 * @returns {OpV2NodeAdd} NodeAdd operation
 */
export function createNodeAddV2(node, dot) {
  return { type: 'NodeAdd', node, dot };
}

/**
 * Creates a NodeRemove operation with observed dots
 * @param {NodeId} node - Node ID to remove
 * @param {string[]} observedDots - Encoded dot strings being removed
 * @returns {OpV2NodeRemove} NodeRemove operation
 */
export function createNodeRemoveV2(node, observedDots) {
  return { type: 'NodeRemove', node, observedDots };
}

/**
 * Creates an EdgeAdd operation with a dot
 * @param {NodeId} from - Source node ID
 * @param {NodeId} to - Target node ID
 * @param {string} label - Edge label
 * @param {Dot} dot - Causal identifier for this add
 * @returns {OpV2EdgeAdd} EdgeAdd operation
 */
export function createEdgeAddV2(from, to, label, dot) {
  return { type: 'EdgeAdd', from, to, label, dot };
}

/**
 * Creates an EdgeRemove operation with observed dots
 * @param {NodeId} from - Source node ID
 * @param {NodeId} to - Target node ID
 * @param {string} label - Edge label
 * @param {string[]} observedDots - Encoded dot strings being removed
 * @returns {OpV2EdgeRemove} EdgeRemove operation
 */
export function createEdgeRemoveV2(from, to, label, observedDots) {
  return { type: 'EdgeRemove', from, to, label, observedDots };
}

/**
 * Creates a raw PropSet operation (no dot - uses EventId).
 * This is the persisted form. For internal use, prefer
 * {@link createNodePropSetV2} or {@link createEdgePropSetV2}.
 * @param {NodeId} node - Node ID to set property on
 * @param {string} key - Property key
 * @param {unknown} value - Property value (any JSON-serializable type)
 * @returns {OpV2PropSet} PropSet operation
 */
export function createPropSetV2(node, key, value) {
  return { type: 'PropSet', node, key, value };
}

/**
 * Creates a canonical NodePropSet operation (internal only).
 * @param {NodeId} node - Node ID to set property on
 * @param {string} key - Property key
 * @param {unknown} value - Property value (any JSON-serializable type)
 * @returns {OpV2NodePropSet} NodePropSet operation
 */
export function createNodePropSetV2(node, key, value) {
  return { type: 'NodePropSet', node, key, value };
}

/**
 * Creates a canonical EdgePropSet operation (internal only).
 * @param {NodeId} from - Source node ID
 * @param {NodeId} to - Target node ID
 * @param {string} label - Edge label
 * @param {string} key - Property key
 * @param {unknown} value - Property value (any JSON-serializable type)
 * @returns {OpV2EdgePropSet} EdgePropSet operation
 */
export function createEdgePropSetV2(from, to, label, key, value) {
  return { type: 'EdgePropSet', from, to, label, key, value };
}

// ============================================================================
// Factory Functions - Patch
// ============================================================================

/**
 * Creates a PatchV2
 * @param {Object} options - Patch options
 * @param {2|3} [options.schema=2] - Schema version (2 for node-only, 3 for edge properties)
 * @param {string} options.writer - Writer ID
 * @param {number} options.lamport - Lamport timestamp
 * @param {VersionVector} options.context - Writer's observed frontier
 * @param {OpV2[]} options.ops - Array of operations
 * @param {string[]} [options.reads] - Node/edge IDs read by this patch (for provenance tracking)
 * @param {string[]} [options.writes] - Node/edge IDs written by this patch (for provenance tracking)
 * @returns {PatchV2} PatchV2 object
 */
export function createPatchV2({ schema = 2, writer, lamport, context, ops, reads, writes }) {
  /** @type {PatchV2} */
  const patch = {
    schema,
    writer,
    lamport,
    context,
    ops,
  };
  // Only include reads/writes if provided (backward compatibility)
  if (reads && reads.length > 0) {
    patch.reads = reads;
  }
  if (writes && writes.length > 0) {
    patch.writes = writes;
  }
  return patch;
}
