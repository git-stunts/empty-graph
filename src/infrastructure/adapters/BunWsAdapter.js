import WebSocketServerPort from '../../ports/WebSocketServerPort.js';

/**
 * Wraps a Bun ServerWebSocket into a port-compliant WsConnection.
 *
 * Handler refs are stored on `ws.data` so the Bun `websocket` callbacks
 * can route messages/closes to the correct connection.
 *
 * @param {BunServerWebSocket<BunWsData>} ws
 * @returns {import('../../ports/WebSocketServerPort.js').WsConnection}
 */
function wrapBunWs(ws) {
  return {
    send(message) {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    },
    onMessage(handler) { ws.data.messageHandler = handler; },
    onClose(handler) { ws.data.closeHandler = handler; },
    close() { ws.close(); },
  };
}

/**
 * Bun WebSocket adapter implementing WebSocketServerPort.
 *
 * Uses `globalThis.Bun.serve()` with the `websocket` handler option.
 * This file can be imported on any runtime but will fail at call-time
 * if Bun is not available.
 *
 * @extends WebSocketServerPort
 */
export default class BunWsAdapter extends WebSocketServerPort {
  /**
   * @param {(connection: import('../../ports/WebSocketServerPort.js').WsConnection) => void} onConnection
   * @returns {import('../../ports/WebSocketServerPort.js').WsServerHandle}
   */
  createServer(onConnection) {
    /** @type {BunServer|null} */
    let server = null;

    return {
      listen(/** @type {number} */ port, /** @type {string} [host] */ host) {
        const bindHost = host || '127.0.0.1';
        return new Promise((resolve) => {
          server = globalThis.Bun.serve({
            port,
            hostname: bindHost,
            fetch(req, srv) {
              if (srv.upgrade(req, { data: { messageHandler: null, closeHandler: null } })) {
                return undefined;
              }
              return new Response('Not Found', { status: 404 });
            },
            websocket: {
              open(ws) { onConnection(wrapBunWs(ws)); },
              message(ws, msg) {
                if (ws.data.messageHandler) {
                  ws.data.messageHandler(typeof msg === 'string' ? msg : new TextDecoder().decode(msg));
                }
              },
              close(ws, code, reason) {
                if (ws.data.closeHandler) {
                  ws.data.closeHandler(code, reason);
                }
              },
            },
          });
          resolve({ port: server.port, host: bindHost });
        });
      },

      close() {
        if (!server) {
          return Promise.resolve();
        }
        void server.stop();
        server = null;
        return Promise.resolve();
      },
    };
  }
}
