/**
 * B39 — Trust CAS retry tests.
 *
 * Verifies TrustRecordService._persistRecord() retry behavior:
 * - Transient CAS failures (ref unchanged): retry succeeds
 * - Transient CAS exhausted: E_TRUST_CAS_EXHAUSTED after N attempts
 * - Real concurrent append (ref changed): E_TRUST_CAS_CONFLICT with new tip info
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TrustRecordService } from '../../../../src/domain/trust/TrustRecordService.js';
import { KEY_ADD_1, KEY_ADD_2 } from './fixtures/goldenRecords.js';

function createMockPersistence() {
  const refs = new Map();
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  let blobCounter = 0;
  let treeCounter = 0;
  let commitCounter = 0;

  return {
    refs,
    /** @param {*} ref */
    async readRef(ref) {
      return refs.get(ref) ?? null;
    },
    /** @param {*} ref @param {*} newOid @param {*} expectedOid */
    async compareAndSwapRef(ref, newOid, expectedOid) {
      const current = refs.get(ref) ?? null;
      if (current !== expectedOid) {
        throw new Error(`CAS failure: expected ${expectedOid}, found ${current}`);
      }
      refs.set(ref, newOid);
    },
    /** @param {*} data */
    async writeBlob(data) {
      const oid = `blob-${++blobCounter}`;
      blobs.set(oid, data);
      return oid;
    },
    /** @param {*} oid */
    async readBlob(oid) {
      const data = blobs.get(oid);
      if (!data) { throw new Error(`Blob not found: ${oid}`); }
      return data;
    },
    /** @param {string[]} entries */
    async writeTree(entries) {
      const oid = `tree-${++treeCounter}`;
      /** @type {Record<string, string>} */
      const parsed = {};
      for (const line of entries) {
        const match = line.match(/^\d+ blob ([^\t]+)\t(.+)$/);
        if (match) { parsed[match[2]] = match[1]; }
      }
      trees.set(oid, parsed);
      return oid;
    },
    /** @param {*} oid */
    async readTreeOids(oid) {
      const tree = trees.get(oid);
      if (!tree) { throw new Error(`Tree not found: ${oid}`); }
      return tree;
    },
    /** @param {*} sha */
    async getCommitTree(sha) {
      const commit = commits.get(sha);
      if (!commit) { throw new Error(`Commit not found: ${sha}`); }
      return commit.tree;
    },
    /** @param {*} sha */
    async getNodeInfo(sha) {
      const commit = commits.get(sha);
      if (!commit) { throw new Error(`Commit not found: ${sha}`); }
      return { parents: commit.parents, message: commit.message, date: null };
    },
    /** @param {{ treeOid: string, parents?: string[], message: string }} opts */
    async commitNodeWithTree({ treeOid, parents = [], message }) {
      const oid = `commit-${++commitCounter}`;
      commits.set(oid, { tree: treeOid, parents, message });
      return oid;
    },
  };
}

function createMockCodec() {
  return {
    /** @param {*} value */
    encode(value) { return Buffer.from(JSON.stringify(value)); },
    /** @param {*} buf */
    decode(buf) { return JSON.parse(buf.toString()); },
  };
}

describe('B39 — Trust CAS retry', () => {
  /** @type {ReturnType<typeof createMockPersistence>} */
  let persistence;
  /** @type {TrustRecordService} */
  let service;

  beforeEach(() => {
    persistence = createMockPersistence();
    service = new TrustRecordService({
      persistence: /** @type {*} */ (persistence),
      codec: createMockCodec(),
    });
  });

  it('succeeds on first CAS attempt (no retry needed)', async () => {
    const result = await service.appendRecord('test-graph', KEY_ADD_1, {
      skipSignatureVerify: true,
    });
    expect(result.commitSha).toMatch(/^commit-/);
  });

  it('retries on transient CAS failure and succeeds', async () => {
    const origCas = persistence.compareAndSwapRef.bind(persistence);
    let casCallCount = 0;

    persistence.compareAndSwapRef = async (/** @type {*} */ ref, /** @type {*} */ newOid, /** @type {*} */ expectedOid) => {
      casCallCount++;
      if (casCallCount === 1) {
        // First CAS: transient failure (ref unchanged, so _readTip returns same value)
        throw new Error('CAS failure: lock contention');
      }
      // Second CAS: succeeds
      return origCas(ref, newOid, expectedOid);
    };

    const result = await service.appendRecord('test-graph', KEY_ADD_1, {
      skipSignatureVerify: true,
    });
    expect(result.commitSha).toMatch(/^commit-/);
    expect(casCallCount).toBe(2);
  });

  it('throws E_TRUST_CAS_EXHAUSTED after 3 transient failures', async () => {
    let casCallCount = 0;

    persistence.compareAndSwapRef = async () => {
      casCallCount++;
      // Always fail — ref unchanged (transient)
      throw new Error('CAS failure: lock contention');
    };

    await expect(
      service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true }),
    ).rejects.toThrow(/CAS exhausted/);

    try {
      await service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true });
    } catch (err) {
      expect(/** @type {*} */ (err).code).toBe('E_TRUST_CAS_EXHAUSTED');
    }

    // Should have attempted CAS 3 times (MAX_CAS_ATTEMPTS)
    // First call: 3 attempts, second call: 3 more
    expect(casCallCount).toBe(6);
  });

  it('throws E_TRUST_CAS_CONFLICT when chain advances during append', async () => {
    // Append genesis successfully
    await service.appendRecord('test-graph', KEY_ADD_1, { skipSignatureVerify: true });

    const ref = 'refs/warp/test-graph/trust/records';
    const origCas = persistence.compareAndSwapRef.bind(persistence);
    let casCallCount = 0;

    persistence.compareAndSwapRef = async (/** @type {*} */ r, /** @type {*} */ newOid, /** @type {*} */ expectedOid) => {
      casCallCount++;
      if (casCallCount === 1) {
        // Simulate a concurrent append: advance the ref to a new commit
        // before the CAS check runs
        const concurrentBlob = await persistence.writeBlob(
          Buffer.from(JSON.stringify({ recordId: 'concurrent-record-id', prev: KEY_ADD_1.recordId })),
        );
        const concurrentTree = await persistence.writeTree([
          `100644 blob ${concurrentBlob}\trecord.cbor`,
        ]);
        const concurrentCommit = await persistence.commitNodeWithTree({
          treeOid: concurrentTree,
          parents: [persistence.refs.get(ref)],
          message: 'trust: concurrent',
        });
        persistence.refs.set(ref, concurrentCommit);

        throw new Error('CAS failure: ref changed');
      }
      return origCas(r, newOid, expectedOid);
    };

    try {
      await service.appendRecord('test-graph', KEY_ADD_2, { skipSignatureVerify: true });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(/** @type {*} */ (err).code).toBe('E_TRUST_CAS_CONFLICT');
      expect(/** @type {*} */ (err).context.actualTipRecordId).toBe('concurrent-record-id');
      expect(/** @type {*} */ (err).context.actualTipSha).toMatch(/^commit-/);
    }
  });
});
