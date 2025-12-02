# Vector Search & AI-Powered Recommendations

Vector search is a cutting-edge feature in Astra DB that enables AI-powered content recommendations using machine learning embeddings.

## What is Vector Search?

Vector search represents data as high-dimensional vectors (arrays of numbers) that capture semantic meaning. Similar content has similar vectors, enabling "find content like this" queries without exact keyword matching.

### Example

Traditional keyword search: "cassandra database tutorial"
- Matches: Videos with exact words "cassandra", "database", "tutorial"
- Misses: "NoSQL distributed data store guide" (same meaning, different words)

Vector search with embeddings:
- Converts text to a 4096-dimension vector representing semantic meaning
- Finds videos with similar meaning regardless of exact words used
- Returns "NoSQL distributed data store guide" as highly relevant

## Vector Types in KillrVideo

KillrVideo uses several vector columns for different AI features:

### 1. Video Content Features (`videos.content_features`)

```cql
content_features vector<float, 4096>
```

This vector represents the **semantic content** of the video, generated from:
- Video title
- Description
- Tags

**How it's created:**
- Text is concatenated: `{title} {description} {tags}`
- Clipped to 512 tokens (NVIDIA embedding model limit)
- Automatically embedded using NVIDIA NV-Embed-QA model
- Stored as 4096-dimension vector

**What it enables:**
- "Find videos similar to this one"
- Content-based recommendations
- Semantic search: "explain distributed databases" → finds relevant videos

### 2. User Preference Vectors (`user_preferences.preference_vector`)

```cql
preference_vector vector<float, 16>
```

Represents a user's viewing preferences based on:
- Watch history
- Liked videos
- Engagement patterns

**What it enables:**
- Personalized "For You" feed
- User-to-user similarity
- Collaborative filtering recommendations

### 3. Tag Vectors (`tags.tag_vector`)

```cql
tag_vector vector<float, 8>
```

Represents semantic meaning of tags for discovering related topics.

**What it enables:**
- "Related tags" suggestions
- Topic clustering
- Semantic tag search

## Similarity Functions

Astra DB provides three similarity functions for vector search:

### 1. Cosine Similarity (Most Common)

```cql
SELECT * FROM videos
ORDER BY content_features ANN OF [0.1, 0.5, ...]
LIMIT 10;
```

- Measures **angle** between vectors (direction, not magnitude)
- Range: -1 to 1 (higher is more similar)
- Best for: Text embeddings, normalized vectors
- Used in: Video recommendations, semantic search

### 2. Euclidean Distance

```cql
SELECT *, similarity_euclidean(content_features, [0.1, 0.5, ...]) AS sim
FROM videos
ORDER BY sim DESC
LIMIT 10;
```

- Measures **straight-line distance** between vectors
- Range: 0 to ∞ (lower is more similar)
- Best for: Spatial data, when magnitude matters
- Used in: Geographic proximity, feature matching

### 3. Dot Product

```cql
SELECT *, similarity_dot_product(content_features, [0.1, 0.5, ...]) AS sim
FROM videos
ORDER BY sim DESC
LIMIT 10;
```

- Measures **alignment and magnitude** of vectors
- Range: -∞ to ∞ (higher is more similar)
- Best for: Recommendation scores, weighted features
- Used in: Scoring algorithms, ranking systems

## Vector Search in Action {#recommendations}

When you view a video, KillrVideo shows "Related Videos" using vector similarity:

1. **Get current video's feature vector**
   ```cql
   SELECT content_features FROM videos WHERE videoid = ?
   ```

2. **Find similar videos**
   ```cql
   SELECT videoid, title, thumbnailUrl,
          similarity_cosine(content_features, ?) AS similarity
   FROM videos
   WHERE content_features ANN OF ?
   LIMIT 5;
   ```

3. **Results ranked by similarity**
   - Similarity score: 0.95 → Nearly identical content
   - Similarity score: 0.75 → Related but different angle
   - Similarity score: 0.50 → Loosely related

## NVIDIA Embedding Integration

KillrVideo uses the **NVIDIA NV-Embed-QA** model through Astra DB's `$vectorize` feature:

### Automatic Vectorization

```json
{
  "insertOne": {
    "document": {
      "name": "Cassandra Basics",
      "description": "Learn distributed database fundamentals",
      "$vectorize": "Cassandra Basics. Learn distributed database fundamentals. cassandra, database, tutorial"
    }
  }
}
```

The `$vectorize` field automatically:
1. Sends text to NVIDIA embedding API
2. Generates 4096-dimension vector
3. Stores in `content_features` column
4. Enables similarity queries

### Token Limit (512 tokens)

NVIDIA embeddings have a 512-token limit. KillrVideo enforces this with `clip_to_512_tokens()` function:

```python
def clip_to_512_tokens(text: str) -> str:
    """Clip text to ~512 tokens (rough: 1 token ≈ 4 chars)"""
    max_chars = 512 * 4  # 2048 characters
    return text[:max_chars]
```

**Why this matters:**
- Embedding models have input limits
- Exceeding limits causes API errors
- Clipping ensures reliable vectorization
- First 2048 characters usually contain key information

## Performance Considerations

### Approximate Nearest Neighbor (ANN)

Vector searches use ANN algorithms, not exact matching:

- **Trade-off**: Speed vs. accuracy
- **ANN**: Fast, returns ~95% accurate results
- **Exact**: Slow, returns 100% accurate results
- **KillrVideo choice**: ANN for real-time recommendations

### Index Types

```cql
CREATE CUSTOM INDEX videos_features_idx
ON videos(content_features)
USING 'StorageAttachedIndex';
```

SAI indexes optimize vector searches with:
- **HNSW** (Hierarchical Navigable Small World) graph structure
- **Sub-linear search time**: O(log N) instead of O(N)
- **Memory efficient**: Not all vectors loaded at once

## Use Cases Beyond KillrVideo

Vector search enables many AI applications:

- **Semantic search**: Find documents by meaning, not keywords
- **Image similarity**: Find visually similar images
- **Product recommendations**: "Customers who liked X also liked Y"
- **Anomaly detection**: Find unusual patterns in data
- **Question answering**: Match questions to relevant answers
- **Duplicate detection**: Find near-duplicate content

## Learn More

- [Astra DB Vector Search](https://docs.datastax.com/en/astra-db-serverless/databases/vector-search.html)
- [NVIDIA NV-Embed Model](https://build.nvidia.com/nvidia/nv-embed-qa)
- [Vector Search Best Practices](https://docs.datastax.com/en/astra-db-serverless/api-reference/client-libraries.html#vector-search)
- [KillrVideo Vector Implementation](../../../../../../../kv-be-python-fastapi-dataapi-table/docs/vector_search.md)

---

**Fun Fact**: A 4096-dimension vector requires 16,384 bytes (16KB) of storage. KillrVideo's videos table with 10,000 videos would use ~160MB just for embeddings. SAI indexes make this efficient by using compressed storage and smart caching.
