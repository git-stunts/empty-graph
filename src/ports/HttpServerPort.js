/**
 * Port for HTTP server creation.
 *
 * Abstracts platform-specific HTTP server APIs so domain code
 * doesn't depend on node:http directly.
 */
export default class HttpServerPort {
  /**
   * Creates an HTTP server with a platform-agnostic request handler.
   *
   * The request handler receives a plain object `{ method, url, headers, body }`
   * and must return `{ status, headers, body }`. No raw req/res objects
   * are exposed to the domain.
   *
   * @param {(request: { method: string, url: string, headers: Object, body: Buffer|undefined }) => Promise<{ status: number, headers: Object, body: string|Buffer }>} _requestHandler - Async function (request) => response
   * @returns {{ listen: Function, close: Function, address: Function }} Server with listen(port, [host], cb(err)), close(cb), and address()
   */
  createServer(_requestHandler) {
    throw new Error('HttpServerPort.createServer() not implemented');
  }
}
