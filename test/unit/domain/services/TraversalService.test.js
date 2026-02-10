import { describe, it, expect } from 'vitest';
import TraversalService from '../../../../src/domain/services/TraversalService.js';
import CommitDagTraversalService from '../../../../src/domain/services/CommitDagTraversalService.js';

describe('TraversalService (deprecation alias)', () => {
  it('default export is CommitDagTraversalService', () => {
    expect(TraversalService).toBe(CommitDagTraversalService);
  });
});
