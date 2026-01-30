# Core Concepts

To understand EmptyGraph, you need to understand three things: Nodes, Edges, and the Index.

## 1. The Node (A Ghost Commit)

A **Node** is just a Git Commit.
- **ID:** The SHA-1 hash of the commit.
- **Data:** The commit message (String/JSON).
- **Metadata:** Author, Committer, Date.

Crucially, the commit points to the **Empty Tree**. This means it has no file content. It is a "Ghost" commit.

## 2. The Edge (Parent Pointers)

An **Edge** is the relationship between commits.
- Git natively supports **Backward Edges** (Child points to Parent).
- This creates a **Directed Acyclic Graph (DAG)**.

## 3. The Index (The Cheat Code)

Git does not support **Forward Edges** (Parent points to Children). To find children, you have to scan the whole repo.

EmptyGraph solves this with a **Roaring Bitmap Index**.
- We assign every SHA an integer ID.
- We store adjacency lists in compressed bitmaps.
- We save this index *back into Git* as a set of sharded JSON files.

When you ask `graph.getChildren(parentSha)`, we check the index (O(1)).
When you ask `graph.getParents(childSha)`, we check the index (O(1)).
