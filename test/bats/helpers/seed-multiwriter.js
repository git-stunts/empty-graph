/**
 * Seeds a multi-writer graph: alice, bob, charlie each add nodes.
 * Used by BATS tests. Expects REPO_PATH env var.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

const projectRoot = process.env.PROJECT_ROOT || resolve(import.meta.dirname, '../../..');
const repoPath = process.env.REPO_PATH;

const warpGraphUrl = pathToFileURL(resolve(projectRoot, 'src/domain/WarpGraph.js')).href;
const adapterUrl = pathToFileURL(resolve(projectRoot, 'src/infrastructure/adapters/GitGraphAdapter.js')).href;
const { default: WarpGraph } = await import(warpGraphUrl);
const { default: GitGraphAdapter } = await import(adapterUrl);

const runner = ShellRunnerFactory.create();
const plumbing = new GitPlumbing({ cwd: repoPath, runner });
const persistence = new GitGraphAdapter({ plumbing });

// Alice
const alice = await WarpGraph.open({ persistence, graphName: 'demo', writerId: 'alice' });
await (await alice.createPatch())
  .addNode('user:alice')
  .setProperty('user:alice', 'role', 'engineering')
  .commit();
await (await alice.createPatch())
  .addNode('project:alpha')
  .addEdge('user:alice', 'project:alpha', 'owns')
  .commit();

// Bob
const bob = await WarpGraph.open({ persistence, graphName: 'demo', writerId: 'bob' });
await (await bob.createPatch())
  .addNode('user:bob')
  .setProperty('user:bob', 'role', 'design')
  .commit();
await (await bob.createPatch())
  .addEdge('user:bob', 'project:alpha', 'contributes')
  .commit();

// Charlie
const charlie = await WarpGraph.open({ persistence, graphName: 'demo', writerId: 'charlie' });
await (await charlie.createPatch())
  .addNode('user:charlie')
  .setProperty('user:charlie', 'role', 'marketing')
  .commit();
