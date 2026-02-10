# seek-demo.tape — VHS recording of `git warp seek` time-travel
# Record with: vhs docs/seek-demo.tape

Output docs/seek-demo.gif

Require git
Require node

Set Shell "bash"
Set FontFamily "JetBrains Mono"
Set FontSize 14
Set Width 960
Set Height 720
Set Padding 16
Set TypingSpeed 40ms

# ── Bootstrap a sandbox repo with a seeded graph ────────────────────────
Hide
Type "TMPDIR=$(mktemp -d) && cd $TMPDIR && git init -q sandbox && cd sandbox"
Enter
Sleep 500ms
Type "export PROJECT_ROOT=$HOME/git/git-stunts/git-warp"
Enter
Type "export REPO_PATH=$(pwd)"
Enter
Type "export PATH=$PROJECT_ROOT/bin:$PATH"
Enter
Type "node $PROJECT_ROOT/test/bats/helpers/seed-graph.js"
Enter
Sleep 2s
Type "clear"
Enter
Sleep 500ms
Show

# ── 1. Present state — full graph ───────────────────────────────────────
Type "# the graph right now: 3 users, 2 follows edges"
Enter
Sleep 800ms

Type "git warp --view query --match '*'"
Enter
Sleep 3s

# ── 2. Rewind to tick 1 — only the first patch (nodes, no edges) ───────
Type "# rewind to tick 1 — before the edges were added"
Enter
Sleep 800ms

Type "git warp --view seek --tick 1"
Enter
Sleep 3s

Type "git warp --view query --match '*'"
Enter
Sleep 3s

# ── 3. Worktree is untouched ───────────────────────────────────────────
Type "# the graph changed, but the working tree didn't"
Enter
Sleep 800ms

Type "git status"
Enter
Sleep 2.5s

# ── 4. Step forward — edges appear ─────────────────────────────────────
Type "# step forward one tick — edges reappear"
Enter
Sleep 800ms

Type "git warp --view seek --tick=+1"
Enter
Sleep 3s

Type "git warp --view query --match '*'"
Enter
Sleep 3s

# ── 5. Still clean ─────────────────────────────────────────────────────
Type "# still nothing in the worktree"
Enter
Sleep 800ms

Type "git status"
Enter
Sleep 2.5s

# ── 6. Return to present ───────────────────────────────────────────────
Type "# done exploring — return to present"
Enter
Sleep 800ms

Type "git warp seek --latest"
Enter
Sleep 2s

# ── Cleanup ─────────────────────────────────────────────────────────────
Hide
Type "rm -rf $TMPDIR"
Enter
