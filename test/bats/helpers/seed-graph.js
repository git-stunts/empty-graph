/**
 * Seeds a standard demo graph: 3 users, 2 follows edges, properties.
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

const graph = await WarpGraph.open({
  persistence,
  graphName: 'demo',
  writerId: 'alice',
});

const patchOne = await graph.createPatch();
await patchOne
  .addNode('user:alice')
  .setProperty('user:alice', 'role', 'engineering')
  .addNode('user:bob')
  .setProperty('user:bob', 'role', 'engineering')
  .addNode('user:carol')
  .setProperty('user:carol', 'role', 'marketing')
  .commit();

const patchTwo = await graph.createPatch();
await patchTwo
  .addEdge('user:alice', 'user:bob', 'follows')
  .addEdge('user:bob', 'user:carol', 'follows')
  .commit();
