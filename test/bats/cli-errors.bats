#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "invalid repo path produces error" {
  run git warp --repo /nonexistent/path --json info
  assert_failure
}

@test "missing graph name with --graph produces error" {
  run git warp --repo "${TEST_REPO}" --graph nonexistent --json query --match "*"
  assert_failure
}

@test "unknown command produces error" {
  run git warp --repo "${TEST_REPO}" foobar
  assert_failure
}

@test "--view with unsupported command produces error" {
  run git warp --repo "${TEST_REPO}" --graph demo --view install-hooks
  [ "$status" -eq 1 ]
  echo "$output" | grep -qi "view.*not supported\|unsupported.*view"
}

@test "path without required args produces error" {
  run git warp --repo "${TEST_REPO}" --graph demo --json path
  assert_failure
}

@test "history without --writer produces error" {
  run git warp --repo "${TEST_REPO}" --graph demo --json history
  assert_failure
}
