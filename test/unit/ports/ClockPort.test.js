import { describe, it, expect } from 'vitest';
import ClockPort from '../../../src/ports/ClockPort.js';

describe('ClockPort', () => {
  describe('abstract methods', () => {
    it('now() throws Not implemented', () => {
      const port = new ClockPort();
      expect(() => port.now()).toThrow('Not implemented');
    });

    it('timestamp() throws Not implemented', () => {
      const port = new ClockPort();
      expect(() => port.timestamp()).toThrow('Not implemented');
    });
  });

  describe('contract', () => {
    it('can be instantiated', () => {
      const port = new ClockPort();
      expect(port).toBeInstanceOf(ClockPort);
    });
  });
});
