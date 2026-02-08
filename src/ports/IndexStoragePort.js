/**
 * Port interface for bitmap index storage operations.
 *
 * This port defines the contract for persisting and retrieving
 * the sharded bitmap index data. Adapters implement this interface
 * to store indexes in different backends (Git, filesystem, etc.).
 *
 * This port is a subset of the focused ports: it uses methods from
 * {@link BlobPort} (writeBlob, readBlob), {@link TreePort} (writeTree,
 * readTreeOids), and {@link RefPort} (updateRef, readRef).
 *
 * @abstract
 */

import BlobPort from './BlobPort.js';
import TreePort from './TreePort.js';
import RefPort from './RefPort.js';

class IndexStoragePort {}

const picks = [
  [BlobPort, ['writeBlob', 'readBlob']],
  [TreePort, ['writeTree', 'readTreeOids']],
  [RefPort, ['updateRef', 'readRef']],
];

for (const [Port, methods] of picks) {
  const descriptors = Object.getOwnPropertyDescriptors(Port.prototype);
  for (const name of methods) {
    if (!descriptors[name]) {
      throw new Error(
        `IndexStoragePort: "${name}" not found on ${Port.name}.prototype`,
      );
    }
    Object.defineProperty(IndexStoragePort.prototype, name, descriptors[name]);
  }
}

export default IndexStoragePort;
