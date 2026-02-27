/**
 * JoinReducer validation tests (C2/C3).
 *
 * C2: Unknown op type is silently ignored in reduceV5() — documented baseline.
 * C2: Empty ops array doesn't crash.
 * C3: Receipt path with malformed ops — documented known gap.
 */

import { describe, it, expect } from 'vitest';
import {
  createEmptyStateV5,
  applyOpV2,
  reduceV5 as _reduceV5,
} from '../../../../src/domain/services/JoinReducer.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { orsetContains, orsetElements } from '../../../../src/domain/crdt/ORSet.js';

/** @type {(...args: any[]) => any} */
const reduceV5 = _reduceV5;

const makePatchEntry = (/** @type {any[]} */ ops) => ({
  patch: {
    schema: 2,
    writer: 'w1',
    lamport: 1,
    context: new Map(),
    ops,
    reads: [],
    writes: [],
  },
  sha: 'a'.repeat(40),
});

describe('JoinReducer validation', () => {
  describe('C2 — unknown op types', () => {
    it('silently ignores unknown op type in applyOpV2', () => {
      const state = createEmptyStateV5();
      const eventId = createEventId(1, 'w1', 'a'.repeat(40), 0);

      // Should not throw
      applyOpV2(state, /** @type {any} */ ({ type: 'FutureOp', data: 42 }), eventId);

      // State unchanged
      expect([...orsetElements(state.nodeAlive)]).toHaveLength(0);
    });

    it('silently ignores unknown op type in reduceV5', () => {
      const entry = makePatchEntry([
        { type: 'NodeAdd', node: 'node:a', dot: createDot('w1', 1) },
        { type: 'UnknownFutureOp', payload: {} },
      ]);

      const state = reduceV5([entry]);

      // The known NodeAdd should still apply
      expect(orsetContains(state.nodeAlive, 'node:a')).toBe(true);
    });
  });

  describe('C2 — empty ops array', () => {
    it('reduceV5 with empty ops array produces empty state', () => {
      const entry = makePatchEntry([]);
      const state = reduceV5([entry]);

      expect([...orsetElements(state.nodeAlive)]).toHaveLength(0);
      expect(state.prop.size).toBe(0);
    });

    it('reduceV5 with zero patches produces empty state', () => {
      const state = reduceV5([]);

      expect([...orsetElements(state.nodeAlive)]).toHaveLength(0);
      expect(state.prop.size).toBe(0);
    });
  });

  describe('C3 — receipt path with malformed ops (known gap)', () => {
    it('receipt path crashes on op missing .dot for NodeAdd', () => {
      const entry = makePatchEntry([
        { type: 'NodeAdd', node: 'node:a' /* missing dot */ },
      ]);

      // Document: this throws because the receipt path calls orsetAdd
      // with undefined dot, which crashes.
      expect(() => reduceV5([entry], undefined, { receipts: true })).toThrow();
    });

    it('receipt path crashes on op missing .node for NodeAdd', () => {
      const entry = makePatchEntry([
        { type: 'NodeAdd', dot: createDot('w1', 1) /* missing node */ },
      ]);

      // Document: this throws because orsetAdd receives undefined key
      expect(() => reduceV5([entry], undefined, { receipts: true })).toThrow();
    });

    it('fast path also crashes on malformed NodeAdd (no dot)', () => {
      const entry = makePatchEntry([
        { type: 'NodeAdd', node: 'node:a' /* missing dot */ },
      ]);

      // Document: applyFast also crashes on missing dot
      expect(() => reduceV5([entry])).toThrow();
    });
  });
});
