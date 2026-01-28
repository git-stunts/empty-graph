/**
 * @git-stunts/empty-graph - A graph database where every node is a Git commit pointing to the Empty Tree.
 */

/**
 * Options for creating a new graph node.
 */
export interface CreateNodeOptions {
  /** The node's message/data */
  message: string;
  /** Array of parent commit SHAs */
  parents?: string[];
  /** Whether to GPG-sign the commit */
  sign?: boolean;
}

/**
 * Options for listing nodes.
 */
export interface ListNodesOptions {
  /** Git ref to start from (HEAD, branch, SHA) */
  ref: string;
  /** Maximum nodes to return (default: 50) */
  limit?: number;
}

/**
 * Options for iterating nodes.
 */
export interface IterateNodesOptions {
  /** Git ref to start from */
  ref: string;
  /** Maximum nodes to yield (default: 1000000) */
  limit?: number;
}

/**
 * Options for rebuilding the index.
 */
export interface RebuildOptions {
  /** Maximum nodes to process (default: 10000000, max: 10000000) */
  limit?: number;
}

/**
 * Immutable entity representing a graph node.
 */
export class GraphNode {
  /** Commit SHA */
  readonly sha: string;
  /** Author name */
  readonly author: string | undefined;
  /** Commit date */
  readonly date: string | undefined;
  /** Node message/data */
  readonly message: string;
  /** Array of parent SHAs */
  readonly parents: readonly string[];

  constructor(data: {
    sha: string;
    message: string;
    author?: string;
    date?: string;
    parents?: string[];
  });
}

/**
 * Port interface for graph persistence operations.
 * @abstract
 */
export abstract class GraphPersistencePort {
  /** The empty tree SHA */
  abstract get emptyTree(): string;

  abstract commitNode(options: CreateNodeOptions): Promise<string>;
  abstract showNode(sha: string): Promise<string>;
  abstract logNodesStream(options: ListNodesOptions & { format: string }): Promise<AsyncIterable<Uint8Array | string>>;
  abstract logNodes(options: ListNodesOptions & { format: string }): Promise<string>;
}

/**
 * Port interface for index storage operations.
 * @abstract
 */
export abstract class IndexStoragePort {
  /** Writes a blob and returns its OID */
  abstract writeBlob(content: Buffer | string): Promise<string>;
  /** Writes a tree from entries and returns its OID */
  abstract writeTree(entries: string[]): Promise<string>;
  /** Reads a blob by OID */
  abstract readBlob(oid: string): Promise<Buffer>;
  /** Reads a tree and returns a map of path to blob OID */
  abstract readTreeOids(treeOid: string): Promise<Record<string, string>>;
  /** Updates a ref to point to an OID */
  abstract updateRef(ref: string, oid: string): Promise<void>;
  /** Reads the OID a ref points to */
  abstract readRef(ref: string): Promise<string | null>;
}

/**
 * Log levels in order of severity.
 */
export const LogLevel: {
  readonly DEBUG: 0;
  readonly INFO: 1;
  readonly WARN: 2;
  readonly ERROR: 3;
  readonly SILENT: 4;
};

export type LogLevelValue = 0 | 1 | 2 | 3 | 4;

/**
 * Port interface for structured logging operations.
 * @abstract
 */
export abstract class LoggerPort {
  /** Log a debug-level message */
  abstract debug(message: string, context?: Record<string, unknown>): void;
  /** Log an info-level message */
  abstract info(message: string, context?: Record<string, unknown>): void;
  /** Log a warning-level message */
  abstract warn(message: string, context?: Record<string, unknown>): void;
  /** Log an error-level message */
  abstract error(message: string, context?: Record<string, unknown>): void;
  /** Create a child logger with additional base context */
  abstract child(context: Record<string, unknown>): LoggerPort;
}

/**
 * No-operation logger adapter.
 * Discards all log messages. Zero overhead.
 */
export class NoOpLogger extends LoggerPort {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): NoOpLogger;
}

/**
 * Console logger adapter with structured JSON output.
 * Supports log level filtering, timestamps, and child loggers.
 */
export class ConsoleLogger extends LoggerPort {
  constructor(options?: {
    /** Minimum log level to output (default: LogLevel.INFO) */
    level?: LogLevelValue | 'debug' | 'info' | 'warn' | 'error' | 'silent';
    /** Base context for all log entries */
    context?: Record<string, unknown>;
    /** Custom timestamp function (defaults to ISO string) */
    timestampFn?: () => string;
  });

  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): ConsoleLogger;
}

/**
 * Git plumbing interface (from @git-stunts/plumbing).
 */
export interface GitPlumbing {
  readonly emptyTree: string;
  execute(options: { args: string[]; input?: string | Buffer }): Promise<string>;
  executeStream(options: { args: string[] }): Promise<AsyncIterable<Uint8Array> & { collect(opts?: { asString?: boolean }): Promise<Buffer | string> }>;
}

/**
 * Implementation of GraphPersistencePort and IndexStoragePort using GitPlumbing.
 */
export class GitGraphAdapter extends GraphPersistencePort implements IndexStoragePort {
  constructor(options: { plumbing: GitPlumbing });

  get emptyTree(): string;
  commitNode(options: CreateNodeOptions): Promise<string>;
  showNode(sha: string): Promise<string>;
  logNodesStream(options: ListNodesOptions & { format: string }): Promise<AsyncIterable<Uint8Array | string>>;
  logNodes(options: ListNodesOptions & { format: string }): Promise<string>;
  writeBlob(content: Buffer | string): Promise<string>;
  writeTree(entries: string[]): Promise<string>;
  readTree(treeOid: string): Promise<Record<string, Buffer>>;
  readTreeOids(treeOid: string): Promise<Record<string, string>>;
  readBlob(oid: string): Promise<Buffer>;
  updateRef(ref: string, oid: string): Promise<void>;
  readRef(ref: string): Promise<string | null>;
  deleteRef(ref: string): Promise<void>;
}

/**
 * Domain service for graph database operations.
 */
export class GraphService {
  constructor(options: {
    persistence: GraphPersistencePort;
    /** Maximum allowed message size in bytes (default: 1048576) */
    maxMessageBytes?: number;
    /** Logger for structured logging (default: NoOpLogger) */
    logger?: LoggerPort;
  });

  createNode(options: CreateNodeOptions): Promise<string>;
  readNode(sha: string): Promise<string>;
  listNodes(options: ListNodesOptions): Promise<GraphNode[]>;
  iterateNodes(options: IterateNodesOptions): AsyncGenerator<GraphNode, void, unknown>;
}

/**
 * Builder for constructing bitmap indexes in memory.
 *
 * Pure domain class with no infrastructure dependencies.
 */
export class BitmapIndexBuilder {
  /** SHA to numeric ID mappings */
  readonly shaToId: Map<string, number>;
  /** Numeric ID to SHA mappings */
  readonly idToSha: string[];

  constructor();

  /** Registers a node and returns its numeric ID */
  registerNode(sha: string): number;

  /** Adds a directed edge from source to target */
  addEdge(srcSha: string, tgtSha: string): void;

  /** Serializes the index to a tree structure of buffers */
  serialize(): Record<string, Buffer>;
}

/**
 * Service for querying a loaded bitmap index.
 *
 * Provides O(1) lookups via lazy-loaded sharded bitmap data.
 */
export class BitmapIndexReader {
  constructor(options: {
    storage: IndexStoragePort;
    /** If true, throw on validation failures; if false, log and return empty (default: false) */
    strict?: boolean;
    /** Logger for structured logging (default: NoOpLogger) */
    logger?: LoggerPort;
  });

  /**
   * Configures the reader with shard OID mappings for lazy loading.
   *
   * The shardOids object maps shard filenames to their Git blob OIDs:
   * - `meta_XX.json` - SHA→ID mappings for nodes with SHA prefix XX
   * - `shards_fwd_XX.json` - Forward edge bitmaps (parent→children)
   * - `shards_rev_XX.json` - Reverse edge bitmaps (child→parents)
   *
   * @example
   * reader.setup({
   *   'meta_ab.json': 'a1b2c3d4e5f6...',
   *   'shards_fwd_ab.json': '1234567890ab...',
   *   'shards_rev_ab.json': 'abcdef123456...'
   * });
   */
  setup(shardOids: Record<string, string>): void;

  /** Looks up the numeric ID for a SHA */
  lookupId(sha: string): Promise<number | undefined>;

  /** Gets parent SHAs for a node (O(1) via reverse bitmap) */
  getParents(sha: string): Promise<string[]>;

  /** Gets child SHAs for a node (O(1) via forward bitmap) */
  getChildren(sha: string): Promise<string[]>;
}

/**
 * Service for building and loading the bitmap index from the graph.
 */
export class IndexRebuildService {
  constructor(options: {
    graphService: GraphService;
    storage: IndexStoragePort;
    /** Logger for structured logging (default: NoOpLogger) */
    logger?: LoggerPort;
  });

  /**
   * Rebuilds the bitmap index by walking the graph from a ref.
   *
   * **Memory**: O(N) where N is nodes. ~150-200MB for 1M nodes.
   * **Time**: O(N) single pass.
   */
  rebuild(ref: string, options?: RebuildOptions): Promise<string>;

  /**
   * Loads a previously built index from a tree OID.
   *
   * **Memory**: Lazy loading - O(1) initial, shards loaded on demand.
   */
  load(treeOid: string): Promise<BitmapIndexReader>;
}

/** Default ref for storing the index OID */
export const DEFAULT_INDEX_REF: string;

/**
 * Facade class for the EmptyGraph library.
 *
 * Provides a simplified API over the underlying domain services.
 */
export default class EmptyGraph {
  /** The underlying GraphService instance */
  readonly service: GraphService;

  /** The underlying IndexRebuildService instance */
  readonly rebuildService: IndexRebuildService;

  /** Whether an index is currently loaded */
  readonly hasIndex: boolean;

  /** The current index tree OID, or null if no index is loaded */
  readonly indexOid: string | null;

  /**
   * Creates a new EmptyGraph instance.
   * @param options Configuration options
   * @param options.persistence Adapter implementing GraphPersistencePort & IndexStoragePort
   * @param options.maxMessageBytes Maximum allowed message size in bytes (default: 1048576)
   * @param options.logger Logger for structured logging (default: NoOpLogger)
   */
  constructor(options: {
    persistence: GraphPersistencePort & IndexStoragePort;
    maxMessageBytes?: number;
    logger?: LoggerPort;
  });

  /**
   * Creates a new graph node as a Git commit.
   */
  createNode(options: CreateNodeOptions): Promise<string>;

  /**
   * Reads a node's message.
   */
  readNode(sha: string): Promise<string>;

  /**
   * Lists nodes in history (for small graphs).
   */
  listNodes(options: ListNodesOptions): Promise<GraphNode[]>;

  /**
   * Async generator for streaming large graphs.
   */
  iterateNodes(options: IterateNodesOptions): AsyncGenerator<GraphNode, void, unknown>;

  /**
   * Rebuilds the bitmap index for the graph.
   */
  rebuildIndex(ref: string, options?: RebuildOptions): Promise<string>;

  /**
   * Loads a pre-built bitmap index for O(1) queries.
   */
  loadIndex(treeOid: string): Promise<void>;

  /**
   * Saves the current index OID to a git ref.
   */
  saveIndex(ref?: string): Promise<void>;

  /**
   * Loads the index from a git ref.
   */
  loadIndexFromRef(ref?: string): Promise<boolean>;

  /**
   * Gets parent SHAs for a node using the bitmap index.
   */
  getParents(sha: string): Promise<string[]>;

  /**
   * Gets child SHAs for a node using the bitmap index.
   */
  getChildren(sha: string): Promise<string[]>;
}
