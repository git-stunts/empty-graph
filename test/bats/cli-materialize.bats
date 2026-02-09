#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "materialize --json reports node and edge counts" {
  run git warp --repo "${TEST_REPO}" --json materialize
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
results = data["results"]
assert len(results) >= 1
r = results[0]
assert r["graph"] == "demo"
assert r["nodes"] == 3
assert r["edges"] == 2
PY
}

@test "materialize creates a checkpoint" {
  run git warp --repo "${TEST_REPO}" --json materialize
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os, re
data = json.loads(os.environ["JSON"])
r = data["results"][0]
assert "checkpoint" in r
assert isinstance(r["checkpoint"], str)
assert re.match(r'^[0-9a-f]{40}$', r["checkpoint"])
PY
}

@test "materialize --view ascii produces output" {
  run git warp --repo "${TEST_REPO}" --view materialize
  assert_success
  [ -n "$output" ]
}

@test "materialize --graph filters to specific graph" {
  run git warp --repo "${TEST_REPO}" --graph demo --json materialize
  assert_success

  JSON="$output" python3 - <<'PY'
import json, os
data = json.loads(os.environ["JSON"])
assert len(data["results"]) == 1
assert data["results"][0]["graph"] == "demo"
PY
}
