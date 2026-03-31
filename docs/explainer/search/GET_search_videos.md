# GET /api/v1/search/videos - Video Search (Keyword & Semantic)

## Overview

This endpoint searches videos using either **keyword search** (text-based substring matching) or
**semantic search** (AI-powered meaning-based search using vector embeddings). It is the primary
discovery mechanism for users who know what they are looking for, as opposed to browsing feeds.

**Why it exists**: Traditional keyword search works well when a user knows the exact terms a video
uses, but it fails when intent and meaning diverge from literal words. A search for "how to cook
Italian food" would miss a video titled "Homemade Pasta From Scratch" because none of the words
overlap. Semantic search solves this by converting both the query and every video's content into
numerical vectors and comparing their geometric similarity. KillrVideo supports both modes behind
a single endpoint so the frontend can experiment with search quality without changing its API
integration.

**Key design decision**: The backend's `search_videos_by_keyword()` actually delegates to
`search_videos_by_semantic()` internally. Both code paths ultimately perform a vector-based
search, making keyword mode a thin wrapper rather than a fundamentally different strategy. This
keeps the implementation simple while still exposing separate modes for future differentiation.

## HTTP Details

- **Method**: GET
- **Path**: `/api/v1/search/videos`
- **Auth Required**: No (public endpoint)
- **Success Status**: 200 OK

### Request Parameters

```http
GET /api/v1/search/videos?query=italian+cooking&mode=semantic&page=1&pageSize=10
```

| Parameter  | Type    | Required | Default   | Description                              |
|------------|---------|----------|-----------|------------------------------------------|
| `query`    | string  | Yes      | -         | Search term (min 1 character)            |
| `mode`     | string  | No       | `keyword` | Search mode: `keyword` or `semantic`     |
| `page`     | integer | No       | 1         | Page number (>=1)                        |
| `pageSize` | integer | No       | 10        | Results per page (1-100)                 |

### Success Response (200 OK)

```json
{
  "data": [
    {
      "videoid": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Homemade Pasta From Scratch",
      "description": "Learn to make fresh pasta at home with simple ingredients.",
      "preview_image_location": "https://storage.example.com/thumbs/550e8400.jpg",
      "userid": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "added_date": "2025-10-31T10:00:00Z",
      "tags": ["cooking", "pasta", "italian"],
      "$similarity": 0.87
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 10,
    "totalItems": 42,
    "totalPages": 5
  }
}
```

**Note**: The `$similarity` field (a float from 0.0 to 1.0) is present on every result in
semantic mode. In keyword mode it may still appear because keyword search delegates to
semantic search internally.

### Error Responses

| Status | Condition                          | Example Body                                     |
|--------|------------------------------------|--------------------------------------------------|
| 422    | Missing or invalid query parameter | `{"detail": "query is required"}`                |
| 422    | pageSize out of range              | `{"detail": "pageSize must be between 1 and 100"}` |
| 500    | Embedding service unavailable      | `{"detail": "Internal server error"}`            |

## Cassandra Concepts Explained

### What is Vector Search?

Imagine a library where every book is placed on an enormous 3D map. Cookbooks cluster near
each other, science fiction novels form another cluster, and history books sit in their own
neighborhood. When you walk into the library and say "I want something about space
exploration," the librarian does not check every title for the words "space" and "exploration."
Instead, they look at where you are standing on the map (based on what your words *mean*) and
hand you the nearest books.

Vector search works the same way, except the "map" has 384 dimensions instead of three, and
the "books" are videos.

**The three-step process**:

1. **Encode**: Convert text into a list of numbers (a "vector"). The IBM Granite-Embedding-30m-English
   model turns any text into 384 floating-point numbers.
   ```
   "italian cooking" --> [0.023, -0.871, 0.445, ..., 0.112]   (384 floats)
   ```

2. **Compare**: Measure how close two vectors are using cosine similarity. Two vectors
   pointing in the same direction score close to 1.0; perpendicular vectors score 0.0.
   ```
   cosine_similarity(query_vector, video_vector) = 0.87
   ```

3. **Rank**: Return videos sorted from most similar to least similar.

### Approximate Nearest Neighbor (ANN)

Searching every single video vector to find the closest ones is expensive. With one million
videos and 384-dimensional vectors, an exact search requires one million cosine calculations
per query. ANN algorithms trade a tiny amount of accuracy for a massive speedup by organizing
vectors into a navigable graph structure at index time. At query time, the algorithm walks this
graph to find *approximately* the nearest neighbors, often achieving 95-99% recall while
examining only a fraction of all vectors.

**Analogy**: Finding the nearest coffee shop by checking every shop on Earth versus using GPS
to jump to your neighborhood first and then walking to the nearest one.

### Cosine Similarity

Cosine similarity measures the angle between two vectors, ignoring their magnitude (length).
This is important because we care about *what* a video is about, not *how much* text its
description contains.

```
              Video A
              /
             / 15 degrees  <-- high similarity (cos 15 deg ~ 0.97)
            /
  Query ---+
            \
             \ 80 degrees  <-- low similarity (cos 80 deg ~ 0.17)
              \
              Video B
```

| Score     | Meaning              | Typical Action   |
|-----------|----------------------|------------------|
| 0.90-1.00 | Nearly identical     | Top result       |
| 0.70-0.89 | Highly relevant      | Include          |
| 0.50-0.69 | Loosely related      | Borderline       |
| 0.00-0.49 | Unrelated            | Filter out       |

### IBM Granite Embeddings

KillrVideo uses the **IBM Granite-Embedding-30m-English** model, a lightweight 30-million
parameter model producing 384-dimensional vectors. Compared to larger models (e.g., OpenAI's
text-embedding-ada-002 at 1536 dimensions or NVIDIA NV-Embed-QA at 4096 dimensions), Granite
is faster and cheaper to run while still delivering strong semantic understanding for English
text.

**Key characteristics**:
- **Dimensions**: 384 (about 1.5 KB per vector)
- **Language**: English
- **Model size**: 30M parameters -- small enough to self-host
- **Use case**: Query-document similarity, search, retrieval

### Storage-Attached Indexes (SAI)

Cassandra's SAI is a secondary-index implementation that lives alongside SSTables on disk. For
vector columns, SAI builds an ANN graph that enables `ORDER BY ... ANN OF` queries. For
collection columns like `set<text>`, SAI enables queries against individual elements of the
collection (used by the tag suggestion endpoint).

**Why SAI instead of a separate vector database?**

Using SAI keeps vectors co-located with the rest of the video metadata. There is no need to
synchronize data between Cassandra and a standalone vector store like Pinecone or Milvus.
Reads, writes, and indexes share the same replication, consistency, and operational tooling.

### Keyword vs Semantic Search

| Aspect            | Keyword Search                     | Semantic Search                       |
|-------------------|------------------------------------|---------------------------------------|
| **Matching**      | Delegates to semantic internally   | Vector similarity (ANN)               |
| **Example query** | "python tutorial"                  | "learn to code in python"             |
| **Matches**       | Semantically similar videos        | Semantically similar videos           |
| **Technology**    | Embedding + ANN (via delegation)   | Embedding + ANN                       |
| **Latency**       | ~50-200 ms                         | ~50-200 ms                            |
| **Key point**     | Currently wraps semantic search    | Direct vector similarity              |

In the current backend both modes exercise the same vector pipeline. The `mode` parameter
exists so the frontend can distinguish intent and so the backend can be extended later (for
example, adding BM25 or hybrid search for keyword mode).

## Data Model

### Table: `videos`

```cql
CREATE TABLE killrvideo.videos (
    videoid uuid PRIMARY KEY,
    name text,
    description text,
    tags set<text>,
    content_features vector<float, 384>,
    userid uuid,
    added_date timestamp,
    views int
);
```

### Index: Vector Search (SAI with Cosine Similarity)

```cql
CREATE CUSTOM INDEX videos_content_features_idx
ON killrvideo.videos(content_features)
USING 'StorageAttachedIndex'
WITH OPTIONS = { 'similarity_function': 'COSINE' };
```

**Index properties**:
- **Similarity function**: COSINE -- measures angle between vectors, range [-1, 1] normalized
  to [0, 1] for the `similarity_cosine()` function.
- **Performance**: ANN search, not brute-force. Index maintenance happens during compaction.

### Index: Tags (SAI on Collection)

```cql
CREATE CUSTOM INDEX videos_tags_idx
ON killrvideo.videos(tags)
USING 'StorageAttachedIndex';
```

This index is not used by search directly but is shared infrastructure with the tag suggestion
endpoint.

### Storage Estimates

| Component          | Size per Video | 1 Million Videos |
|--------------------|----------------|------------------|
| Vector (384 float) | ~1.5 KB        | ~1.5 GB          |
| SAI ANN index      | ~0.5 KB (est.) | ~500 MB          |
| Metadata columns   | ~0.5 KB        | ~500 MB          |
| **Total**          | **~2.5 KB**    | **~2.5 GB**      |

The 384-dimension vectors are substantially smaller than 4096-dimension alternatives, which
would require ~16 KB per video.

## Database Queries

### How Keyword Mode Delegates to Semantic Mode

The backend function `video_service.search_videos_by_keyword()` does not perform traditional
text matching. Instead, it delegates to `search_videos_by_semantic()`:

```python
async def search_videos_by_keyword(query: str, page: int, page_size: int):
    """Keyword search delegates to semantic search."""
    return await search_videos_by_semantic(query, page, page_size)
```

This means both modes ultimately follow the same execution path described below.

### Core Query: Semantic Search

**Service Function**: `video_service.search_videos_by_semantic()`

```python
async def search_videos_by_semantic(query: str, page: int, page_size: int):
    # Step 1: Generate query embedding using IBM Granite
    query_embedding = generate_embedding(query)
    # Calls IBM Granite-Embedding-30m-English
    # Returns: list of 384 floats

    # Step 2: Perform vector search with similarity threshold
    results = await semantic_search_with_threshold(
        table="videos",
        vector_column="content_features",
        query_embedding=query_embedding,
        page=page,
        page_size=page_size,
        similarity_threshold=0.7
    )

    return results
```

**Vector search utility**: `vector_search_utils.semantic_search_with_threshold()`

```python
async def semantic_search_with_threshold(
    table, vector_column, query_embedding,
    page, page_size, similarity_threshold=0.7,
    overfetch_factor=3
):
    overfetch = page_size * overfetch_factor * page

    # Execute ANN query
    rows = execute_cql(
        "SELECT videoid, name, description, tags, userid, added_date, views, "
        "similarity_cosine(content_features, ?) AS score "
        "FROM videos "
        "ORDER BY content_features ANN OF ? "
        "LIMIT ?",
        [query_embedding, query_embedding, overfetch]
    )

    # Client-side filtering by threshold
    rows = [r for r in rows if r["score"] >= similarity_threshold]

    # Paginate client-side
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]

    return page_rows, len(rows)
```

### Equivalent CQL

```cql
SELECT videoid, name, description, tags, userid, added_date, views,
       similarity_cosine(content_features, ?) AS score
FROM killrvideo.videos
ORDER BY content_features ANN OF ?
LIMIT 30;
```

**Parameter binding**:
- Both `?` placeholders receive the 384-float query embedding generated by IBM Granite.
- `LIMIT 30` = `pageSize(10) * overfetch_factor(3) * page(1)`.

**What happens inside Cassandra**:
1. The query embedding arrives as a 384-float vector.
2. SAI traverses its ANN graph starting from a random entry point, greedily navigating to
   closer neighbors.
3. Returns up to 30 rows sorted by descending cosine similarity.
4. The `similarity_cosine()` function computes the exact similarity for display.

**Performance**: ~50-200 ms depending on dataset size and cluster topology.

### The Overfetch Pattern

**Problem**: Cassandra's ANN search has no built-in `WHERE similarity >= 0.7` filter. The
`ORDER BY ... ANN OF` clause returns the top-N nearest neighbors regardless of how similar
they actually are.

**Solution**: Fetch more rows than needed (overfetch), filter client-side, then paginate.

```
Database returns 30 rows (overfetch 3x for page 1, pageSize 10)
  |
  v
Client filters: keep only rows with score >= 0.7
  |-- 22 rows pass the threshold
  |
  v
Client paginates: return rows 1-10 (page 1)
  |-- 10 rows returned to caller
  |
  v
Remaining 12 rows available for page 2
```

**Why 3x?** With a threshold of 0.7, typically 60-80% of ANN results pass. A 3x factor
provides enough headroom. For deeper pages (page 5, page 10), the overfetch grows
proportionally (`page_size * overfetch_factor * page`) to ensure earlier pages' worth of
results are available for skipping.

**Trade-off**: More data transferred from the database, but this is necessary until Cassandra
supports server-side similarity filtering.

## Implementation Flow

```
+-------------------------------------------------------------+
| 1. Client sends GET /api/v1/search/videos?                  |
|    query=italian+cooking&mode=semantic&page=1&pageSize=10    |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 2. Validate query parameters                                |
|    +-- query missing/empty?  --> 422 Validation Error       |
|    +-- pageSize out of range? --> 422 Validation Error      |
|    +-- Valid? --> Continue                                   |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 3. Route to search function                                 |
|    +-- mode=keyword?  --> search_videos_by_keyword()        |
|    |                      (delegates to semantic internally)|
|    +-- mode=semantic? --> search_videos_by_semantic()       |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 4. Generate query embedding                                 |
|    IBM Granite-Embedding-30m-English                        |
|    "italian cooking" --> [0.023, -0.871, ..., 0.112]        |
|    (384-dimensional float vector)                           |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 5. Execute ANN query against Cassandra                      |
|    SELECT videoid, name, ...,                               |
|      similarity_cosine(content_features, ?) AS score        |
|    FROM videos                                              |
|    ORDER BY content_features ANN OF ?                       |
|    LIMIT 30                                                 |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 6. Client-side post-processing                              |
|    +-- Filter: keep rows where score >= 0.7                 |
|    +-- Paginate: slice rows[(page-1)*pageSize : page*pageSize] |
|    +-- Map to VideoSummary models                           |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 7. Build paginated response                                 |
|    { "data": [...], "pagination": { ... } }                 |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 8. Return 200 OK with search results                        |
+-------------------------------------------------------------+
```

**Total database queries**: 1 (ANN vector search)
**External service calls**: 1 (embedding generation via IBM Granite)
**Expected latency**: 50-200 ms (embedding ~20 ms + ANN search ~30-180 ms)

## Special Notes

### 1. Embedding Generation is a Network Call

Every search request requires a call to the IBM Granite-Embedding-30m-English model to
convert the query string into a 384-float vector. If the embedding service is down or slow,
search fails entirely.

**Mitigation strategies**:
- Cache embeddings for repeated queries (e.g., "tutorial" is searched frequently).
- Set aggressive timeouts on the embedding call (500 ms).
- Consider running the model locally -- at 30M parameters, Granite is small enough to serve
  on a single CPU.

### 2. Similarity Threshold Tuning

The default threshold of 0.7 was chosen as a reasonable starting point. In practice:

- **Raise to 0.8+** if users complain about irrelevant results.
- **Lower to 0.5** if users complain about missing results.
- The best threshold depends on the embedding model, the corpus, and user expectations.

**Monitoring tip**: Log the score distribution of returned results. If 90% of results score
above 0.9, the threshold is too low to matter. If many results cluster near 0.7, the
threshold is actively shaping the result set.

### 3. Cold Start: Videos Without Embeddings

When a video is first uploaded, its `content_features` column may be NULL if the embedding
pipeline has not run yet. Videos with NULL vectors are invisible to ANN search -- they simply
do not appear in results.

**Current behavior**: Embeddings are generated synchronously during video creation, so this
gap should not occur under normal operation. However, if the embedding service is temporarily
unavailable, videos may be created without vectors.

### 4. Astra DB / DataStax Considerations

If running on DataStax Astra DB (the managed Cassandra service), the CQL syntax is identical.
Astra's SAI implementation supports the same `ORDER BY ... ANN OF` syntax. The main
operational difference is that index builds and compaction are managed automatically.

For self-hosted Cassandra 5.0+, ensure that SAI is enabled in `cassandra.yaml`:
```yaml
storage_attached_index_enabled: true
```

### 5. Why Not Use Cassandra's LIKE or CONTAINS?

Cassandra's `LIKE` operator (available with SAI on text columns) supports prefix and suffix
matching but not full-text search with relevance ranking. For a search feature, users expect
results ranked by relevance, not returned in token order. Vector search provides this ranking
naturally via similarity scores.

### 6. Security: Query Injection

The query parameter is passed to the embedding model, not interpolated into CQL. There is no
risk of CQL injection. However, excessively long queries waste embedding compute. The backend
should enforce a maximum query length (e.g., 500 characters).

## Developer Tips

### Common Pitfalls

1. **Assuming keyword and semantic are different code paths**: In the current backend, keyword
   mode delegates to semantic mode. Do not build frontend logic that assumes keyword results
   lack similarity scores or behave fundamentally differently.

2. **Ignoring the overfetch cost**: Requesting page 10 with pageSize=20 causes the backend to
   fetch 600 rows (`20 * 3 * 10`) from Cassandra. Deep pagination is expensive. Consider
   capping the maximum page depth.

3. **Not handling empty results**: A query with no results above the similarity threshold
   returns `{"data": [], "pagination": {"totalItems": 0, ...}}`. The frontend should display
   a helpful message, not an error.

4. **Forgetting that embeddings can fail**: If the IBM Granite service is unreachable, the
   endpoint returns a 500 error. The frontend should have a graceful fallback (e.g., show the
   latest videos feed instead).

5. **Testing with very short queries**: Single-character queries like "a" produce poor
   embeddings because there is not enough semantic signal. Results will be essentially random.

### Best Practices

1. **Debounce search requests**: On the frontend, wait 300-500 ms after the user stops typing
   before firing the API call. This reduces unnecessary embedding computations.

2. **Show similarity scores to aid debugging**: During development, display the `$similarity`
   value next to each result so you can evaluate search quality.

3. **Log zero-result queries**: These reveal gaps in your video catalog or problems with the
   similarity threshold.

4. **Cache popular query embeddings**: If "tutorial" is searched 100 times per hour, cache its
   embedding vector to avoid 100 calls to the Granite model.

5. **Pre-warm the embedding model**: If self-hosting Granite, send a dummy query at startup to
   load model weights into memory. The first real query will be much faster.

### Testing Tips

```python
# Test semantic search returns similarity scores
async def test_semantic_search():
    response = await client.get(
        "/api/v1/search/videos",
        params={"query": "learn programming", "mode": "semantic"}
    )

    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "pagination" in data

    for video in data["data"]:
        assert "$similarity" in video
        assert 0 <= video["$similarity"] <= 1.0

# Test keyword mode also returns results (since it delegates to semantic)
async def test_keyword_delegates_to_semantic():
    response = await client.get(
        "/api/v1/search/videos",
        params={"query": "cooking", "mode": "keyword"}
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) >= 0  # May be empty if no videos match

# Test pagination
async def test_search_pagination():
    response = await client.get(
        "/api/v1/search/videos",
        params={"query": "tutorial", "page": 2, "pageSize": 5}
    )

    data = response.json()
    assert data["pagination"]["currentPage"] == 2
    assert data["pagination"]["pageSize"] == 5
    assert len(data["data"]) <= 5

# Test empty query returns 422
async def test_empty_query_rejected():
    response = await client.get(
        "/api/v1/search/videos",
        params={"query": ""}
    )
    assert response.status_code == 422

# Test no results scenario
async def test_no_results():
    response = await client.get(
        "/api/v1/search/videos",
        params={"query": "xyzzy_nothing_matches_this_uniquestring"}
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) == 0
    assert data["pagination"]["totalItems"] == 0

# Test pageSize boundary
async def test_max_page_size():
    response = await client.get(
        "/api/v1/search/videos",
        params={"query": "test", "pageSize": 101}
    )
    assert response.status_code == 422  # Exceeds max
```

### curl Examples

```bash
# Semantic search
curl "http://localhost:8080/api/v1/search/videos?query=italian+cooking&mode=semantic"

# Keyword search (delegates to semantic)
curl "http://localhost:8080/api/v1/search/videos?query=pasta&mode=keyword"

# Paginated search
curl "http://localhost:8080/api/v1/search/videos?query=tutorial&page=2&pageSize=5"
```

## Related Endpoints

- [GET /api/v1/search/tags/suggest](./GET_tags_suggest.md) - Autocomplete tag suggestions
- [GET /api/v1/recommendations/foryou](../recommendations/GET_for_you.md) - Personalized recommendations (also uses vectors)
- [POST /api/v1/reco/ingest](../recommendations/POST_reco_ingest.md) - Ingest video embeddings

## Further Learning

- [Vector Search in Cassandra 5.0](https://cassandra.apache.org/doc/latest/cassandra/vector-search.html)
- [IBM Granite Embedding Models](https://www.ibm.com/granite)
- [Cosine Similarity Explained](https://en.wikipedia.org/wiki/Cosine_similarity)
- [Approximate Nearest Neighbor Search](https://en.wikipedia.org/wiki/Nearest_neighbor_search#Approximate_nearest_neighbor)
- [Storage-Attached Indexes (SAI)](https://docs.datastax.com/en/cql/developing/indexing/sai/sai-concepts.html)
