# Trust Model Specification

> **Spec Version:** 1 (draft)
> **Status:** Draft
> **Paper References:** Paper III Section 4 (BTRs), Paper IV Section 3 (observer geometry)

---

## 1. Introduction

This document specifies the **trust configuration** layer for WARP graphs — a mechanism for declaring which writers are trusted without requiring cryptographic identity (GPG/SSH signatures). The model is **"Integrity without Identity"**: content-addressing and chain-linking provide tamper-evidence, while the trust configuration provides a declarative allowlist for writer evaluation.

### Design Principles

1. **Fail-open default:** Without trust configuration, all writers are accepted. Trust is opt-in.
2. **Fail-closed on pin error:** If a pinned trust commit is invalid, verification fails rather than falling back to the live ref.
3. **CAS-protected updates:** Trust config changes are protected by compare-and-swap, preventing concurrent mutation.
4. **Content-addressed snapshots:** Each trust configuration is stored as a canonical JSON blob in a Git commit tree, enabling deterministic digest computation.
5. **Separation of integrity and trust:** The `verify-audit` command produces two independent verdicts — integrity (chain structure) and trust (writer allowlist).
6. **Domain purity:** Domain services (`src/domain/`) never read `process.env` or other ambient runtime state. Runtime configuration is resolved at the adapter boundary (CLI layer).

### Scope

This spec defines:

- Trust configuration schema and field constraints
- Git ref layout and object structure
- Canonical serialization and digest computation
- Trust policies and evaluation semantics
- Integration with audit verification
- Diagnostic checks (doctor)

This spec does NOT define:

- GPG/SSH signature verification (orthogonal; layered via Git's native signing)
- Trust anchoring via external witnesses or transparency logs
- Multi-party quorum policies (reserved for future release)

---

## 2. Terminology

| Term | Definition |
|---|---|
| **Trust ref** | Git ref at `refs/warp/<graph>/trust/root` pointing to the latest trust commit. |
| **Trust commit** | A Git commit whose tree contains a `trust.json` blob with the trust configuration. |
| **Trust config** | The JSON object stored in `trust.json`, describing which writers are trusted and under what policy. |
| **Genesis commit** | The first trust commit (no parents). Created by `initTrust()`. |
| **Snapshot digest** | Domain-separated SHA-256 hash of the canonical trust config JSON. |
| **Pin** | A specific trust commit SHA used for deterministic verification (bypasses the live ref). |
| **Policy** | A string declaring how untrusted writers are handled during evaluation. |
| **Epoch** | ISO-8601 timestamp establishing a monotonic ordering of trust config versions. |

---

## 3. Trust Configuration Schema

### 3.1 Fields

Every trust config contains exactly 6 fields. No optional fields. Nulls are allowed where specified.

| Field | Type | Constraints |
|---|---|---|
| `version` | `integer` | Must be `1`. Future versions will increment. |
| `trustedWriters` | `string[]` | Sorted, deduplicated array of writer IDs. May be empty. |
| `policy` | `string` | One of: `"any"`, `"all_writers_must_be_trusted"`. See Section 5. |
| `epoch` | `string` | Non-empty ISO-8601 timestamp. Must be monotonically non-decreasing across updates. |
| `requiredSignatures` | `integer \| null` | Reserved for future use. Must be `null` in v1. |
| `allowedSignersPath` | `string \| null` | Reserved for future use. Must be `null` in v1. |

### 3.2 Writer List Normalization

At the parse boundary (Zod schema), writer IDs are:

1. Trimmed of leading/trailing whitespace
2. Filtered to remove empty strings
3. Deduplicated
4. Sorted lexicographically

This normalization is applied once and never re-sorted downstream.

### 3.3 Validation

The Zod schema (`trustConfigSchema`) enforces:

- `version` must be literal `1`
- `trustedWriters` must be an array of strings
- `policy` must be a non-empty string
- `epoch` must be a non-empty string
- `requiredSignatures` must be a non-negative integer or null
- `allowedSignersPath` must be a string or null
- No additional fields (`strict()`)

Post-schema validation:

- Reserved policies (e.g., `"allowlist_with_exceptions"`) throw `E_TRUST_POLICY_RESERVED`
- Unknown policies throw `E_TRUST_SCHEMA_INVALID`

---

## 4. Git Object Structure

### 4.1 Ref Layout

```text
refs/warp/<graphName>/trust/root → <trust commit SHA>
```

The trust ref is independent of writer refs, checkpoint refs, and audit refs. It forms its own linear chain.

### 4.2 Commit Structure

```text
trust commit:
  tree:
    trust.json    # 100644 blob — canonical JSON (Section 6)
  parents: [prevTrustCommit] or [] for genesis
  message: "trust: init ..." or "trust: update by <actor> ..."
```

### 4.3 Genesis Commit

- Git parents: empty (`[]`)
- Created by `initTrust()` or `initFromWriters()`
- Ref created via `compareAndSwapRef(ref, sha, null)` — fails if ref already exists

### 4.4 Update Commit

- Git parents: exactly one parent (the previous trust commit)
- Created by `updateTrust(newConfig, actor)`
- Ref updated via `compareAndSwapRef(ref, sha, expectedTip)` — fails on CAS mismatch

---

## 5. Trust Policies

### 5.1 Supported Policies

| Policy | Behavior |
|---|---|
| `"any"` | All writers are accepted. Untrusted writers receive an explanatory note but are not rejected. This is the default. |
| `"all_writers_must_be_trusted"` | Only writers listed in `trustedWriters` are accepted. Unlisted writers appear in `untrustedWriters`. |

### 5.2 Reserved Policies

| Policy | Status |
|---|---|
| `"allowlist_with_exceptions"` | Reserved for future release. Throws `E_TRUST_POLICY_RESERVED`. |

### 5.3 Evaluation Semantics

The `evaluateWriters(writerIds, config)` method returns:

```javascript
{
  evaluatedWriters: string[],   // All writers that passed evaluation
  untrustedWriters: string[],   // Writers that failed evaluation
  explanations: [               // Per-writer reasoning
    { writerId: string, trusted: boolean, reason: string }
  ]
}
```

Evaluation logic:

1. For each writer ID (sorted):
   - If in `trustedWriters` → trusted, reason: `"listed in trustedWriters"`
   - If not in `trustedWriters` and policy is `"any"` → evaluated (not rejected), reason: `"not in trustedWriters, but policy=any allows all"`
   - If not in `trustedWriters` and policy is `"all_writers_must_be_trusted"` → untrusted, reason: `"not in trustedWriters, policy requires trust"`

---

## 6. Canonical Serialization

### 6.1 Canonical JSON

Trust configs are serialized using `canonicalStringify()` — `JSON.stringify` with a replacer that sorts object keys alphabetically at every nesting level. This produces deterministic output regardless of property insertion order.

### 6.2 Snapshot Digest

```text
digest = SHA-256("git-warp:trust:v1\0" + canonicalJson)
```

The domain-separated prefix `"git-warp:trust:v1\0"` prevents cross-domain digest collisions. The digest is computed via `WebCryptoAdapter` (or any `CryptoPort` implementation) and returned as a lowercase hex string.

### 6.3 Digest Availability

The snapshot digest is only available when a crypto adapter is provided. Without crypto, `snapshotDigest` is `null`. This is acceptable because the Git commit SHA already provides content-addressing — the snapshot digest is an additional verification mechanism.

---

## 7. Integration with Audit Verification

### 7.1 Dual Verdicts

The `verify-audit` command produces two independent verdicts:

| Verdict | Scope | Values |
|---|---|---|
| `integrityVerdict` | Chain structure (receipt linking, schema, trailers) | `"pass"` or `"fail"` |
| `trustVerdict` | Writer allowlist evaluation | `"pass"`, `"degraded"`, `"fail"`, or `"not_configured"` |

### 7.2 Trust Verdict Derivation

```text
if trust.status == "not_configured" → "not_configured"
if trust.status == "error"          → "fail"
if trust.untrustedWriters.length > 0 → "degraded"
otherwise                           → "pass"
```

### 7.3 Trust Assessment

The `verifyAll()` method returns a `TrustAssessment` object:

```javascript
{
  status: "not_configured" | "configured" | "pinned" | "error",
  source: "ref" | "cli_pin" | "env_pin" | "none",
  sourceDetail: string | null,
  ref: string | null,
  commit: string | null,
  policy: string | null,
  evaluatedWriters: string[],
  untrustedWriters: string[],
  explanations: [{ writerId, trusted, reason }],
  snapshotDigest: string | null
}
```

### 7.4 Pin Resolution Priority

1. `--trust-ref-tip <sha>` (CLI pin) — highest priority
2. `WARP_TRUSTED_ROOT` environment variable (env pin)
3. Live ref at `refs/warp/<graph>/trust/root`

Invalid pins fail closed — no fallback to the live ref.

### 7.5 `--trust-required` Flag

When `--trust-required` is passed:

- Exit code is non-zero if `trustVerdict` is not `"pass"`
- This enables CI gates that require trust configuration

---

## 8. Trust Doctor

The `trust doctor` subcommand performs diagnostic checks on the trust ref:

| Check ID | Condition | Status |
|---|---|---|
| `TRUST_REF_EXISTS` | Ref resolves to a valid SHA | `ok` |
| `TRUST_REF_MISSING` | Ref does not exist | `fail` |
| `TRUST_SCHEMA_VALID` | `trust.json` parses and validates | `ok` |
| `TRUST_SCHEMA_INVALID` | Parse or validation failure | `fail` |
| `TRUST_WRITERS_PRESENT` | `trustedWriters` is non-empty | `ok` |
| `TRUST_WRITERS_EMPTY` | `trustedWriters` is empty | `warn` |
| `TRUST_POLICY_SUPPORTED` | Policy is a known supported value | `ok` |
| `TRUST_PIN_VALID` | Pinned SHA resolves and contains valid trust.json | `ok` |
| `TRUST_PIN_INVALID` | Pinned SHA is invalid | `fail` |

### `--strict` Mode

When `--strict` is passed, any `fail` finding causes a non-zero exit code. Without `--strict`, neither `fail` nor `warn` findings affect the exit code. Note: unlike `git warp doctor` (which treats both `fail` and `warn` as exit-code-triggering under `--strict`), `trust doctor --strict` only treats `fail` findings as exit-code-triggering; `warn` findings are ignored for exit status.

---

## 9. Error Codes

| Code | Thrown When |
|---|---|
| `E_TRUST_SCHEMA_INVALID` | Malformed `trust.json` or failed Zod validation |
| `E_TRUST_REF_CONFLICT` | CAS mismatch when creating or updating trust ref |
| `E_TRUST_PIN_INVALID` | Pinned commit does not exist or has invalid content |
| `E_TRUST_NOT_CONFIGURED` | Trust ref does not exist (for update operations) |
| `E_TRUST_POLICY_RESERVED` | Policy value reserved for future release |
| `E_TRUST_EPOCH_REGRESSION` | New epoch predates current epoch |

---

## 10. Threat Model

### What Trust Configuration Protects Against

1. **Unknown writer detection:** Operators can identify writers that are not in the trusted set, catching unauthorized graph modifications.
2. **Policy enforcement in CI:** The `--trust-required` flag ensures that audit verification fails if trust is not configured or if untrusted writers are present.
3. **Pinned verification:** By pinning to a specific trust commit SHA, operators can perform deterministic verification that is immune to trust ref mutation.

### What Trust Configuration Does NOT Protect Against

1. **Writer impersonation:** Writer IDs are self-declared strings, not cryptographic identities. A malicious actor with repo write access can use any writer ID. For cryptographic identity, layer Git's `--sign` mechanism.
2. **Trust ref replacement:** An adversary with ref-write access can replace the entire trust chain (same limitation as audit chains). Use external anchoring (signed checkpoints, transparency logs) for stronger guarantees.
3. **Time-of-check/time-of-use:** The trust config is read at verification time. If the ref is mutated between read and use, the evaluation may be stale. Pinning mitigates this.

### Defense in Depth

The trust layer is designed to compose with other mechanisms:

- **Content-addressing** (Git SHAs) provides tamper-evidence
- **CAS protection** prevents concurrent mutation
- **Epoch monotonicity** prevents rollback to older configs
- **Domain-separated digests** prevent cross-domain hash collision
- **Dual verdicts** (integrity + trust) ensure neither dimension masks the other

---

## 11. CLI Reference

### `git warp trust init`

Creates the genesis trust commit.

```bash
# Empty trust config with default policy
git warp trust init

# Seed from existing writer refs
git warp trust init --from-writers

# Custom policy
git warp trust init --policy all_writers_must_be_trusted
```

### `git warp trust show`

Displays the current trust configuration.

```bash
git warp trust show
git warp --json trust show
```

### `git warp trust doctor`

Runs diagnostic checks on the trust ref.

```bash
git warp trust doctor
git warp --json trust doctor
git warp trust doctor --strict
git warp trust doctor --pin <sha>
```

### `git warp verify-audit` (trust flags)

```bash
# Include trust evaluation
git warp verify-audit

# Pin to specific trust commit
git warp verify-audit --trust-ref-tip <sha>

# Require trust to pass
git warp verify-audit --trust-required
```
