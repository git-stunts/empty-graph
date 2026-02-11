import { describe, it, expect } from 'vitest';
import SeekCachePort from '../../../src/ports/SeekCachePort.js';

describe('SeekCachePort', () => {
  describe('abstract methods', () => {
    it('get() throws SeekCachePort.get() not implemented', async () => {
      const port = new SeekCachePort();
      await expect(port.get('key')).rejects.toThrow(
        'SeekCachePort.get() not implemented',
      );
    });

    it('set() throws SeekCachePort.set() not implemented', async () => {
      const port = new SeekCachePort();
      await expect(port.set('key', Buffer.from('data'))).rejects.toThrow(
        'SeekCachePort.set() not implemented',
      );
    });

    it('has() throws SeekCachePort.has() not implemented', async () => {
      const port = new SeekCachePort();
      await expect(port.has('key')).rejects.toThrow(
        'SeekCachePort.has() not implemented',
      );
    });

    it('keys() throws SeekCachePort.keys() not implemented', async () => {
      const port = new SeekCachePort();
      await expect(port.keys()).rejects.toThrow(
        'SeekCachePort.keys() not implemented',
      );
    });

    it('delete() throws SeekCachePort.delete() not implemented', async () => {
      const port = new SeekCachePort();
      await expect(port.delete('key')).rejects.toThrow(
        'SeekCachePort.delete() not implemented',
      );
    });

    it('clear() throws SeekCachePort.clear() not implemented', async () => {
      const port = new SeekCachePort();
      await expect(port.clear()).rejects.toThrow(
        'SeekCachePort.clear() not implemented',
      );
    });
  });

  describe('contract', () => {
    it('can be instantiated', () => {
      const port = new SeekCachePort();
      expect(port).toBeInstanceOf(SeekCachePort);
    });
  });
});
