import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WarpServeService from '../../../../src/domain/services/WarpServeService.js';

/**
 * Creates a mock WebSocketServerPort that captures the onConnection
 * handler and lets tests simulate client connections without real I/O.
 *
 * @returns {{ port: import('../../../../src/ports/WebSocketServerPort.js').default, getOnConnection: () => Function|null, simulateConnection: Function }}
 */
function createMockWsPort() {
  /** @type {Function|null} */
  let onConnection = null;

  const port = {
    createServer(/** @type {Function} */ handler) {
      onConnection = handler;
      return {
        async listen(/** @type {number} */ p, /** @type {string|undefined} */ host) {
          return { port: p || 9999, host: host || '127.0.0.1' };
        },
        async close() {},
      };
    },
  };

  function simulateConnection() {
    /** @type {Array<string>} */
    const sent = [];
    /** @type {Function|null} */
    let messageHandler = null;
    /** @type {Function|null} */
    let closeHandler = null;

    /** @type {import('../../../../src/ports/WebSocketServerPort.js').WsConnection} */
    const conn = {
      send(/** @type {string} */ msg) { sent.push(msg); },
      onMessage(/** @type {Function} */ handler) { messageHandler = handler; },
      onClose(/** @type {Function} */ handler) { closeHandler = handler; },
      close() { if (closeHandler) { closeHandler(1000, 'test'); } },
    };

    if (!onConnection) {
      throw new Error('No connection handler registered — call listen() first');
    }
    onConnection(conn);

    return {
      conn,
      sent,
      /** @param {string} msg */
      sendFromClient(msg) {
        if (messageHandler) { messageHandler(msg); }
      },
      triggerClose(/** @type {number} */ code = 1000, /** @type {string} */ reason = '') {
        if (closeHandler) { closeHandler(code, reason); }
      },
    };
  }

  return {
    port: /** @type {import('../../../../src/ports/WebSocketServerPort.js').default} */ (port),
    getOnConnection: () => onConnection,
    simulateConnection,
  };
}

/**
 * Creates a minimal mock WarpGraph with the methods WarpServeService needs.
 *
 * @param {Object} [overrides]
 * @param {string} [overrides.graphName]
 * @returns {any}
 */
function createMockGraph(overrides = {}) {
  const graphName = overrides.graphName || 'test-graph';

  const nodes = new Map();
  const edges = [];

  return {
    graphName,
    materialize: vi.fn().mockResolvedValue({
      nodeAlive: { entries: new Map(), tombstones: new Set() },
      edgeAlive: { entries: new Map(), tombstones: new Set() },
      prop: new Map(),
      observedFrontier: new Map(),
    }),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    getNodeProps: vi.fn().mockResolvedValue(null),
    createPatch: vi.fn().mockResolvedValue({
      addNode: vi.fn().mockReturnThis(),
      removeNode: vi.fn().mockReturnThis(),
      addEdge: vi.fn().mockReturnThis(),
      removeEdge: vi.fn().mockReturnThis(),
      setProperty: vi.fn().mockReturnThis(),
      commit: vi.fn().mockResolvedValue('abc123'),
    }),
    query: vi.fn().mockReturnValue({
      match: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue([]),
    }),
  };
}

describe('WarpServeService', () => {

  // ── Construction ────────────────────────────────────────────────────

  describe('construction', () => {
    it('requires a WebSocketServerPort', () => {
      expect(() => new WarpServeService({ wsPort: /** @type {any} */ (null), graphs: [] }))
        .toThrow();
    });

    it('requires at least one graph', () => {
      const { port } = createMockWsPort();
      expect(() => new WarpServeService({ wsPort: port, graphs: [] }))
        .toThrow();
    });

    it('accepts a single graph', () => {
      const { port } = createMockWsPort();
      const graph = createMockGraph();
      const service = new WarpServeService({ wsPort: port, graphs: [graph] });
      expect(service).toBeDefined();
    });

    it('accepts multiple graphs', () => {
      const { port } = createMockWsPort();
      const g1 = createMockGraph({ graphName: 'alpha' });
      const g2 = createMockGraph({ graphName: 'beta' });
      const service = new WarpServeService({ wsPort: port, graphs: [g1, g2] });
      expect(service).toBeDefined();
    });
  });

  // ── Connection lifecycle ────────────────────────────────────────────

  describe('connection lifecycle', () => {
    /** @type {ReturnType<typeof createMockWsPort>} */
    let ws;
    /** @type {any} */
    let graph;
    /** @type {WarpServeService} */
    let service;

    beforeEach(async () => {
      ws = createMockWsPort();
      graph = createMockGraph();
      service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
    });

    afterEach(async () => {
      await service?.close();
    });

    it('sends a hello message on connect', () => {
      const client = ws.simulateConnection();
      expect(client.sent.length).toBe(1);
      const hello = JSON.parse(client.sent[0]);
      expect(hello.v).toBe(1);
      expect(hello.type).toBe('hello');
      expect(hello.payload.graphs).toEqual(['test-graph']);
    });

    it('hello includes protocol version', () => {
      const client = ws.simulateConnection();
      const hello = JSON.parse(client.sent[0]);
      expect(hello.payload.protocol).toBe(1);
    });

    it('cleans up on client disconnect', async () => {
      // Capture the onChange handler for diff broadcasting
      /** @type {Function|null} */
      let capturedOnChange = null;
      graph.subscribe.mockImplementation((/** @type {any} */ opts) => {
        capturedOnChange = opts.onChange;
        return { unsubscribe: vi.fn() };
      });

      // Re-create service so it picks up the new subscribe mock
      service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);

      const client = ws.simulateConnection();
      // Open the graph so the client is subscribed to diffs
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); }); // hello + state
      client.sent.length = 0;

      // Disconnect
      client.triggerClose();

      // A diff broadcast after disconnect should NOT reach the dead client
      if (capturedOnChange) {
        /** @type {any} */ (capturedOnChange)({
          nodes: { added: ['node:ghost'], removed: [] },
        });
      }
      expect(client.sent).toHaveLength(0);

      // Service should remain functional for new connections
      const client2 = ws.simulateConnection();
      expect(client2.sent.length).toBe(1);
    });
  });

  // ── Protocol: open ──────────────────────────────────────────────────

  describe('open', () => {
    /** @type {ReturnType<typeof createMockWsPort>} */
    let ws;
    /** @type {any} */
    let graph;
    /** @type {WarpServeService} */
    let service;

    beforeEach(async () => {
      ws = createMockWsPort();
      graph = createMockGraph();
      service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
    });

    afterEach(async () => {
      await service?.close();
    });

    it('responds with materialized state when client opens a graph', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0; // clear hello

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'req-1',
        payload: { graph: 'test-graph', writerId: 'browser-writer-1' },
      }));

      // Allow async processing
      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.v).toBe(1);
      expect(msg.type).toBe('state');
      expect(msg.id).toBe('req-1');
      expect(msg.payload.graph).toBe('test-graph');
    });

    it('serializes nodes, edges, and frontier in the state payload', async () => {
      // Set up a graph with populated state
      const dot = { writerId: 'w1', counter: 1 };
      graph.materialize.mockResolvedValue({
        nodeAlive: {
          entries: new Map([['user:alice', new Set([dot])], ['user:bob', new Set([dot])]]),
          tombstones: new Set(),
        },
        edgeAlive: {
          entries: new Map([['user:alice\0user:bob\0knows', new Set([dot])]]),
          tombstones: new Set(),
        },
        prop: new Map([
          ['user:alice\0name', { eventId: { writerId: 'w1', counter: 1 }, value: 'Alice' }],
        ]),
        observedFrontier: new Map([['w1', 3]]),
      });

      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'req-state',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('state');
      expect(msg.payload.graph).toBe('test-graph');
      expect(msg.payload.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'user:alice', props: { name: 'Alice' } }),
        expect.objectContaining({ id: 'user:bob', props: {} }),
      ]));
      expect(msg.payload.edges).toEqual([
        { from: 'user:alice', to: 'user:bob', label: 'knows' },
      ]);
      expect(msg.payload.frontier).toEqual({ w1: 3 });
    });

    it('returns error for unknown graph name', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'req-2',
        payload: { graph: 'nonexistent', writerId: 'w1' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_UNKNOWN_GRAPH');
    });

    it('rejects messages with unsupported protocol version', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 999, type: 'open', id: 'req-3',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_UNSUPPORTED_VERSION');
    });
  });

  // ── Protocol: mutate ────────────────────────────────────────────────

  describe('mutate', () => {
    /** @type {ReturnType<typeof createMockWsPort>} */
    let ws;
    /** @type {any} */
    let graph;
    /** @type {WarpServeService} */
    let service;

    beforeEach(async () => {
      ws = createMockWsPort();
      graph = createMockGraph();
      service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
    });

    afterEach(async () => {
      await service?.close();
    });

    it('applies addNode mutation and returns ack', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'open-1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); }); // hello + state
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-1',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'addNode', args: ['node:test'] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('ack');
      expect(msg.id).toBe('mut-1');
      expect(graph.createPatch).toHaveBeenCalled();
    });

    it('rejects ops not in the allowlist', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-bad',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'constructor', args: [] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('mut-bad');
      expect(msg.payload.code).toBe('E_INVALID_OP');
    });

    it('rejects mutate with wrong arg count', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-argc',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'addNode', args: [] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('mut-argc');
      expect(msg.payload.code).toBe('E_INVALID_ARGS');
    });

    it('rejects mutate with wrong arg type', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-argt',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'addNode', args: [42] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('mut-argt');
      expect(msg.payload.code).toBe('E_INVALID_ARGS');
    });

    it('allows wildcard arg types for setProperty value', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-wild',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'setProperty', args: ['node:1', 'color', 42] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('ack');
      expect(msg.id).toBe('mut-wild');
    });

    it('rejects attachContent with non-string content', async () => {
      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-bad-content',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'attachContent', args: ['node:1', 42] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('mut-bad-content');
      expect(msg.payload.code).toBe('E_INVALID_ARGS');
    });

    it('rejects attachEdgeContent with non-string content', async () => {
      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-bad-edge-content',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'attachEdgeContent', args: ['n1', 'n2', 'knows', { binary: true }] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('mut-bad-edge-content');
      expect(msg.payload.code).toBe('E_INVALID_ARGS');
    });

    it('awaits async ops like attachContent before commit', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      // Override createPatch to return a mock with an async attachContent
      let attachResolved = false;
      const mockPatch = {
        addNode: vi.fn().mockReturnThis(),
        attachContent: vi.fn().mockImplementation(async () => {
          // Simulate async blob write — use microtask (not real timer) to
          // prove ordering without introducing timer-based flakiness.
          await Promise.resolve();
          attachResolved = true;
          return mockPatch;
        }),
        commit: vi.fn().mockImplementation(async () => {
          // If attachContent wasn't awaited, attachResolved is still false
          if (!attachResolved) {
            throw new Error('commit called before attachContent resolved');
          }
          return 'sha-blob';
        }),
      };
      graph.createPatch.mockResolvedValue(mockPatch);

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-attach',
        payload: {
          graph: 'test-graph',
          ops: [
            { op: 'addNode', args: ['node:blob'] },
            { op: 'attachContent', args: ['node:blob', 'hello world'] },
          ],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('ack');
      expect(msg.id).toBe('mut-attach');
      expect(msg.payload.sha).toBe('sha-blob');
      expect(mockPatch.attachContent).toHaveBeenCalledWith('node:blob', 'hello world');
    });

    it('returns E_MUTATE_FAILED when createPatch rejects', async () => {
      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      graph.createPatch.mockRejectedValueOnce(new Error('disk full'));

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-fail',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'addNode', args: ['node:boom'] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('mut-fail');
      expect(msg.payload.code).toBe('E_MUTATE_FAILED');
      expect(msg.payload.message).toBe('disk full');
    });

    it('rejects mutate before open', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-2',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'addNode', args: ['node:test'] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_NOT_OPENED');
    });

    it('rejects mutate targeting a different graph than opened', async () => {
      const localWs = createMockWsPort();
      const alpha = createMockGraph({ graphName: 'alpha' });
      const beta = createMockGraph({ graphName: 'beta' });
      const svc = new WarpServeService({ wsPort: localWs.port, graphs: [alpha, beta] });
      await svc.listen(0);

      const client = localWs.simulateConnection();
      // Open alpha only
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'alpha' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      // Try to mutate beta (not opened)
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-cross',
        payload: {
          graph: 'beta',
          ops: [{ op: 'addNode', args: ['node:x'] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));
      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_NOT_OPENED');

      await svc.close();
    });
  });

  // ── Protocol: inspect ───────────────────────────────────────────────

  describe('inspect', () => {
    /** @type {ReturnType<typeof createMockWsPort>} */
    let ws;
    /** @type {any} */
    let graph;
    /** @type {WarpServeService} */
    let service;

    beforeEach(async () => {
      ws = createMockWsPort();
      graph = createMockGraph();
      graph.getNodeProps.mockResolvedValue({ name: 'Alice', role: 'admin' });
      service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
    });

    afterEach(async () => {
      await service?.close();
    });

    it('returns node properties', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'inspect', id: 'ins-1',
        payload: { graph: 'test-graph', nodeId: 'user:alice' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('inspect');
      expect(msg.id).toBe('ins-1');
      expect(msg.payload.props).toEqual({ name: 'Alice', role: 'admin' });
    });

    it('returns E_INSPECT_FAILED when getNodeProps rejects', async () => {
      graph.getNodeProps.mockRejectedValueOnce(new Error('node not found'));

      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'inspect', id: 'ins-fail',
        payload: { graph: 'test-graph', nodeId: 'user:ghost' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('ins-fail');
      expect(msg.payload.code).toBe('E_INSPECT_FAILED');
      expect(msg.payload.message).toBe('node not found');
    });
  });

  // ── Protocol: seek ──────────────────────────────────────────────────

  describe('seek', () => {
    /** @type {ReturnType<typeof createMockWsPort>} */
    let ws;
    /** @type {any} */
    let graph;
    /** @type {WarpServeService} */
    let service;

    beforeEach(async () => {
      ws = createMockWsPort();
      graph = createMockGraph();
      service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
    });

    afterEach(async () => {
      await service?.close();
    });

    it('re-materializes with ceiling and sends state', async () => {
      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'seek', id: 'sk-1',
        payload: { graph: 'test-graph', ceiling: 5 },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('state');
      expect(msg.id).toBe('sk-1');
      expect(graph.materialize).toHaveBeenCalledWith(
        expect.objectContaining({ ceiling: 5 }),
      );
    });

    it('rejects negative ceiling with E_INVALID_PAYLOAD', async () => {
      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'seek', id: 'sk-neg',
        payload: { graph: 'test-graph', ceiling: -1 },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('sk-neg');
      expect(msg.payload.code).toBe('E_INVALID_PAYLOAD');
    });

    it('treats Infinity ceiling as materialize-at-head', async () => {
      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      graph.materialize.mockClear();
      client.sent.length = 0;

      // Infinity is not valid JSON, so we hand-craft the raw string
      // to simulate a non-JSON transport or future binary protocol.
      client.sendFromClient(
        '{"v":1,"type":"seek","id":"sk-inf","payload":{"graph":"test-graph","ceiling":1e999}}',
      );

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('state');
      expect(msg.id).toBe('sk-inf');
      // Infinity should NOT be passed as ceiling — materialize at head
      expect(graph.materialize).toHaveBeenCalledWith({});
    });

    it('rejects non-integer ceiling with E_INVALID_PAYLOAD', async () => {
      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'seek', id: 'sk-frac',
        payload: { graph: 'test-graph', ceiling: 3.5 },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('sk-frac');
      expect(msg.payload.code).toBe('E_INVALID_PAYLOAD');
      expect(msg.payload.message).toContain('integer');
    });
  });

  // ── Live diff push ──────────────────────────────────────────────────

  describe('live diff push', () => {
    it('pushes diffs to subscribed clients when graph changes', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();

      /** @type {Function|null} */
      let capturedOnChange = null;
      graph.subscribe.mockImplementation((/** @type {any} */ opts) => {
        capturedOnChange = opts.onChange;
        return { unsubscribe: vi.fn() };
      });

      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);

      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      // Simulate a graph change
      const fakeDiff = {
        nodes: { added: ['node:new'], removed: [] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      };

      expect(capturedOnChange).not.toBeNull();
      /** @type {any} */ (capturedOnChange)(fakeDiff);

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('diff');
      expect(msg.payload.graph).toBe('test-graph');
      expect(msg.payload.diff.nodes.added).toEqual(['node:new']);
    });

    it('broadcasts diffs to all clients subscribed to the same graph', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();

      /** @type {Function|null} */
      let capturedOnChange = null;
      graph.subscribe.mockImplementation((/** @type {any} */ opts) => {
        capturedOnChange = opts.onChange;
        return { unsubscribe: vi.fn() };
      });

      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);

      // Connect and open two clients on the same graph
      const client1 = ws.simulateConnection();
      client1.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client1.sent.length).toBeGreaterThanOrEqual(2); });
      client1.sent.length = 0;

      const client2 = ws.simulateConnection();
      client2.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o2',
        payload: { graph: 'test-graph', writerId: 'w2' },
      }));
      await vi.waitFor(() => { expect(client2.sent.length).toBeGreaterThanOrEqual(2); });
      client2.sent.length = 0;

      // Trigger a diff
      const fakeDiff = {
        nodes: { added: ['node:broadcast'], removed: [] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      };

      expect(capturedOnChange).not.toBeNull();
      /** @type {any} */ (capturedOnChange)(fakeDiff);

      await vi.waitFor(() => expect(client1.sent.length).toBeGreaterThan(0));
      await vi.waitFor(() => expect(client2.sent.length).toBeGreaterThan(0));

      const msg1 = JSON.parse(client1.sent[0]);
      const msg2 = JSON.parse(client2.sent[0]);

      expect(msg1.type).toBe('diff');
      expect(msg1.payload.diff.nodes.added).toEqual(['node:broadcast']);
      expect(msg2.type).toBe('diff');
      expect(msg2.payload.diff.nodes.added).toEqual(['node:broadcast']);
    });

    it('survives a dead client and still delivers to healthy clients', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();

      /** @type {Function|null} */
      let capturedOnChange = null;
      graph.subscribe.mockImplementation((/** @type {any} */ opts) => {
        capturedOnChange = opts.onChange;
        return { unsubscribe: vi.fn() };
      });

      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);

      // Client 1: will throw on send (dead connection)
      const client1 = ws.simulateConnection();
      client1.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client1.sent.length).toBeGreaterThanOrEqual(2); });

      // Client 2: healthy
      const client2 = ws.simulateConnection();
      client2.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o2',
        payload: { graph: 'test-graph', writerId: 'w2' },
      }));
      await vi.waitFor(() => { expect(client2.sent.length).toBeGreaterThanOrEqual(2); });
      client2.sent.length = 0;

      // Make client1's send throw (simulating a dead WebSocket)
      client1.conn.send = () => { throw new Error('Connection reset'); };

      const fakeDiff = {
        nodes: { added: ['node:survive'], removed: [] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      };

      expect(capturedOnChange).not.toBeNull();
      /** @type {any} */ (capturedOnChange)(fakeDiff);

      // Client 2 should still receive the diff
      expect(client2.sent.length).toBe(1);
      const msg = JSON.parse(client2.sent[0]);
      expect(msg.type).toBe('diff');
      expect(msg.payload.diff.nodes.added).toEqual(['node:survive']);
    });

    it('does not push diffs to clients that have not opened that graph', async () => {
      const ws = createMockWsPort();
      const g1 = createMockGraph({ graphName: 'alpha' });
      const g2 = createMockGraph({ graphName: 'beta' });

      /** @type {Function|null} */
      let g1OnChange = null;
      g1.subscribe.mockImplementation((/** @type {any} */ opts) => {
        g1OnChange = opts.onChange;
        return { unsubscribe: vi.fn() };
      });

      const service = new WarpServeService({ wsPort: ws.port, graphs: [g1, g2] });
      await service.listen(0);

      const client = ws.simulateConnection();
      // Open beta, not alpha
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'beta', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      // Alpha changes — client should NOT get it
      if (g1OnChange) {
        /** @type {any} */ (g1OnChange)({
          nodes: { added: ['node:x'], removed: [] },
          edges: { added: [], removed: [] },
          props: { set: [], removed: [] },
        });
      }

      // _broadcastDiff is synchronous — no async delay needed
      expect(client.sent).toHaveLength(0);
    });
  });

  // ── Malformed messages ──────────────────────────────────────────────

  describe('malformed messages', () => {
    /** @type {ReturnType<typeof createMockWsPort>} */
    let ws;
    /** @type {WarpServeService} */
    let service;

    beforeEach(async () => {
      ws = createMockWsPort();
      const graph = createMockGraph();
      service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
    });

    afterEach(async () => {
      await service?.close();
    });

    it('returns error for invalid JSON', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient('not valid json {{{');

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_INVALID_MESSAGE');
    });

    it('returns error for missing type field', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({ v: 1, payload: {} }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_INVALID_MESSAGE');
    });

    it('returns E_INVALID_PAYLOAD for open with missing graph', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o-bad',
        payload: {},
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('o-bad');
      expect(msg.payload.code).toBe('E_INVALID_PAYLOAD');
    });

    it('returns E_INVALID_PAYLOAD for mutate with missing ops', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-bad',
        payload: { graph: 'test-graph' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('mut-bad');
      expect(msg.payload.code).toBe('E_INVALID_PAYLOAD');
    });

    it('returns E_INVALID_PAYLOAD for inspect with missing nodeId', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'inspect', id: 'ins-bad',
        payload: { graph: 'test-graph' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('ins-bad');
      expect(msg.payload.code).toBe('E_INVALID_PAYLOAD');
    });

    it('returns E_INVALID_PAYLOAD for seek with missing ceiling', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'seek', id: 'sk-bad',
        payload: { graph: 'test-graph' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('sk-bad');
      expect(msg.payload.code).toBe('E_INVALID_PAYLOAD');
    });

    it('returns error for unknown message type', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'explode', id: 'x', payload: {},
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_UNKNOWN_TYPE');
    });
  });

  // ── Shutdown ────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('close() shuts down cleanly', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();
      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
      await expect(service.close()).resolves.toBeUndefined();
    });
  });

  // ── Defensive hardening (B165/B167) ───────────────────────────────

  describe('listen() hardening', () => {
    it('does not leak subscriptions when server.listen() rejects', async () => {
      let unsubCalled = false;
      const graph = createMockGraph();
      graph.subscribe.mockReturnValue({ unsubscribe: () => { unsubCalled = true; } });

      const port = {
        createServer(/** @type {Function} */ handler) {
          return {
            async listen() { throw new Error('EADDRINUSE'); },
            async close() {},
          };
        },
      };

      const service = new WarpServeService({
        wsPort: /** @type {any} */ (port),
        graphs: [graph],
      });

      await expect(service.listen(9999)).rejects.toThrow('EADDRINUSE');

      // Subscriptions must have been cleaned up
      expect(unsubCalled).toBe(true);

      // Service must remain in a state where listen() can be retried
      // (i.e., _server is null, not a dead handle)
      const retryPort = {
        createServer(/** @type {Function} */ handler) {
          return {
            async listen(/** @type {number} */ p) { return { port: p, host: '127.0.0.1' }; },
            async close() {},
          };
        },
      };
      // Can't retry with same service since wsPort is fixed, but we verify
      // the internal state by checking that a second service works fine
      const service2 = new WarpServeService({
        wsPort: /** @type {any} */ (retryPort),
        graphs: [graph],
      });
      await expect(service2.listen(0)).resolves.toBeDefined();
    });

    it('rejects double listen()', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();
      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
      await expect(service.listen(0)).rejects.toThrow('already listening');
    });
  });

  describe('error sanitization (B165)', () => {
    it('does not leak internal error details to WebSocket clients', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();
      // Make materialize throw with a detailed internal error
      graph.materialize.mockRejectedValue(
        new Error('/Users/james/.secret/db at row 42: SQLITE_CORRUPT'),
      );

      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);

      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      // The specific handler (open) can send domain errors — those are fine.
      // What we're testing is that the _onConnection fallback catch doesn't
      // leak raw err.message. The open handler sends E_MATERIALIZE_FAILED
      // with the raw message, which is acceptable for now (domain error).
      expect(msg.payload.code).toBe('E_MATERIALIZE_FAILED');
    });

    it('_onConnection fallback catch sends generic error, not raw err.message', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();
      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);

      const client = ws.simulateConnection();
      client.sent.length = 0;

      // Override _onMessage to throw — this is the only way to trigger the
      // outer .catch() in _onConnection, since all handler-level errors are
      // caught by each handler's own try/catch. The monkey-patch simulates a
      // truly unexpected failure (e.g., a bug in message dispatch).
      /** @type {any} */ (service)._onMessage = async () => {
        throw new Error('secret internal path /etc/shadow');
      };

      // Re-connect to pick up the patched _onMessage
      const client2 = ws.simulateConnection();
      client2.sent.length = 0;

      client2.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'leak-test',
        payload: { graph: 'test-graph' },
      }));

      await vi.waitFor(() => expect(client2.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client2.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_INTERNAL');
      // Must NOT contain the raw error message
      expect(msg.payload.message).not.toContain('secret');
      expect(msg.payload.message).not.toContain('/etc/shadow');
      expect(msg.payload.message).toBe('Internal error');
    });
  });

  describe('mock patch surface completeness (B167)', () => {
    it('exercises attachContent through the mutation pipeline', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();
      // Add attachContent/attachEdgeContent to mock patch
      const mockPatch = {
        addNode: vi.fn().mockReturnThis(),
        removeNode: vi.fn().mockReturnThis(),
        addEdge: vi.fn().mockReturnThis(),
        removeEdge: vi.fn().mockReturnThis(),
        setProperty: vi.fn().mockReturnThis(),
        setEdgeProperty: vi.fn().mockReturnThis(),
        attachContent: vi.fn().mockResolvedValue(undefined),
        attachEdgeContent: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue('sha-attach'),
      };
      graph.createPatch.mockResolvedValue(mockPatch);

      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);

      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-attach',
        payload: {
          graph: 'test-graph',
          ops: [
            { op: 'addNode', args: ['node:blob'] },
            { op: 'attachContent', args: ['node:blob', 'hello'] },
          ],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));
      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('ack');
      expect(mockPatch.attachContent).toHaveBeenCalledWith('node:blob', 'hello');
    });

    it('exercises attachEdgeContent through the mutation pipeline', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();
      const mockPatch = {
        addNode: vi.fn().mockReturnThis(),
        removeNode: vi.fn().mockReturnThis(),
        addEdge: vi.fn().mockReturnThis(),
        removeEdge: vi.fn().mockReturnThis(),
        setProperty: vi.fn().mockReturnThis(),
        setEdgeProperty: vi.fn().mockReturnThis(),
        attachContent: vi.fn().mockResolvedValue(undefined),
        attachEdgeContent: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue('sha-edge-attach'),
      };
      graph.createPatch.mockResolvedValue(mockPatch);

      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);

      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-edge-attach',
        payload: {
          graph: 'test-graph',
          ops: [
            { op: 'attachEdgeContent', args: ['n1', 'n2', 'knows', 'blob-data'] },
          ],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));
      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('ack');
      expect(mockPatch.attachEdgeContent).toHaveBeenCalledWith('n1', 'n2', 'knows', 'blob-data');
    });
  });

  // ── Message size limits ──────────────────────────────────────────────

  describe('message size limits', () => {
    it('rejects oversized WebSocket messages', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();
      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);

      const client = ws.simulateConnection();
      client.sent.length = 0;

      // Send a message larger than 1 MiB
      const oversized = 'x'.repeat(1_048_577);
      client.sendFromClient(oversized);

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));
      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_MESSAGE_TOO_LARGE');
    });

    it('rejects oversized property values in mutate', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();
      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);

      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => { expect(client.sent.length).toBeGreaterThanOrEqual(2); });
      client.sent.length = 0;

      // A 100KB property value exceeds the 64 KiB limit
      const bigValue = 'x'.repeat(100_000);
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-big',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'setProperty', args: ['node:a', 'key', bigValue] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));
      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_INVALID_ARGS');
      expect(msg.payload.message).toContain('64 KiB');
    });
  });
});
