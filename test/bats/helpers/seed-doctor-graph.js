/**
 * Seeds a "healthy" demo graph for doctor BATS tests.
 * Creates patches, materializes (checkpoint + coverage), and installs hooks.
 * Expects REPO_PATH env var.
 */
import { WarpGraph, persistence, crypto } from './seed-setup.js';

const graph = await WarpGraph.open({
  persistence,
  graphName: 'demo',
  writerId: 'alice',
  crypto,
});

const patchOne = await graph.createPatch();
await patchOne
  .addNode('user:alice')
  .setProperty('user:alice', 'role', 'engineering')
  .addNode('user:bob')
  .setProperty('user:bob', 'role', 'engineering')
  .commit();

const patchTwo = await graph.createPatch();
await patchTwo
  .addEdge('user:alice', 'user:bob', 'follows')
  .commit();

// Materialize to create checkpoint + coverage refs
await graph.materialize();
