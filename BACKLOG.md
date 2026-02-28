# Backlog

Items noticed during development that are worth addressing but were out of scope at the time.

> All items from the 2026-02-25 audit have been reconciled into `ROADMAP.md`.

---

## 2026-02-25 Follow-Ups

- Deno image smoke gate for native fallback prerequisites (`node-gyp` + bootstrap install probe).
- Safe PR-comment helper script to eliminate shell quoting/substitution errors.
- CI-ready summary task that combines unresolved-thread count with check statuses.
- Reduce runtime fragility around external prebuilt binaries by documenting and testing fallback behavior explicitly.
- Add an explicit local `test:deno:smoke` command for fast pre-push confidence.
- Add markdownlint to pre-commit to catch MD024 (duplicate headings) and MD040 (fenced code language) before review.
- Consider a `no-empty-catch` ESLint rule (or at least `no-catch-without-comment`) to prevent silent error swallowing.

## 2026-02-27 PR Feedback Processor Follow-Ups

- Add a repo-local `scripts/pr-feedback-status` command that fetches PR comments + review threads, classifies unresolved feedback, and prints severity buckets (`P0`-`P5`) deterministically.
- Add a small `scripts/coderabbit-cooldown` utility to parse "Rate limit exceeded" comments, compute expiry in local timezone, and print safe retry timestamps.
- Add a CI helper that fails fast when docs reference removed checkpoint artifacts (for example stale mentions like `visible.cbor`) to prevent docs/runtime drift.
- Add shared typed test helpers for extracting `vitest` spy call tuples (avoid repeated `unknown` casts in strict TS checks).
- Add `scripts/pr-ready` to aggregate unresolved review threads, pending/failed checks, CodeRabbit status, and required human-review count (`>=2`) in one deterministic output.
- Add an automated docs consistency pass in preflight to verify changelog/readme/guide updates for behavior changes in hot paths (materialize, checkpoint, sync).

## 2026-02-27 PR Feedback Session 2 Backlog Fuel

- Add schema-4 coverage for `_validatePatchAgainstCheckpoint` (`ahead`, `same`, `behind`, `diverged`) to close the current schema gate ambiguity.
- Add a checkpoint replay integrity assertion helper (optional in hot path, enabled in diagnostics) to detect parent-chain discontinuities early.
- Add benchmark budgets for eager post-commit and materialize hash cost, and fail CI on agreed regression thresholds.
- Add a `warp doctor --json` check bundle for frontier/checkpoint/index consistency, with non-destructive defaults and explicit exit codes.
- Add a frontier-fingerprint-keyed ancestry memo cache with bounded LRU and invalidation metrics.
- Add an incremental state-hash shadow mode (parity-only) that compares accumulator hash vs `computeStateHashV5` before any default rollout.

## 2026-02-27 PR Feedback Session 3 Alignment

- Add a CLI-safe helper for posting review trigger comments (`@coderabbitai review please`) only when cooldown has expired.
- Add a merge-gate script check that fails fast when CI is pending, Rabbit is unsatisfied, unresolved comments exist, or required reviewer count is unmet.

## 2026-02-27 PR Feedback Session 4 Alignment

- Update cooldown parsing logic to prefer CodeRabbit `lastEditedAt` (not `createdAt`) when the bot edits a persistent rate-limit comment.
- Add a review-trigger dedupe guard so automation does not post repeated `@coderabbitai review please` comments while a prior trigger is still in-flight.
- Extend `scripts/pr-ready` output with an explicit "human reviews missing" reason when review count is below required threshold.

---

## 2026-02-27 PR Feedback Session — Backlog Fuel

- Add a `scripts/pr-feedback-status.js` helper that classifies unresolved PR comments by severity and skips explicitly addressed items.
- Add a `scripts/pr-ready.js` command that merges PR comments/checks/reviews/cooldown into a single merge-readiness verdict.
- Add a trust payload parity test suite that asserts CLI `trust` and `AuditVerifierService.evaluateTrust()` emit shape-compatible error payloads.
- Add adapter-level typed error contracts (`E_REF_NOT_FOUND`, `E_REF_IO`) to remove trust-path string matching on error messages.
- Add `CachedValue` semantic tests for `null` payload caching behavior and document whether `null` is a valid cached value.
- Add a reusable `gh` cooldown utility that computes and prints cooldown-expiry timestamps from CodeRabbit comments.
- Add a CI artifact/comment that summarizes unresolved reviewer issues by severity and links to evidence lines.
- Add branch-governance checks that enforce minimum human review count before merge readiness is reported.
- Add a contributor guide section for “review-loop hygiene” (commit sizing, cooldown strategy, and when to request bot review).

---

## 2026-02-27 PR Feedback Session (Round 2) — Backlog Fuel

- Add a `scripts/pr-feedback-scan.js` command that inspects both issue comments and inline review comments (`pulls/{n}/comments`) in one pass.
- Add a lightweight resolver marker convention (`✅ Addressed in commits: <sha>`) linter/check that flags unresolved reviewer comments before push.
- Add a review-readiness CI summary that fails fast when there are 0 human reviews, even if all status checks are green.
- Add contract tests for bot cooldown parsing to verify local-time and UTC cooldown-expiry computations match.
- Add a `docs/review-playbook.md` page with a strict "no-merge gate" matrix (checks, reviews, unresolved comments, rate limits).
- Add a nightly PR hygiene job that reports PRs with green CI but missing required human reviews.
- Add a pre-push helper that prints `gh pr checks` and unresolved-comment counts in one concise table.
- Add an integration test that verifies repeated `@coderabbitai review` commands do not mask unresolved inline review threads.
