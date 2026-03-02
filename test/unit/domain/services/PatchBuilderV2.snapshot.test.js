/**
 * PatchBuilderV2 snapshot tests (C4).
 *
 * Verifies that _getSnapshotState() captures state lazily on first call
 * and reuses it for subsequent operations, preventing TOCTOU races.
 */

import { describe, it, expect, vi } from 'vitest';
import { PatchBuilderV2 } from '../../../../src/domain/services/PatchBuilderV2.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';
import { createEmptyStateV5 } from '../../../../src/domain/services/JoinReducer.js';
import { orsetAdd } from '../../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';

/**
 * Creates a builder with a controllable getCurrentState mock.
 * @param {Function} getCurrentState
 * @returns {PatchBuilderV2}
 */
function makeBuilder(getCurrentState) {
  return new PatchBuilderV2(/** @type {any} */ ({
    writerId: 'w1',
    lamport: 1,
    versionVector: createVersionVector(),
    getCurrentState,
  }));
}

describe('PatchBuilderV2 snapshot (C4)', () => {
  it('calls getCurrentState exactly once on first snapshot access', () => {
    const state = createEmptyStateV5();
    orsetAdd(state.nodeAlive, 'node:a', createDot('w1', 1));
    const spy = vi.fn(() => state);

    const builder = makeBuilder(spy);

    // First access triggers capture
    builder.removeNode('node:a');
    expect(spy).toHaveBeenCalledTimes(1);

    // Second access reuses cached snapshot
    builder.removeNode('node:a');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('snapshot is stable after underlying state mutation', () => {
    const state = createEmptyStateV5();
    const dot = createDot('w1', 1);
    orsetAdd(state.nodeAlive, 'node:a', dot);

    const spy = vi.fn(() => state);
    const builder = makeBuilder(spy);

    // Trigger snapshot capture
    builder.removeNode('node:a');
    expect(spy).toHaveBeenCalledTimes(1);

    // Mutate the original state after snapshot capture
    orsetAdd(state.nodeAlive, 'node:b', createDot('w1', 2));

    // Second remove reuses the cached snapshot (spy not called again)
    builder.removeNode('node:a');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns null snapshot when getCurrentState returns null', () => {
    const spy = vi.fn(() => null);
    const builder = makeBuilder(spy);

    // removeNode with null state should not throw — it simply observes no dots
    builder.removeNode('nonexistent');

    // getCurrentState was called (snapshot attempted)
    expect(spy).toHaveBeenCalledTimes(1);

    // Second call still doesn't re-invoke getCurrentState (null is cached)
    builder.removeNode('nonexistent');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not capture snapshot for addNode (only removes need it)', () => {
    const spy = vi.fn(() => createEmptyStateV5());
    const builder = makeBuilder(spy);

    builder.addNode('node:x');
    // getCurrentState should NOT be called for add operations
    expect(spy).not.toHaveBeenCalled();
  });
});
