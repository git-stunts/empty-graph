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

## 2026-02-27 PR Feedback Follow-Ups

- Add `scripts/pr-review-triage.sh` to summarize unresolved/outdated review threads via GraphQL.
- Add a CI helper that reports review-comment commit SHA drift versus PR head SHA.
- Add maintainer docs for stale-review triage protocol (validate on current HEAD, cite evidence, resolve outdated threads safely).
- Add `npm run pr:review-status` to standardize merge-readiness checks (threads, checks, review count, cooldown status).
- Add CI merge gating that fails when unresolved review threads remain.
- Add CI/pre-merge guard to require latest bot review cycle completion before merge.
- Add repository merge protection policy for minimum review count threshold.
- Add maintainer playbook for CodeRabbit cooldown/retrigger timing to avoid unnecessary pings.
- Add anti-spam guidance for repeated `@coderabbitai review` comments when no new commits exist.
