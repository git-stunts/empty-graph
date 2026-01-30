# Invisible Metadata

> **The Stunt:** Storing rich application state inside your `.git` folder without creating a single file in your working directory.

This is the feature that usually breaks people's brains.

When you use **EmptyGraph**, you are interacting with Git, but you are not touching the "Index" (staging area) or the "Work Tree" (your files). You are bypassing them and writing directly to the **Object Database** (the `.git/objects` folder).

## The "Empty Tree" Pattern

Every commit in Git points to a "Tree" object (a snapshot of a directory). Usually, that tree contains your source code.

But a tree can be empty.
The SHA-1 of an empty tree is always constant:

```
4b825dc642cb6eb9a060e54bf8d69288fbee4904
```

We create commits that point to *this* tree.

- **Files:** 0
- **Data:** Stored in the "Commit Message"
- **History:** Fully preserved

## Use Case: The "Shadow" Database

Imagine you are building a CLI tool. You want to store configuration, usage history, or user preferences.

**The Old Way:**
- Write to `~/.config/my-tool/config.json`.
- Now you have to manage file permissions, paths, JSON parsing corruption.

**The EmptyGraph Way:**
- Initialize a hidden git repo.
- Write updates as commits to a detached branch or a custom ref (e.g., `refs/shadow/config`).

```javascript
// Write config
const sha = await graph.createNode({
  message: JSON.stringify({ theme: 'dark', retries: 3 })
});
await plumbing.updateRef('refs/shadow/config', sha);

// Read config
const headSha = await plumbing.readRef('refs/shadow/config');
const config = JSON.parse(await graph.readNode(headSha));
```

## Why?

1.  **It's Clean:** No pollution of the user's home directory with random config files.
2.  **It's Auditable:** You have a complete history of every configuration change ever made. "Why did my theme change?" -> Check the log.
3.  **It's Syncable:** It's just a Git ref. You can `git push` it to a remote for backup or sync it between machines.

## The "Rootkit" Database

We call this the "Rootkit" pattern (metaphorically!) because it exists in a layer *underneath* what the user perceives as "the filesystem." It is persistent, versioned, and invisible.
