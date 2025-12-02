# Search in KillrVideo

KillrVideo implements two complementary search approaches: **keyword search with SAI indexes** and **semantic search with vector embeddings**.

## Search Architecture

### 1. Keyword Search (SAI-based)

Keyword search uses Storage-Attached Indexes to filter videos by exact matches on:
- **Video titles** (`videos_name_idx`)
- **Tags** (`videos_tags_idx`)
- **Categories** (`videos_category_idx`)
- **Languages** (`videos_language_idx`)

#### How It Works

```cql
SELECT * FROM videos
WHERE name LIKE '%cassandra%'
  AND tags CONTAINS 'tutorial'
  AND category = 'education'
LIMIT 20;
```

**Performance characteristics:**
- **Fast**: SAI indexes enable sub-10ms queries
- **Exact matches**: Finds videos with specific keywords
- **Combinable**: Multiple filters work together
- **Scalable**: Handles millions of videos efficiently

**Best for:**
- Precise searches: "Find videos tagged 'cassandra'"
- Category browsing: "Show all music videos"
- Filtered queries: "Educational videos in Spanish"

### 2. Semantic Search (Vector-based)

Semantic search uses vector embeddings to find videos by meaning, not just keywords.

#### How It Works

1. **Convert query to vector**
   ```json
   {
     "$vectorize": "explain how distributed databases work"
   }
   ```

2. **Find similar content**
   ```cql
   SELECT videoid, title, thumbnailUrl,
          similarity_cosine(content_features, ?) AS score
   FROM videos
   WHERE content_features ANN OF ?
   ORDER BY score DESC
   LIMIT 20;
   ```

3. **Return ranked results**
   - Videos ranked by semantic similarity
   - No exact keyword match required
   - Understands synonyms and related concepts

**Performance characteristics:**
- **Moderate speed**: 20-50ms typical query time
- **Approximate results**: ANN returns ~95% accurate matches
- **Context-aware**: Understands query intent
- **Smart**: Finds related content even with different wording

**Best for:**
- Natural language queries: "how do NoSQL databases handle failures"
- Concept-based search: "distributed system tutorials"
- Discovery: "videos similar to this one"

## Search Ranking {#ranking}

Search results are ranked differently depending on the search type:

### Keyword Search Ranking

Keyword searches use **boolean matching** - results either match or don't:

1. **Exact matches** ranked first
2. **Multiple criteria matches** ranked higher
3. **Recent videos** can be boosted (via `ORDER BY added_date DESC`)

Example query with ranking:
```cql
SELECT * FROM videos
WHERE tags CONTAINS 'cassandra'
ORDER BY added_date DESC
LIMIT 20;
```

Results are:
- All tagged with 'cassandra'
- Sorted by newest first
- No relevance score

### Semantic Search Ranking

Semantic searches use **similarity scores** (0 to 1):

- **0.9-1.0**: Nearly identical content
- **0.7-0.9**: Highly relevant, similar topic
- **0.5-0.7**: Related but different angle
- **0.3-0.5**: Loosely related
- **< 0.3**: Not very relevant

Example query with scoring:
```cql
SELECT videoid, title,
       similarity_cosine(content_features, ?) AS relevance
FROM videos
WHERE content_features ANN OF ?
ORDER BY relevance DESC
LIMIT 20;
```

Results include:
- **Relevance score** for each result
- **Ranked by similarity** to query
- **Top matches** most semantically similar

## Hybrid Search (Future Enhancement)

Combine keyword and semantic search for best results:

1. **Stage 1: Keyword filter**
   ```cql
   WHERE category = 'education'
     AND tags CONTAINS 'database'
   ```

2. **Stage 2: Semantic ranking**
   ```cql
   ORDER BY similarity_cosine(content_features, ?) DESC
   ```

Result: Videos matching keywords, ranked by semantic relevance.

## Search Performance Optimization

### SAI Index Configuration

```cql
CREATE CUSTOM INDEX videos_name_idx
ON videos(name)
USING 'StorageAttachedIndex'
WITH OPTIONS = {
  'case_sensitive': 'false',
  'normalize': 'true',
  'ascii': 'true'
};
```

**Options explained:**
- `case_sensitive: false` - "Cassandra" matches "cassandra"
- `normalize: true` - "café" matches "cafe"
- `ascii: true` - Converts accented characters to ASCII

### Vector Index Configuration

```cql
CREATE CUSTOM INDEX videos_features_idx
ON videos(content_features)
USING 'StorageAttachedIndex'
WITH OPTIONS = {
  'similarity_function': 'COSINE'
};
```

**Similarity functions:**
- **COSINE** - Best for text embeddings (default)
- **EUCLIDEAN** - Best for spatial data
- **DOT_PRODUCT** - Best for pre-normalized vectors

## Query Patterns

### Pattern 1: Simple Tag Search

```javascript
const { data } = useSearchVideos({
  query: 'cassandra',
  page: 1,
  pageSize: 20
});
```

Backend query:
```cql
SELECT * FROM videos
WHERE tags CONTAINS 'cassandra'
ORDER BY added_date DESC
LIMIT 20;
```

### Pattern 2: Multi-Criteria Filter

```javascript
const { data } = useSearchVideos({
  query: 'tutorial',
  category: 'education',
  contentRating: 'G',
  page: 1,
  pageSize: 20
});
```

Backend query:
```cql
SELECT * FROM videos
WHERE tags CONTAINS 'tutorial'
  AND category = 'education'
  AND content_rating = 'G'
ORDER BY added_date DESC
LIMIT 20;
```

### Pattern 3: Semantic Search

```javascript
const { data } = searchVideosBySemantic({
  query: 'how do distributed databases work',
  limit: 20
});
```

Backend query:
```json
{
  "find": {
    "sort": {
      "$vectorize": "how do distributed databases work"
    },
    "options": {
      "limit": 20
    }
  }
}
```

## Search Analytics

KillrVideo tracks search performance metrics:

- **Query latency**: P50, P95, P99 response times
- **Result quality**: Click-through rates on results
- **Search volume**: Queries per second
- **Failed searches**: Zero-result queries

These metrics help optimize:
- Index configuration
- Query patterns
- Embedding model selection
- Caching strategies

## Learn More

- [SAI Indexes](./sai-indexes.md)
- [Vector Search](./vector-search.md)
- [Astra DB Search Documentation](https://docs.datastax.com/en/astra-db-serverless/docs/develop/dev-with-sai.html)
- [Vector Search Best Practices](https://docs.datastax.com/en/astra-db-serverless/databases/vector-search.html)

---

**Pro Tip**: Start with keyword search for precise queries, then add semantic search for discovery and exploration. The combination provides the best user experience.
