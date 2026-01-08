import { performance } from 'perf_hooks';
import GitPlumbing from '../node_modules/@git-stunts/plumbing/index.js';
import EmptyGraph from '../index.js';
import { mkdtempSync, rmSync, writeFileSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

async function fastGenerate(tempDir, count) {
  const importPath = path.join(tempDir, 'import.txt');
  const stream = createWriteStream(importPath);
  
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    stream.write(`commit refs/heads/main\n`);
    stream.write(`mark :${i + 1}\n`);
    stream.write(`committer Stuntman <stunt@example.com> ${now + i} +0000\n`);
    const msg = `Node ${i} Payload`;
    stream.write(`data ${Buffer.byteLength(msg)}\n${msg}\n`);
    if (i > 0) {
      stream.write(`from :${i}\n`);
    } else {
      stream.write(`deleteall\n`);
    }
    stream.write(`\n`);
  }
  
  await new Promise(resolve => stream.end(resolve));
  execSync(`git fast-import < import.txt`, { cwd: tempDir, stdio: 'inherit' });
}

async function runBenchmark(nodeCount) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), `eg-bench-${nodeCount}-`));
  const plumbing = new GitPlumbing({
    runner: (options) => {
        const { exec } = require('node:child_process');
        return new Promise((resolve, reject) => {
            const proc = exec(`${options.command} ${options.args.join(' ')}`, { cwd: options.cwd }, (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({ stdoutStream: require('node:stream').Readable.from(stdout), exitPromise: Promise.resolve({code: 0}) });
            });
            if (options.input) proc.stdin.write(options.input);
            proc.stdin.end();
        });
    },
    cwd: tempDir 
  });
  
  // Real implementation uses ShellRunnerFactory, but in Docker we just use the default.
  // Actually, let's just use the factory.
  const realPlumbing = GitPlumbing.createDefault({ cwd: tempDir });

  await realPlumbing.execute({ args: ['init', '-b', 'main'] });
  await realPlumbing.execute({ args: ['config', 'user.name', 'Stuntman'] });
  await realPlumbing.execute({ args: ['config', 'user.email', 'stunt@example.com'] });

  const graph = new EmptyGraph({ plumbing: realPlumbing });
  
  process.stdout.write(`\n🚀 Scaling to ${nodeCount} nodes... `);
  
  const genStart = performance.now();
  await fastGenerate(tempDir, nodeCount);
  const genTime = performance.now() - genStart;
  process.stdout.write(`Gen: ${(genTime/1000).toFixed(2)}s `);

  const lastSha = (await realPlumbing.execute({ args: ['rev-parse', 'main'] })).trim();

  // 1. O(N) Scan (Sample first 5000 nodes)
  const scanLimit = Math.min(nodeCount, 5000);
  const scanStart = performance.now();
  const nodes = [];
  for await (const node of graph.service.iterateNodes({ ref: lastSha, limit: scanLimit })) {
    nodes.push(node);
  }
  const scanTime = performance.now() - scanStart;
  const projectedScanTime = (scanTime / scanLimit) * nodeCount;

  // 2. Build Index
  const buildStart = performance.now();
  const treeOid = await graph.rebuildIndex(lastSha);
  const buildTime = performance.now() - buildStart;
  process.stdout.write(`Build: ${(buildTime/1000).toFixed(2)}s `);

  // 3. Cold Load
  const coldLoadStart = performance.now();
  const indexCold = await graph.rebuildService.load(treeOid);
  const coldLoadTime = performance.now() - coldLoadStart;
  process.stdout.write(`Load: ${coldLoadTime.toFixed(2)}ms `);

  // 4. Hot Lookup
  const targetSha = lastSha; 
  const hotLookupStart = performance.now();
  const id = indexCold.getId(targetSha);
  const hotLookupTime = performance.now() - hotLookupStart;
  process.stdout.write(`Lookup: ${hotLookupTime.toFixed(4)}ms `);

  rmSync(tempDir, { recursive: true, force: true });

  return {
    nodeCount,
    genTimeMs: genTime,
    scanTimeMs: scanLimit === nodeCount ? scanTime : projectedScanTime,
    buildTimeMs: buildTime,
    coldLoadTimeMs: coldLoadTime,
    hotLookupTimeMs: hotLookupTime
  };
}

async function main() {
  if (process.env.GIT_STUNTS_DOCKER !== '1') {
    console.error('🚫 RUN IN DOCKER ONLY');
    process.exit(1);
  }

  const scales = [1000, 10000, 100000]; 
  const results = [];

  for (const scale of scales) {
    results.push(await runBenchmark(scale));
  }

  const resultsPath = path.join(process.cwd(), 'benchmarks/results.json');
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n\n✅ Benchmark complete! Data saved to ${resultsPath}`);
}

main().catch(console.error);