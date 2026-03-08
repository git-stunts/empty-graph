/**
 * Browser entry point for @git-stunts/git-warp.
 *
 * Re-exports only browser-safe code — no node:crypto, node:stream,
 * or @git-stunts/plumbing imports.
 */

export {
  WarpGraph,
  GraphNode,
  InMemoryGraphAdapter,
  WebCryptoAdapter,
  EncryptionError,
  ForkError,
  QueryError,
  StorageError,
  TraversalError,
  SyncError,
} from './index';
