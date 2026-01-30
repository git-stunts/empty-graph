# EmptyGraph

The main facade class that ties everything together.

```javascript
import EmptyGraph from '@git-stunts/empty-graph';
const graph = new EmptyGraph({ persistence });
```

## Methods

### `createNode({ message, parents })`
Creates a new node (commit).

### `readNode(sha)`
Reads the message of a node.

### `rebuildIndex(ref)`
Builds the bitmap index for O(1) lookups.
