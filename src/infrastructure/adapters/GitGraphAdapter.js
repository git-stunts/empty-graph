import GraphPersistencePort from '../../ports/GraphPersistencePort.js';

/**
 * Implementation of GraphPersistencePort using GitPlumbing.
 */
export default class GitGraphAdapter extends GraphPersistencePort {
  /**
   * @param {Object} options
   * @param {import('../../../plumbing/index.js').default} options.plumbing
   */
  constructor({ plumbing }) {
    super();
    this.plumbing = plumbing;
  }

  get emptyTree() {
    return this.plumbing.emptyTree;
  }

  async commitNode({ message, parents = [], sign = false }) {
    const args = ['commit-tree', this.emptyTree];
    
    parents.forEach((p) => {
      args.push('-p', p);
    });

    if (sign) {
      args.push('-S');
    }
    args.push('-m', message);

    return await this.plumbing.execute({ args });
  }

  async showNode(sha) {
    return await this.plumbing.execute({ args: ['show', '-s', '--format=%B', sha] });
  }

  async logNodes({ ref, limit = 50, format }) {
    return await this.plumbing.execute({ args: ['log', `-${limit}`, `--format=${format}`, ref] });
  }

  async writeBlob(content) {
    return await this.plumbing.execute({
      args: ['hash-object', '-w', '--stdin'],
      input: content,
    });
  }

  async writeTree(entries) {
    return await this.plumbing.execute({
      args: ['mktree'],
      input: `${entries.join('\n')}\n`,
    });
  }

  async readTree(treeOid) {
    // 1. List tree
    const output = await this.plumbing.execute({
      args: ['ls-tree', '-r', treeOid]
    });
    
    // 2. Parse entries: "100644 blob <oid>\t<path>"
    const files = {};
    const lines = output.trim().split('\n');
    
    // Parallel fetch (careful with concurrency limits in real world, but for stunts ok)
    await Promise.all(lines.map(async (line) => {
      if (!line) return;
      const [meta, path] = line.split('\t');
      const [, , oid] = meta.split(' ');
      files[path] = await this.readBlob(oid);
    }));

    return files;
  }

  async readBlob(oid) {
    const stream = await this.plumbing.executeStream({
      args: ['cat-file', 'blob', oid]
    });
    return await stream.collect({ asString: false });
  }
}
