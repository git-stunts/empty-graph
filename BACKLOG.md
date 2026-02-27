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
