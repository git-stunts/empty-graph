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
- Add a lightweight "PR hygiene" checklist command that reports: unresolved review threads, pending checks, and merge-blocking conditions in one output.
- Add an automated docs consistency pass in preflight to verify changelog/readme/guide updates for behavior changes in hot paths (materialize, checkpoint, sync).
