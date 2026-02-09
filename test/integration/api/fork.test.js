import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.js';

describe('API: Fork', () => {
  let repo;

  beforeEach(async () => {
    repo = await createTestRepo('fork');
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('forks a graph and both evolve independently', async () => {
    const graph = await repo.openGraph('original', 'alice');

    const sha1 = await (await graph.createPatch())
      .addNode('shared')
      .setProperty('shared', 'origin', 'original')
      .commit();

    await graph.materialize();

    // Fork at the first patch
    const fork = await graph.fork({
      from: 'alice',
      at: sha1,
      forkName: 'forked',
      forkWriterId: 'fork-writer',
    });

    // Add to original
    await (await graph.createPatch())
      .addNode('original-only')
      .commit();

    // Add to fork
    const forkedGraph = await repo.openGraph('forked', 'fork-writer');
    await (await forkedGraph.createPatch())
      .addNode('fork-only')
      .commit();

    // Verify original has shared + original-only
    await graph.materialize();
    const origNodes = await graph.getNodes();
    expect(origNodes).toContain('shared');
    expect(origNodes).toContain('original-only');
    expect(origNodes).not.toContain('fork-only');

    // Verify fork has shared + fork-only
    await forkedGraph.materialize();
    const forkNodes = await forkedGraph.getNodes();
    expect(forkNodes).toContain('shared');
    expect(forkNodes).toContain('fork-only');
    expect(forkNodes).not.toContain('original-only');
  });
});
