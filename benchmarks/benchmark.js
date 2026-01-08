import { performance } from 'perf_hooks';
import GitPlumbing from '../../plumbing/index.js';
import EmptyGraph from '../index.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function runBenchmark(nodeCount) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), `eg-bench-${nodeCount}-`));
  const plumbing = GitPlumbing.createDefault({ cwd: tempDir });
  await plumbing.execute({ args: ['init'] });
  await plumbing.execute({ args: ['config', 'user.name', 'Stuntman'] });
  await plumbing.execute({ args: ['config', 'user.email', 'stunt@example.com'] });

  const graph = new EmptyGraph({ plumbing });
  
  process.stdout.write(`\n🚀 Scaling to ${nodeCount} nodes... `);
  
  let lastSha = null;
  const shas = [];
  const genStart = performance.now();
  
  for (let i = 0; i < nodeCount; i++) {
    const parents = lastSha ? [lastSha] : [];
    lastSha = await graph.createNode({ message: `Node ${i} Payload`, parents });
    shas.push(lastSha);
    if (i % (nodeCount/10) === 0) process.stdout.write('.');
  }
  const genTime = performance.now() - genStart;

  // Linear Scan
  const scanStart = performance.now();
  const nodes = await graph.listNodes({ ref: lastSha, limit: nodeCount });
  const scanTime = performance.now() - scanStart;

  // Build Index
  const buildStart = performance.now();
  const treeOid = await graph.rebuildIndex(lastSha);
  const buildTime = performance.now() - buildStart;

  // Indexed Lookup
  const loadStart = performance.now();
  const index = await graph.rebuildService.load(treeOid);
  const loadTime = performance.now() - loadStart;

  const lookupStart = performance.now();
  const targetSha = shas[Math.floor(nodeCount / 2)];
  const id = index.getId(targetSha); // This should be fast map lookup
  const lookupTime = performance.now() - lookupStart;

  rmSync(tempDir, { recursive: true, force: true });

  return {
    nodeCount,
    genTimeMs: genTime,
    scanTimeMs: scanTime,
    buildTimeMs: buildTime,
    loadTimeMs: loadTime,
    lookupTimeMs: lookupTime
  };
}

async function main() {
  const scales = [100, 500, 1000, 2000]; // Scaled down for speed, but enough to show the curve
  const results = [];

  for (const scale of scales) {
    results.push(await runBenchmark(scale));
  }

  const resultsPath = path.join(process.cwd(), '../empty-graph/benchmarks/results.json');
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n\n✅ Benchmark complete! Data saved to ${resultsPath}`);
}

main().catch(console.error);