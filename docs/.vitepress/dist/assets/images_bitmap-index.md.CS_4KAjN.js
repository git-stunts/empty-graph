import{_ as a,c as n,o as i,ae as t}from"./chunks/framework.DvGhUH3j.js";const o=JSON.parse('{"title":"Roaring Bitmap Index Architecture","description":"","frontmatter":{},"headers":[],"relativePath":"images/bitmap-index.md","filePath":"images/bitmap-index.md"}'),e={name:"images/bitmap-index.md"};function l(p,s,h,E,r,k){return i(),n("div",null,[...s[0]||(s[0]=[t(`<h1 id="roaring-bitmap-index-architecture" tabindex="-1">Roaring Bitmap Index Architecture <a class="header-anchor" href="#roaring-bitmap-index-architecture" aria-label="Permalink to &quot;Roaring Bitmap Index Architecture&quot;">​</a></h1><p>This diagram illustrates how EMPTY GRAPH uses Roaring Bitmaps to provide O(1) lookups for graph traversal operations.</p><h2 id="overview-diagram" tabindex="-1">Overview Diagram <a class="header-anchor" href="#overview-diagram" aria-label="Permalink to &quot;Overview Diagram&quot;">​</a></h2><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph GRAPH[&quot;Git Commit Graph&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        direction TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        A[&quot;Node A&lt;br/&gt;(root commit)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        B[&quot;Node B&lt;br/&gt;(branch 1)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        C[&quot;Node C&lt;br/&gt;(branch 2)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        D[&quot;Node D&lt;br/&gt;(merge commit)&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        A --&gt; B</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        A --&gt; C</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        B --&gt; D</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        C --&gt; D</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph INDEX[&quot;Bitmap Index Structure&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        direction TB</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph SHA_TO_ID[&quot;SHA to ID Mapping&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            M1[&quot;meta_a1.json&lt;br/&gt;{ &#39;a1b2c3...&#39;: 0 }&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            M2[&quot;meta_b2.json&lt;br/&gt;{ &#39;b2c3d4...&#39;: 1 }&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            M3[&quot;meta_c3.json&lt;br/&gt;{ &#39;c3d4e5...&#39;: 2 }&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            M4[&quot;meta_d4.json&lt;br/&gt;{ &#39;d4e5f6...&#39;: 3 }&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph FWD[&quot;Forward Index (fwd)&lt;br/&gt;parent -&gt; children IDs&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            F1[&quot;shards_fwd_a1.json&lt;br/&gt;A: bitmap{1, 2}&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            F2[&quot;shards_fwd_b2.json&lt;br/&gt;B: bitmap{3}&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            F3[&quot;shards_fwd_c3.json&lt;br/&gt;C: bitmap{3}&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph REV[&quot;Reverse Index (rev)&lt;br/&gt;child -&gt; parent IDs&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            R2[&quot;shards_rev_b2.json&lt;br/&gt;B: bitmap{0}&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            R3[&quot;shards_rev_c3.json&lt;br/&gt;C: bitmap{0}&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            R4[&quot;shards_rev_d4.json&lt;br/&gt;D: bitmap{1, 2}&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    GRAPH -.-&gt;|&quot;Build Index&quot;| INDEX</span></span></code></pre></div><h2 id="sha-to-numeric-id-mapping" tabindex="-1">SHA to Numeric ID Mapping <a class="header-anchor" href="#sha-to-numeric-id-mapping" aria-label="Permalink to &quot;SHA to Numeric ID Mapping&quot;">​</a></h2><p>SHAs are mapped to compact numeric IDs for efficient bitmap storage:</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart LR</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph SHAs[&quot;40-char Git SHAs&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        SHA_A[&quot;a1b2c3d4e5...&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        SHA_B[&quot;b2c3d4e5f6...&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        SHA_C[&quot;c3d4e5f6a7...&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        SHA_D[&quot;d4e5f6a7b8...&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph IDs[&quot;Numeric IDs&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ID0[&quot;0&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ID1[&quot;1&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ID2[&quot;2&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ID3[&quot;3&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SHA_A --&gt; ID0</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SHA_B --&gt; ID1</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SHA_C --&gt; ID2</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SHA_D --&gt; ID3</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style ID0 fill:#e1f5fe</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style ID1 fill:#e1f5fe</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style ID2 fill:#e1f5fe</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style ID3 fill:#e1f5fe</span></span></code></pre></div><h2 id="query-flow-getchildren-a" tabindex="-1">Query Flow: getChildren(A) <a class="header-anchor" href="#query-flow-getchildren-a" aria-label="Permalink to &quot;Query Flow: getChildren(A)&quot;">​</a></h2><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">sequenceDiagram</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    participant User</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    participant Reader as BitmapIndexReader</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    participant Meta as meta_a1.json</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    participant Fwd as shards_fwd_a1.json</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    participant Bitmap as RoaringBitmap32</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    User-&gt;&gt;Reader: getChildren(&quot;a1b2c3...&quot;)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Note over Reader: 1. Extract SHA prefix &quot;a1&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Reader-&gt;&gt;Fwd: Load shard (lazy, cached)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Fwd--&gt;&gt;Reader: { &quot;a1b2c3...&quot;: &quot;base64bitmap&quot; }</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Note over Reader: 2. Decode bitmap for SHA</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Reader-&gt;&gt;Bitmap: deserialize(base64)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Bitmap--&gt;&gt;Reader: bitmap{1, 2}</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Note over Reader: 3. Convert IDs to SHAs</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Reader-&gt;&gt;Meta: Load all meta shards (cached)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Meta--&gt;&gt;Reader: ID 1 = &quot;b2c3d4...&quot;, ID 2 = &quot;c3d4e5...&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Reader--&gt;&gt;User: [&quot;b2c3d4...&quot;, &quot;c3d4e5...&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Note over User,Reader: O(1) lookup via bitmap!</span></span></code></pre></div><blockquote><p><strong>Warning</strong>: First query loads all meta shards O(n); subsequent queries O(1)</p><p><code>BitmapIndexReader.getChildren</code> depends on <code>_buildIdToShaMapping</code> which loads all meta shards (up to 256) on the first query. Only subsequent lookups are O(1). Note that the LRU cache (default 100) can be exceeded during initial load.</p></blockquote><h2 id="query-flow-getparents-d" tabindex="-1">Query Flow: getParents(D) <a class="header-anchor" href="#query-flow-getparents-d" aria-label="Permalink to &quot;Query Flow: getParents(D)&quot;">​</a></h2><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">sequenceDiagram</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    participant User</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    participant Reader as BitmapIndexReader</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    participant Rev as shards_rev_d4.json</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    participant Bitmap as RoaringBitmap32</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    participant Meta as meta_*.json</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    User-&gt;&gt;Reader: getParents(&quot;d4e5f6...&quot;)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Note over Reader: 1. Extract SHA prefix &quot;d4&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Reader-&gt;&gt;Rev: Load reverse shard (lazy, cached)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Rev--&gt;&gt;Reader: { &quot;d4e5f6...&quot;: &quot;base64bitmap&quot; }</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Note over Reader: 2. Decode bitmap for SHA</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Reader-&gt;&gt;Bitmap: deserialize(base64)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Bitmap--&gt;&gt;Reader: bitmap{1, 2}</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Note over Reader: 3. Convert IDs to SHAs</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Reader-&gt;&gt;Meta: Lookup IDs 1 and 2</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Meta--&gt;&gt;Reader: ID 1 = &quot;b2c3d4...&quot;, ID 2 = &quot;c3d4e5...&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Reader--&gt;&gt;User: [&quot;b2c3d4...&quot;, &quot;c3d4e5...&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Note over User,Reader: Merge commits with multiple&lt;br/&gt;parents resolved in O(1)!</span></span></code></pre></div><h2 id="sharding-strategy" tabindex="-1">Sharding Strategy <a class="header-anchor" href="#sharding-strategy" aria-label="Permalink to &quot;Sharding Strategy&quot;">​</a></h2><p>Shards are organized by 2-character SHA prefix for efficient lazy loading:</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Storage[&quot;Index Storage (256 possible prefixes)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        direction LR</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph Prefix_00[&quot;Prefix &#39;00&#39;&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            meta_00[&quot;meta_00.json&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            fwd_00[&quot;shards_fwd_00.json&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            rev_00[&quot;shards_rev_00.json&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph Prefix_a1[&quot;Prefix &#39;a1&#39;&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            meta_a1[&quot;meta_a1.json&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            fwd_a1[&quot;shards_fwd_a1.json&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            rev_a1[&quot;shards_rev_a1.json&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph Prefix_ff[&quot;Prefix &#39;ff&#39;&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            meta_ff[&quot;meta_ff.json&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            fwd_ff[&quot;shards_fwd_ff.json&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            rev_ff[&quot;shards_rev_ff.json&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        dots[&quot;...&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Query[&quot;Query: getChildren(&#39;a1b2c3...&#39;)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Q1[&quot;1. Extract prefix &#39;a1&#39;&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Q2[&quot;2. Load only shards_fwd_a1.json&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Q3[&quot;3. Other shards stay unloaded&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Query --&gt; Prefix_a1</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style Prefix_a1 fill:#c8e6c9</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style Prefix_00 fill:#f5f5f5</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style Prefix_ff fill:#f5f5f5</span></span></code></pre></div><h2 id="why-roaring-bitmaps-are-fast" tabindex="-1">Why Roaring Bitmaps Are Fast <a class="header-anchor" href="#why-roaring-bitmaps-are-fast" aria-label="Permalink to &quot;Why Roaring Bitmaps Are Fast&quot;">​</a></h2><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Traditional[&quot;Traditional Approach&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        direction TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        T1[&quot;Store edges as arrays&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        T2[&quot;children: [&#39;sha1&#39;, &#39;sha2&#39;, ...]&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        T3[&quot;O(n) to check membership&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        T4[&quot;Large storage for many edges&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        T1 --&gt; T2 --&gt; T3 --&gt; T4</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Roaring[&quot;Roaring Bitmap Approach&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        direction TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        R1[&quot;Store IDs in compressed bitmap&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        R2[&quot;children: bitmap{1, 2, 3, ...}&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        R3[&quot;O(1) to check membership&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        R4[&quot;Highly compressed storage&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        R1 --&gt; R2 --&gt; R3 --&gt; R4</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Benefits[&quot;Key Benefits&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        B1[&quot;Compression: Run-length encoding for dense ranges&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        B2[&quot;Fast Operations: AND, OR, XOR on bitmaps&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        B3[&quot;Memory Efficient: 10-100x smaller than arrays&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        B4[&quot;Lazy Loading: Only load shards you need&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Traditional -.-&gt;|&quot;vs&quot;| Roaring</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Roaring --&gt; Benefits</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style Roaring fill:#e8f5e9</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style Traditional fill:#ffebee</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style Benefits fill:#e3f2fd</span></span></code></pre></div><h2 id="complete-index-structure-example" tabindex="-1">Complete Index Structure Example <a class="header-anchor" href="#complete-index-structure-example" aria-label="Permalink to &quot;Complete Index Structure Example&quot;">​</a></h2><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Graph[&quot;Example Git Graph&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        A[&quot;A (id=0)&lt;br/&gt;sha: a1b2c3...&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        B[&quot;B (id=1)&lt;br/&gt;sha: b2c3d4...&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        C[&quot;C (id=2)&lt;br/&gt;sha: c3d4e5...&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        D[&quot;D (id=3)&lt;br/&gt;sha: d4e5f6...&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        A --&gt;|&quot;parent&quot;| B</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        A --&gt;|&quot;parent&quot;| C</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        B --&gt;|&quot;parent&quot;| D</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        C --&gt;|&quot;parent&quot;| D</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Forward[&quot;Forward Index (fwd)&lt;br/&gt;Who are my children?&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        FWD_A[&quot;A -&gt; bitmap{1, 2}&lt;br/&gt;(children: B, C)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        FWD_B[&quot;B -&gt; bitmap{3}&lt;br/&gt;(child: D)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        FWD_C[&quot;C -&gt; bitmap{3}&lt;br/&gt;(child: D)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        FWD_D[&quot;D -&gt; bitmap{}&lt;br/&gt;(no children)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Reverse[&quot;Reverse Index (rev)&lt;br/&gt;Who are my parents?&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        REV_A[&quot;A -&gt; bitmap{}&lt;br/&gt;(no parents - root)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        REV_B[&quot;B -&gt; bitmap{0}&lt;br/&gt;(parent: A)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        REV_C[&quot;C -&gt; bitmap{0}&lt;br/&gt;(parent: A)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        REV_D[&quot;D -&gt; bitmap{1, 2}&lt;br/&gt;(parents: B, C)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Graph --&gt; Forward</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Graph --&gt; Reverse</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style FWD_A fill:#bbdefb</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style FWD_B fill:#bbdefb</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style FWD_C fill:#bbdefb</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style FWD_D fill:#bbdefb</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style REV_A fill:#c8e6c9</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style REV_B fill:#c8e6c9</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style REV_C fill:#c8e6c9</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    style REV_D fill:#c8e6c9</span></span></code></pre></div><h2 id="shard-file-format" tabindex="-1">Shard File Format <a class="header-anchor" href="#shard-file-format" aria-label="Permalink to &quot;Shard File Format&quot;">​</a></h2><p>Each shard file contains a versioned envelope with checksum for integrity:</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Envelope[&quot;Shard Envelope&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        direction TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        V[&quot;version: 1&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        C[&quot;checksum: &#39;sha256...&#39;&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        D[&quot;data: {...}&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph MetaShard[&quot;meta_a1.json&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        MD[&quot;data: {&lt;br/&gt;  &#39;a1b2c3...&#39;: 0,&lt;br/&gt;  &#39;a1f2e3...&#39;: 42,&lt;br/&gt;  ...&lt;br/&gt;}&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph BitmapShard[&quot;shards_fwd_a1.json&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        BD[&quot;data: {&lt;br/&gt;  &#39;a1b2c3...&#39;: &#39;base64bitmap&#39;,&lt;br/&gt;  &#39;a1f2e3...&#39;: &#39;base64bitmap&#39;,&lt;br/&gt;  ...&lt;br/&gt;}&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Envelope --&gt; MetaShard</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Envelope --&gt; BitmapShard</span></span></code></pre></div><h2 id="summary" tabindex="-1">Summary <a class="header-anchor" href="#summary" aria-label="Permalink to &quot;Summary&quot;">​</a></h2><table tabindex="0"><thead><tr><th>Component</th><th>Purpose</th><th>Lookup Time</th></tr></thead><tbody><tr><td><code>meta_XX.json</code></td><td>SHA to numeric ID mapping</td><td>O(1)</td></tr><tr><td><code>shards_fwd_XX.json</code></td><td>Forward edges (parent to children)</td><td>O(1)</td></tr><tr><td><code>shards_rev_XX.json</code></td><td>Reverse edges (child to parents)</td><td>O(1)</td></tr><tr><td>LRU Cache</td><td>Avoid re-loading recently used shards</td><td>O(1)</td></tr></tbody></table><p>The combination of:</p><ol><li><strong>Numeric IDs</strong> (compact representation)</li><li><strong>Roaring Bitmaps</strong> (compressed, fast set operations)</li><li><strong>Sharding by prefix</strong> (lazy loading, reduced memory)</li><li><strong>LRU caching</strong> (avoid repeated I/O)</li></ol><p>...enables EMPTY GRAPH to traverse massive Git commit graphs with constant-time lookups.</p>`,27)])])}const c=a(e,[["render",l]]);export{o as __pageData,c as default};
