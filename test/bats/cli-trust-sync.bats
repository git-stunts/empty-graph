#!/usr/bin/env bats

# BATS E2E tests for trust evaluation with multiple writers.
#
# Tests trust gate behavior via `git warp trust` with a pre-seeded
# graph containing alice (trusted) and bob (untrusted).
#
# Tests:
# 1. --mode enforce + untrusted writer → exit 4
# 2. --mode warn + untrusted writer → exit 0
# 3. --json shape includes evaluatedWriters and untrustedWriters
# 4. trusted-only graph → pass

load helpers/setup.bash

# ── Enforce mode ─────────────────────────────────────────────────────────────

@test "trust-sync: enforce + untrusted writer → exit 4" {
  setup_test_repo
  seed_graph "seed-trust-sync.js"

  run git warp --repo "${TEST_REPO}" --graph demo --json trust --mode enforce
  [ "$status" -eq 4 ]

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["trustVerdict"] == "fail", f"Expected fail, got {data['trustVerdict']}"
assert "bob" in data["trust"]["untrustedWriters"], \
    f"Expected bob in untrustedWriters: {data['trust']['untrustedWriters']}"
PY

  teardown_test_repo
}

# ── Warn mode ────────────────────────────────────────────────────────────────

@test "trust-sync: warn + untrusted writer → exit 0" {
  setup_test_repo
  seed_graph "seed-trust-sync.js"

  run git warp --repo "${TEST_REPO}" --graph demo --json trust --mode warn
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["trustVerdict"] in ("pass", "fail"), \
    f"Unexpected verdict: {data['trustVerdict']}"
PY

  teardown_test_repo
}

# ── JSON shape ───────────────────────────────────────────────────────────────

@test "trust-sync: JSON has evaluatedWriters and untrustedWriters" {
  setup_test_repo
  seed_graph "seed-trust-sync.js"

  run git warp --repo "${TEST_REPO}" --graph demo --json trust
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])

trust = data["trust"]
assert isinstance(trust["evaluatedWriters"], list), \
    f"evaluatedWriters should be a list: {type(trust['evaluatedWriters'])}"
assert isinstance(trust["untrustedWriters"], list), \
    f"untrustedWriters should be a list: {type(trust['untrustedWriters'])}"
assert len(trust["evaluatedWriters"]) >= 2, \
    f"Expected at least 2 evaluated writers, got {len(trust['evaluatedWriters'])}"
PY

  teardown_test_repo
}

# ── Trusted only ─────────────────────────────────────────────────────────────

@test "trust-sync: trusted-only graph → pass" {
  setup_test_repo
  seed_graph "seed-trust.js"

  run git warp --repo "${TEST_REPO}" --graph demo --json trust --mode enforce
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert data["trustVerdict"] == "pass", f"Expected pass, got {data['trustVerdict']}"
assert len(data["trust"]["untrustedWriters"]) == 0, \
    f"Expected no untrusted writers: {data['trust']['untrustedWriters']}"
PY

  teardown_test_repo
}
