import { describe, it, expect } from 'vitest';
import * as api from '../../index.js';
import WarpServeService from '../../src/domain/services/WarpServeService.js';
import WebSocketServerPort from '../../src/ports/WebSocketServerPort.js';

describe('public runtime exports', () => {
  it('exports WarpServeService from the package entry point', () => {
    expect(api.WarpServeService).toBe(WarpServeService);
  });

  it('exports WebSocketServerPort from the package entry point', () => {
    expect(api.WebSocketServerPort).toBe(WebSocketServerPort);
  });
});
