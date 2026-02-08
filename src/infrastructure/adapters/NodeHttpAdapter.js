import HttpServerPort from '../../ports/HttpServerPort.js';
import { createServer } from 'node:http';

/**
 * Collects the request body and dispatches to the handler, returning
 * a 500 response if the handler throws.
 */
async function dispatch(req, res, requestHandler) {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    const response = await requestHandler({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body.length > 0 ? body : undefined,
    });

    res.writeHead(response.status || 200, response.headers || {});
    res.end(response.body);
  } catch {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    res.end('Internal Server Error');
  }
}

/**
 * Node.js HTTP adapter implementing HttpServerPort.
 *
 * This is the only file that imports node:http for server creation.
 *
 * @extends HttpServerPort
 */
export default class NodeHttpAdapter extends HttpServerPort {
  /** @inheritdoc */
  createServer(requestHandler) {
    const server = createServer((req, res) => dispatch(req, res, requestHandler));

    return {
      listen(port, host, callback) {
        const cb = typeof host === 'function' ? host : callback;
        const bindHost = typeof host === 'string' ? host : undefined;
        const onError = (err) => {
          if (cb) {
            cb(err);
          }
        };
        server.once('error', onError);
        const args = bindHost !== undefined ? [port, bindHost] : [port];
        server.listen(...args, () => {
          server.removeListener('error', onError);
          if (cb) {
            cb(null);
          }
        });
      },
      close(callback) {
        server.close(callback);
      },
      address() {
        return server.address();
      },
    };
  }
}
