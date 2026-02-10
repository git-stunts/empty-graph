#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * TypeScript error ratchet — ensures error counts never increase.
 *
 * Usage:
 *   node scripts/ts-ratchet.js          # check against baseline
 *   node scripts/ts-ratchet.js --update # update baseline to current counts
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASELINE_PATH = join(ROOT, 'ts-error-baseline.json');

/** @param {string | null} project */
function countErrors(project) {
  const flag = project ? ` -p ${project}` : '';
  try {
    execSync(`npx tsc --noEmit${flag} --pretty false`, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return 0;
  } catch (/** @type {any} */ err) {
    const output = (err.stdout || '').toString() + (err.stderr || '').toString();
    const lines = output.split('\n');
    let count = 0;
    for (const line of lines) {
      if (/\berror TS\d+:/.test(line)) {
        count++;
      }
    }
    return count;
  }
}

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {{ src: number, test: number, total: number }} data */
function writeBaseline(data) {
  writeFileSync(BASELINE_PATH, JSON.stringify(data, null, 2) + '\n');
}

const isUpdate = process.argv.includes('--update');

console.log('Counting TypeScript errors...');
const src = countErrors('tsconfig.src.json');
const test = countErrors('tsconfig.test.json');
const total = countErrors(null);

const current = { src, test, total };
console.log(`  src:   ${src}`);
console.log(`  test:  ${test}`);
console.log(`  total: ${total}`);

if (isUpdate) {
  writeBaseline(current);
  console.log(`\nBaseline updated: ${BASELINE_PATH}`);
  process.exit(0);
}

const baseline = readBaseline();
if (!baseline) {
  console.error('\nNo baseline found. Run with --update to create one.');
  process.exit(1);
}

console.log('\nBaseline:');
console.log(`  src:   ${baseline.src}`);
console.log(`  test:  ${baseline.test}`);
console.log(`  total: ${baseline.total}`);

let failed = false;
for (const key of /** @type {const} */ (['src', 'test', 'total'])) {
  if (current[key] > baseline[key]) {
    console.error(`\nREGRESSION: ${key} errors increased from ${baseline[key]} to ${current[key]}`);
    failed = true;
  } else if (current[key] < baseline[key]) {
    console.log(`\nIMPROVED: ${key} errors decreased from ${baseline[key]} to ${current[key]}`);
    console.log(`  Run 'node scripts/ts-ratchet.js --update' to lower the baseline.`);
  }
}

if (failed) {
  console.error('\nRatchet check FAILED. Fix type errors before pushing.');
  process.exit(1);
}

if (current.total === 0) {
  console.log('\nZERO errors! The ratchet can be replaced with a hard gate.');
}

console.log('\nRatchet check passed.');
