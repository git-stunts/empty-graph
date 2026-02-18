#!/usr/bin/env node

/**
 * TS policy checker — enforces type safety rules in source files (src/, bin/, scripts/):
 *
 * 1. Ban @ts-ignore — use @ts-expect-error instead.
 * 2. Ban wildcard casts: `@type {*}`, `@type {any}`.
 * 3. Ban embedded wildcards in JSDoc type params: Record<string, *>, Array<*>, etc.
 * 4. Ban z.any() — use z.custom() or z.unknown() instead.
 *
 * Exit 0 when clean, 1 when violations found.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DIRS = ['src', 'bin', 'scripts'];
const SELF = relative(ROOT, new URL(import.meta.url).pathname);

/** @param {string} dir @returns {AsyncGenerator<string>} */
async function* walkJs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkJs(full);
    } else if (entry.name.endsWith('.js')) {
      yield full;
    }
  }
}

// ── Rule patterns ───────────────────────────────────────────────────────────

// Rule 1: @ts-ignore
const TS_IGNORE_RE = /@ts-ignore\b/;

// Rule 2: Bare wildcard casts — @type {*} or @type {any}
const WILDCARD_CAST_RE = /@type\s+\{(\*|any)\}/;

// Rule 3: Embedded wildcards in generic JSDoc types
//   Catches: Record<string, *>, Array<*>, Map<string, *>, {[k:string]: *}
//   Does NOT match inside import() paths or comments unrelated to @type.
const EMBEDDED_WILDCARD_RE = /(?:@type|@param|@returns|@typedef)\s.*(?:<[^>]*\*[^>]*>|\{\[[\w:]+\]:\s*\*\})/;

// Rule 4: z.any() in Zod schemas
const ZOD_ANY_RE = /z\.any\(\)/;

async function check() {
  const violations = [];

  for (const dir of DIRS) {
    const abs = join(ROOT, dir);
    for await (const filePath of walkJs(abs)) {
      const rel = relative(ROOT, filePath);
      if (rel === SELF) {
        continue;
      }
      const content = await readFile(filePath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Rule 1
        if (TS_IGNORE_RE.test(line)) {
          violations.push(`${rel}:${i + 1}: error: use @ts-expect-error instead of @ts-ignore`);
        }

        // Rule 2
        if (WILDCARD_CAST_RE.test(line)) {
          violations.push(`${rel}:${i + 1}: error: wildcard cast @type {*}/@type {any} is banned`);
        }

        // Rule 3
        if (EMBEDDED_WILDCARD_RE.test(line)) {
          violations.push(`${rel}:${i + 1}: error: embedded wildcard in JSDoc type (use 'unknown' instead of '*')`);
        }

        // Rule 4
        if (ZOD_ANY_RE.test(line)) {
          violations.push(`${rel}:${i + 1}: error: z.any() is banned — use z.custom() or z.unknown()`);
        }
      }
    }
  }

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(v);
    }
    console.error(`\n${violations.length} policy violation(s) found.`);
    process.exit(1);
  }

  console.log('TS policy check passed.');
}

check();
