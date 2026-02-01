# Handoff: WARP Unification Phase A

## Mission

Execute Phase A of the WARP unification plan. Read `docs/UNIFY-TO-WARP.md` for full context.

## What's Done

WARP V5 core is complete and tested (1,499 tests pass):
- OR-Set CRDTs (Dot, VersionVector, ORSet)
- JoinReducer with schema:2 support
- CheckpointSerializerV5, CheckpointService V5 enhancements
- SyncProtocol, GCPolicy, GCMetrics
- Backfill rejection via graph reachability
- All integration wired into MultiWriterGraph

## What Phase A Requires

### A.1: Default to schema:2

**File:** `src/domain/MultiWriterGraph.js`

Change line ~72:
```javascript
// FROM:
static async open({ persistence, graphName, writerId, schema = 1, gcPolicy = {} })

// TO:
static async open({ persistence, graphName, writerId, schema = 2, gcPolicy = {} })
```

Also update constructor default at ~34.

**File:** `index.js`

Update `openMultiWriter()` at ~302 to pass schema:2 explicitly.

### A.2: Add deprecation warning to EmptyGraph

**File:** `index.js`

Add before the EmptyGraph class (~254):
```javascript
let _emptyGraphWarningShown = false;
```

Add at start of constructor (~318):
```javascript
if (!_emptyGraphWarningShown) {
  console.warn(
    '[DEPRECATION] EmptyGraph is deprecated. Use MultiWriterGraph instead. ' +
    'EmptyGraph will become a compatibility wrapper in v6.0.0.'
  );
  _emptyGraphWarningShown = true;
}
```

### A.3: Export migration API

**File:** `index.js`

Add import at top:
```javascript
import { migrateV4toV5 } from './src/domain/services/MigrationService.js';
```

Add to exports (~147-205):
```javascript
migrateV4toV5,
```

### A.4: Update README support matrix

**File:** `README.md`

Add an "API Status" section documenting:
- MultiWriterGraph (schema:2) = Recommended
- MultiWriterGraph (schema:1) = Legacy, existing graphs only
- EmptyGraph = Deprecated, migration path

Include migration example showing `migrateV4toV5()` usage.

## Research Before Implementing

1. **Read these files first:**
   - `docs/UNIFY-TO-WARP.md` - Full consolidation plan
   - `src/domain/MultiWriterGraph.js` - Current defaults
   - `index.js` - EmptyGraph class, exports, openMultiWriter()
   - `src/domain/services/MigrationService.js` - What's exported

2. **Check existing tests:**
   - Do any tests explicitly use `schema: 1`?
   - Will changing default break existing test assumptions?
   - Search: `grep -r "schema.*1" test/`

3. **Check MigrationService exports:**
   - Is `migrateV4toV5` already exported?
   - What's the function signature?

## Validation

After changes:
```bash
npm run test:local  # All 1,499 tests should pass
```

Check for schema:1 assumptions in tests. Some may need updating if they relied on schema:1 being default.

## Do NOT

- Don't implement Phase B (EmptyGraph wrapper) yet
- Don't remove any existing functionality
- Don't auto-migrate existing graphs
- Don't add features to EmptyGraph

## Commit Style

```
feat(warp): execute Phase A unification

- Default to schema:2 for new MultiWriterGraph instances
- Add deprecation warning to EmptyGraph (once per process)
- Export migrateV4toV5 from package index
- Update README with API status matrix
```

## Success Criteria

- [ ] `MultiWriterGraph.open()` defaults to schema:2
- [ ] EmptyGraph constructor logs deprecation warning (once)
- [ ] `migrateV4toV5` is importable from package root
- [ ] README documents recommended vs deprecated APIs
- [ ] All 1,499 tests pass
