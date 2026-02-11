# SEEKDIFF Code Review — Fixups

Deep self-review of `seekdiff` branch (commit `9f3e02a`).
Severity: **BUG** = correctness issue, **PERF** = wasted work, **UX** = user-facing rough edge, **NIT** = code quality / style.

---

## BUG

- [x] **B1. `--diff-limit=0` produces misleading output.** Rejected `0` at parse time — validation now requires a positive integer (`n < 1`). Added BATS test for `--diff-limit=0`, `--diff-limit=-1`, and missing value.
  - **Fix:** `bin/warp-graph.js` — `handleDiffLimitFlag` validation changed from `n < 0` to `n < 1`

---

## PERF

- [x] **P1. Triple materialization in the `latest` action.** When `--diff` already materialized at `maxTick`, skip the redundant `graph.materialize()` call. Non-diff path now uses `{ ceiling: maxTick }` for consistency.
  - **Fix:** `bin/warp-graph.js` — `if (!sdResult) { await graph.materialize({ ceiling: maxTick }); }`

- [x] **P2. Redundant re-materialization in `tick` and `load` actions.** Same pattern: skip `materialize()` when `computeStructuralDiff` already left the graph at the target tick.
  - **Fix:** `bin/warp-graph.js` — `if (!sdResult) { await graph.materialize(...) }` in both paths

- [x] **P3. No short-circuit when `prevTick === currentTick`.** Added early return with empty diff result when ticks are identical.
  - **Fix:** `bin/warp-graph.js` — `computeStructuralDiff` returns empty diff immediately

---

## UX

- [x] **U1. `--diff` and `--diff-limit` missing from `HELP_TEXT`.** Added both flags to the Seek options section.
  - **Fix:** `bin/warp-graph.js` — `HELP_TEXT`

- [x] **U2. `--diff` silently ignored on `--save`, `--drop`, `--list`, `--clear-cache`.** Added validation at end of `parseSeekArgs`: `--diff` rejects with usage error when combined with non-navigating actions. Allowed on `status`, `tick`, `latest`, `load`. Added BATS test for `--save --diff` rejection.
  - **Fix:** `bin/warp-graph.js` — `DIFF_ACTIONS` set check after parse loop

- [x] **U3. Display truncation hides data-level truncation hint.** Combined message now shown when both display and data truncation are active: `"... and N more changes (N total, use --diff-limit to increase)"`. Added unit test.
  - **Fix:** `src/visualization/renderers/ascii/seek.js` — `buildStructuralDiffLines` three-way if/else

- [x] **U4. Truncation strategy is greedy, not proportional (misleading comment).** Fixed comment to say "greedy in category order."
  - **Fix:** `bin/warp-graph.js` — comment at `applyDiffLimit`

---

## NIT

- [x] **N1. `getStateSnapshot()` JSDoc type in CLI typedef uses `@property {() => Promise<*>}`.** Fixed to reference `WarpStateV5 | null`.
  - **Fix:** `bin/warp-graph.js` — `WarpGraphInstance` typedef

- [x] **N2. `formatStructuralDiff(payload)` on the status render path is dead code.** Removed the dead call; added comment explaining status never carries diff data.
  - **Fix:** `bin/warp-graph.js` — `renderSeek` status branch

- [x] **N3. `applyDiffLimit` comment says "proportionally" — see U4.** Fixed alongside U4.
  - **Fix:** `bin/warp-graph.js`

- [x] **N4. `buildStructuralDiffLines` uses magic number 20 in two places.** Moved `MAX_DIFF_LINES` constant above `buildFooterLines` so both call sites reference the constant.
  - **Fix:** `src/visualization/renderers/ascii/seek.js` — hoisted constant

- [x] **N5. `collectDiffEntries` uses `@param {*}` for the diff parameter.** Changed to `import(...).StateDiffResult`.
  - **Fix:** `src/visualization/renderers/ascii/seek.js`

- [x] **N6. `buildStructuralDiffLines` uses `@param {*}` for the payload parameter.** Changed to `SeekPayload`.
  - **Fix:** `src/visualization/renderers/ascii/seek.js`

- [x] **N7. No unit test for `--diff-limit` argument parsing edge cases.** Added 4 BATS tests: `--diff-limit=0` rejected, `--diff-limit` without value rejected, `--diff-limit=-1` rejected, `--diff --save` rejected.
  - **Fix:** `test/bats/cli-seek.bats`

- [x] **N8. No test for `--diff` combined with `--latest` or `--load`.** Added BATS test for `--latest --diff --json`. Added 2 renderer unit tests for `latest` and `load` action payloads with `structuralDiff`. Added 1 unit test for combined display+data truncation.
  - **Fix:** `test/bats/cli-seek.bats`, `test/unit/visualization/ascii-seek-renderer.test.js`

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| BUG      | 1     | 1     |
| PERF     | 3     | 3     |
| UX       | 4     | 4     |
| NIT      | 8     | 8     |
| **Total**| **16**| **16**|

### Verification

- `npx eslint` — clean
- `npx vitest run` — 3209 passed, 0 regressions (8 pre-existing failures: 7 Deno/Docker-only, 1 flaky EPIPE)
