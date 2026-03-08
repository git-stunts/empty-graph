/**
 * @typedef {Object} WsConnection
 * @property {(message: string) => void} send - Send a text message to the client
 * @property {(handler: (message: string) => void) => void} onMessage - Register message handler
 * @property {(handler: (code?: number, reason?: string) => void) => void} onClose - Register close handler
 * @property {() => void} close - Close the connection
 */

/**
 * @typedef {Object} WsServerHandle
 * @property {(port: number, host?: string) => Promise<{ port: number, host: string }>} listen
 * @property {() => Promise<void>} close
 */

/**
 * Port for WebSocket server creation.
 *
 * Abstracts platform-specific WebSocket server APIs (Node ws, Bun.serve,
 * Deno.upgradeWebSocket) so domain code doesn't depend on any runtime
 * directly.
 */
export default class WebSocketServerPort {
  /**
   * Creates a WebSocket server.
   *
   * @param {(connection: WsConnection) => void} _onConnection - Called for each new client connection
   * @returns {WsServerHandle} Server handle with listen() and close()
   */
  createServer(_onConnection) {
    throw new Error('WebSocketServerPort.createServer() not implemented');
  }
}
