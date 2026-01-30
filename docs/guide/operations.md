# Operations & Safety

Running EmptyGraph in production requires understanding how Git manages the lifecycle of objects.

## 1. Garbage Collection (The Reaper)

Git is designed to clean up "unreachable" objects.

When you call `graph.createNode()`, you create a **Commit Object** in the database. However, if no **Reference** (Branch, Tag, or Custom Ref) points to that commit (or one of its descendants), Git considers it "dangling."

Standard `git gc` (Garbage Collection) will delete these dangling commits eventually (usually after 2 weeks).

### The Rule of Anchors
**You must anchor your graph tip to a Ref.**

```javascript
// 1. Create the node
const sha = await graph.createNode({ ... });

// 2. Anchor it immediately!
// This tells Git: "This object is important, do not delete it."
await plumbing.updateRef('refs/heads/main', sha);
```

As long as the "Tip" of your graph is pointed to by a ref, the entire history behind it is safe.

## 2. Concurrency & Locking

Git uses file-based locking (`index.lock`, `HEAD.lock`) to ensure atomic updates.

### The Race Condition
If two processes try to write to the repository at the exact same millisecond, one will succeed, and the other will fail with:
`fatal: Unable to create '.../index.lock': File exists.`

### Handling Locks
1.  **Retry Logic:** Your application layer should catch this specific error and retry after a short delay (e.g., 50ms).
2.  **Stale Locks:** If a process crashes hard *during* a write, the `.lock` file might be left behind, freezing the repo.
    *   **Solution:** On application startup, check for stale lock files (older than X minutes) and remove them. Use caution!

## 3. Handling Forks (Conflicts)

In a Content-Addressable Store, "Merge Conflicts" look different than in text files.

If User A and User B both append a new node to the same Parent:
1.  User A creates Node `A` (Parent: `P`)
2.  User B creates Node `B` (Parent: `P`)

Git accepts both. You now have a **Fork** in your graph.

### Resolving Forks
To bring the history back together, you must create a **Merge Node**.

```javascript
// A node with TWO parents
const mergeSha = await graph.createNode({
  message: JSON.stringify({ type: 'Merge', strategy: 'union' }),
  parents: [shaA, shaB] 
});
```

Your application traversal logic (`ancestors()`) naturally handles this. It will visit both branches. It is up to your **Application Logic** to decide how to combine the state (e.g., "Last Write Wins" or "Union of Events").

## 4. Backups

Because your database is a Git repository, your backup strategy is standard:

```bash
# Push to a remote (GitHub, GitLab, S3, Bare Repo)
git push origin main
```

You can also treat the `.git` folder as a standard artifact for snapshots.
