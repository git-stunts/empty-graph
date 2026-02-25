/**
 * MinHeap/PriorityQueue implementation optimized for Dijkstra's algorithm.
 * Items with lowest priority are extracted first.
 *
 * @class MinHeap
 * @template T
 */
class MinHeap {
  /**
   * Creates an empty MinHeap.
   *
   * @param {Object} [options] - Configuration options
   * @param {((a: T, b: T) => number)} [options.tieBreaker] - Comparator invoked when two
   *   entries have equal priority. Negative return = a wins (comes out first).
   *   When omitted, equal-priority items are returned in insertion order (heap-natural).
   */
  constructor({ tieBreaker } = {}) {
    /** @type {Array<{item: T, priority: number}>} */
    this.heap = [];
    /** @type {((a: T, b: T) => number) | undefined} */
    this._tieBreaker = tieBreaker;
  }

  /**
   * Insert an item with given priority.
   *
   * @param {T} item - The item to insert
   * @param {number} priority - Priority value (lower = higher priority)
   * @returns {void}
   */
  insert(item, priority) {
    this.heap.push({ item, priority });
    this._bubbleUp(this.heap.length - 1);
  }

  /**
   * Extract and return the item with minimum priority.
   *
   * @returns {T | undefined} The item with lowest priority, or undefined if empty
   */
  extractMin() {
    if (this.heap.length === 0) { return undefined; }
    if (this.heap.length === 1) { return /** @type {{item: T, priority: number}} */ (this.heap.pop()).item; }

    const min = this.heap[0];
    this.heap[0] = /** @type {{item: T, priority: number}} */ (this.heap.pop());
    this._bubbleDown(0);
    return min.item;
  }

  /**
   * Check if the heap is empty.
   *
   * @returns {boolean} True if empty
   */
  isEmpty() {
    return this.heap.length === 0;
  }

  /**
   * Get the number of items in the heap.
   *
   * @returns {number} Number of items
   */
  size() {
    return this.heap.length;
  }

  /**
   * Peek at the minimum priority without removing the item.
   *
   * @returns {number} The minimum priority value, or Infinity if empty
   */
  peekPriority() {
    return this.heap.length > 0 ? this.heap[0].priority : Infinity;
  }

  /**
   * Compares two heap entries. Returns negative if a should come before b.
   *
   * @private
   * @param {number} idxA - Index of first entry
   * @param {number} idxB - Index of second entry
   * @returns {number} Negative if a < b, positive if a > b, zero if equal
   */
  _compare(idxA, idxB) {
    const a = this.heap[idxA];
    const b = this.heap[idxB];
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    if (this._tieBreaker) {
      return this._tieBreaker(a.item, b.item);
    }
    return 0;
  }

  /**
   * Restore heap property by bubbling up from index.
   *
   * @private
   * @param {number} pos - Starting index
   */
  _bubbleUp(pos) {
    let current = pos;
    while (current > 0) {
      const parentIndex = Math.floor((current - 1) / 2);
      if (this._compare(parentIndex, current) <= 0) { break; }
      [this.heap[parentIndex], this.heap[current]] = [this.heap[current], this.heap[parentIndex]];
      current = parentIndex;
    }
  }

  /**
   * Restore heap property by bubbling down from index.
   *
   * @private
   * @param {number} pos - Starting index
   */
  _bubbleDown(pos) {
    const {length} = this.heap;
    let current = pos;
    while (true) {
      const leftChild = 2 * current + 1;
      const rightChild = 2 * current + 2;
      let smallest = current;

      if (leftChild < length && this._compare(leftChild, smallest) < 0) {
        smallest = leftChild;
      }
      if (rightChild < length && this._compare(rightChild, smallest) < 0) {
        smallest = rightChild;
      }
      if (smallest === current) { break; }

      [this.heap[current], this.heap[smallest]] = [this.heap[smallest], this.heap[current]];
      current = smallest;
    }
  }
}

export default MinHeap;
