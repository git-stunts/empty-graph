import GraphNode from '../entities/GraphNode.js';

/**
 * Domain service for graph database operations.
 */
export default class GraphService {
  constructor({ persistence }) {
    this.persistence = persistence;
  }

  async createNode({ message, parents = [], sign = false }) {
    return await this.persistence.commitNode({ message, parents, sign });
  }

  async readNode(sha) {
    return await this.persistence.showNode(sha);
  }

  async listNodes({ ref, limit = 50 }) {
    const separator = '\0';
    const format = ['%H', '%an', '%ad', '%P', `%B${separator}`].join('%n');
    
    let out = '';
    try {
      const result = await this.persistence.logNodes({ ref, limit, format });
      out = typeof result === 'string' ? result : new TextDecoder().decode(result);
    } catch (err) {
      return [];
    }

    return out
      .split(`${separator}\n`)
      .filter((block) => block.trim().length > 0)
      .map((block) => {
        const lines = block.trim().split('\n');
        if (lines.length < 4) return null;
        
        const sha = lines[0];
        const author = lines[1];
        const date = lines[2];
        const parents = lines[3] ? lines[3].split(' ') : [];
        const message = lines.slice(4).join('\n').trim();
        
        return new GraphNode({ sha, author, date, message, parents });
      })
      .filter(Boolean);
  }
}