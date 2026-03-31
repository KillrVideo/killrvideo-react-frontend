# GET /api/v1/videos/id/{video_id}/related - Get Related Videos

## Overview

This endpoint returns a list of videos related to a given video. It powers the "Up Next" and "Related Videos" sidebar that viewers see while watching a video, helping them discover more content.

**Why it exists**: Recommending related content is essential for user engagement. A viewer watching a Cassandra tutorial should see other database tutorials, not cooking videos. This endpoint provides that content-based recommendation.

**Current status**: The underlying recommendation engine is **stubbed out**. Instead of true content-based similarity, it returns the latest videos (excluding the source video) with random relevance scores. The endpoint contract is designed for a future vector similarity implementation.

## HTTP Details

- **Method**: GET
- **Path**: `/api/v1/videos/id/{video_id_path}/related`
- **Auth Required**: No (public endpoint)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/video_catalog.py`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `video_id_path` | UUID | Yes | The video to find related content for |

### Query Parameters

| Parameter | Type | Required | Default | Range | Description |
|-----------|------|----------|---------|-------|-------------|
| `limit` | integer | No | 5 | 1-20 | Max number of related videos to return |

### Example Request

```http
GET /api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890/related?limit=5
```

### Response Body

The response is a **flat array** (not wrapped in a `data` envelope):

```json
[
  {
    "videoId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "title": "Advanced Cassandra Data Modeling",
    "thumbnailUrl": "https://img.youtube.com/vi/xyz789/hqdefault.jpg",
    "score": 0.87
  },
  {
    "videoId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "title": "NoSQL Database Comparison",
    "thumbnailUrl": "https://img.youtube.com/vi/def456/hqdefault.jpg",
    "score": 0.72
  }
]
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `videoId` | UUID | The related video's identifier |
| `title` | string | Video title |
| `thumbnailUrl` | string or null | Thumbnail image URL |
| `score` | number or null | Relevance score (0.0 to 1.0, where 1.0 = most relevant) |

### Error Responses

| Status | Condition |
|--------|-----------|
| 422 | Invalid UUID format or limit out of range |

## Cassandra Concepts Explained

### What is Vector Similarity Search?

Vector similarity search finds items that are "semantically close" to a reference item. Here is how it works at a high level:

1. **Embedding**: Convert each video's metadata (title, description, tags) into a numerical vector -- an array of hundreds of floating-point numbers
2. **Storage**: Store these vectors in Cassandra alongside the video data
3. **Query**: Given a source video's vector, find the N closest vectors in the database

**Analogy**: Imagine every video is a point on a map. Videos about similar topics cluster together. "Related videos" means finding the nearest neighbors on this map.

```
                    ┌─ "Python Tutorial"
    Coding ────────┤
                    └─ "Learn to Code"
                                            ← close together (related)
                    ┌─ "Java for Beginners"
    Programming ───┤
                    └─ "Spring Boot Guide"

                                            ← far apart (unrelated)
                    ┌─ "Best Pizza Recipe"
    Cooking ───────┤
                    └─ "Italian Cuisine"
```

### The `vector` Column Type

Cassandra 5.0 introduced a native `vector<float, N>` data type:

```cql
content_features vector<float, 384>  -- 384-dimensional embedding vector
```

This stores 384 floating-point numbers per row. The dimensionality (384) must match the embedding model. KillrVideo uses a 384-dimensional model (common for sentence-transformer models).

### Approximate Nearest Neighbor (ANN) Search

Finding the exact nearest neighbors in high-dimensional space is computationally expensive. Cassandra uses **ANN (Approximate Nearest Neighbor)** search, which trades a small amount of accuracy for dramatically better performance.

**How ANN works in Cassandra**:
- Cassandra builds an index structure (similar to HNSW) over the vectors
- At query time, it navigates this index to find approximately the closest vectors
- Results are 95-99% accurate compared to exact search, but 100x faster

### Current Implementation: Stub

The current backend does **not** use vector search. Instead:

```
Current:  SELECT latest videos → assign random scores → return
Future:   SELECT videos ORDER BY content_features ANN OF [source_vector] → return
```

This stub approach lets the frontend be built and tested while the recommendation engine is developed separately.

## Data Model

### Table: `videos` (used by both current stub and future implementation)

```cql
CREATE TABLE killrvideo.videos (
    videoid uuid PRIMARY KEY,           -- Partition key: unique video identifier
    added_date timestamp,               -- When the video was submitted
    description text,                   -- Video description
    location text,                      -- YouTube URL
    location_type int,                  -- 0 = YouTube
    name text,                          -- Video title
    preview_image_location text,        -- Thumbnail URL
    tags set<text>,                     -- Tags for categorization
    content_features vector<float, 384>,-- Embedding for similarity search
    userid uuid,                        -- Uploader's user ID
    views int,                          -- View count
    youtube_id text                     -- YouTube video ID
);

-- ANN index for vector similarity (future use)
CREATE CUSTOM INDEX videos_content_features_idx
ON killrvideo.videos(content_features)
USING 'StorageAttachedIndex';
```

**Key Characteristics**:
- **Partition Key**: `videoid` (UUID)
- **Vector Column**: `content_features` stores 384-dimensional embeddings
- **ANN Index**: Enables efficient approximate nearest neighbor queries

## Database Queries

### Current Implementation (Stubbed)

**Service Function**: `recommendation_service.get_related_videos()`

```python
async def get_related_videos(video_id: UUID, limit: int = 5):
    table = await get_table("videos")

    # Fetch latest videos (excluding the source video)
    results = await table.find(
        filter={},
        sort={"added_date": -1},
        limit=limit + 1  # Fetch one extra in case source is included
    )

    # Filter out the source video
    related = [v for v in results if v["videoid"] != str(video_id)][:limit]

    # Assign random relevance scores (stub)
    import random
    for video in related:
        video["score"] = round(random.uniform(0.5, 1.0), 2)

    return related
```

**Equivalent CQL** (current stub):
```cql
-- Step 1: Fetch latest videos
SELECT videoid, name, preview_image_location
FROM killrvideo.videos
ORDER BY added_date DESC
LIMIT 6;

-- Step 2: Application-side filtering removes the source video
-- Step 3: Application-side random score assignment
```

**Performance**: **O(N nodes)** -- Full table scan sorted by added_date, same as the latest videos endpoint.

### Future Implementation (Vector Similarity)

```python
async def get_related_videos_vector(video_id: UUID, limit: int = 5):
    table = await get_table("videos")

    # Step 1: Get the source video's embedding
    source = await table.find_one(filter={"videoid": str(video_id)})
    source_vector = source["content_features"]

    # Step 2: Find nearest neighbors by vector similarity
    results = await table.find(
        sort={"$vector": source_vector},  # ANN search
        limit=limit + 1,
        projection={"videoid": 1, "name": 1, "preview_image_location": 1, "$similarity": 1}
    )

    # Filter out the source video itself
    related = [v for v in results if v["videoid"] != str(video_id)][:limit]
    return related
```

**Equivalent CQL** (future):
```cql
-- Step 1: Get source video's vector
SELECT content_features FROM killrvideo.videos
WHERE videoid = a1b2c3d4-e5f6-7890-abcd-ef1234567890;

-- Step 2: ANN search for nearest neighbors
SELECT videoid, name, preview_image_location,
       similarity_cosine(content_features, [0.23, 0.87, ...]) AS score
FROM killrvideo.videos
ORDER BY content_features ANN OF [0.23, 0.87, -0.45, ..., 0.12]
LIMIT 6;
```

**Performance**: **< 50ms** -- ANN search is optimized for low-latency retrieval even with millions of vectors.

## Implementation Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. Client sends GET /videos/id/{video_id}/related       │
│    ?limit=5                                             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. FastAPI Endpoint                                      │
│    ├─ Validates UUID and limit parameter                │
│    └─ Calls recommendation_service.get_related_videos() │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Current: Fetch Latest Videos (Stub)                   │
│    ├─ Query videos table sorted by added_date DESC      │
│    ├─ Exclude the source video from results             │
│    └─ Assign random scores (0.5 - 1.0)                 │
│                                                         │
│    Future: Vector Similarity Search                      │
│    ├─ Fetch source video's content_features vector      │
│    ├─ ANN query: ORDER BY content_features ANN OF [...]  │
│    └─ Score = cosine similarity (0.0 - 1.0)             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Transform to RecommendationItem format                │
│    { videoId, title, thumbnailUrl, score }              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Return 200 OK                                         │
│    [ {videoId, title, thumbnailUrl, score}, ... ]       │
└─────────────────────────────────────────────────────────┘
```

## Special Notes

### 1. Response Is a Flat Array

Unlike most paginated endpoints that return `{ data: [...], pagination: {...} }`, this endpoint returns a **plain JSON array**. There is no pagination metadata because:

- The result set is small (max 20 items)
- Recommendations are not pageable -- you want the "top N" most relevant

### 2. Random Scores Change on Every Request

Since the current implementation assigns random scores, the same request will return **different score values** each time. The frontend should not rely on score stability for caching or comparison.

### 3. Source Video Exclusion

The endpoint automatically excludes the source video from results. If you request related videos for video A, video A will never appear in the response. The backend fetches `limit + 1` results and filters out the source.

### 4. Embedding Generation (Future)

When vector search is implemented, embeddings will be generated at video submission time:

```python
# At video upload (future)
embedding = nvidia_embedding_model.encode(
    f"{video.name} {video.description} {' '.join(video.tags)}"
)
# Stored in content_features column
```

The embedding model (384-dimensional) captures semantic meaning of the video's text metadata. Videos with similar content will have vectors that point in similar directions.

### 5. Cold Start Problem

New videos have no interaction data, and the stub implementation has no concept of "similarity." The future vector-based approach handles cold starts better because it uses content metadata (title, description, tags) rather than user interaction history.

### 6. Astra DB Vector Search Limits

Astra DB supports ANN search natively but has some constraints:
- Maximum vector dimensionality: varies by plan (384 is well within limits)
- ANN results are approximate -- results may vary slightly between identical queries
- Vector indexes consume additional storage (roughly 2x the vector data size)

## Developer Tips

### Common Pitfalls

1. **Expecting stable scores**: The stub returns random scores. Do not cache or sort by score on the client side expecting consistency.

2. **Assuming pagination**: This endpoint has no pagination. If you need more than 20 related videos (the max `limit`), you need a different approach.

3. **Missing source video in results**: If you see the source video in the response, there is a bug in the exclusion logic. Report it.

4. **Null thumbnailUrl**: Some videos may have a null thumbnail. Always handle this in the UI with a placeholder image.

5. **Null score**: The score field is nullable. When implementing UI, treat null scores as "relevance unknown" rather than 0.

### Best Practices

1. **Use a small limit**: 5-8 related videos is typical for a sidebar. Requesting 20 wastes bandwidth.

2. **Cache with SHORT stale time**: Since scores are random (for now), use a short cache duration (30 seconds) so the UI does not show stale random values for too long.

3. **Lazy load the sidebar**: Related videos are secondary content. Load them after the main video details to avoid blocking the primary view.

4. **Show scores only when meaningful**: In the current stub, scores are random and meaningless. Consider hiding scores until vector search is implemented.

5. **Handle empty arrays**: If the platform has very few videos, the related list may be empty. Show a "No related videos" fallback.

### Query Performance Expectations

| Implementation | Latency | Notes |
|----------------|---------|-------|
| Current stub (latest videos) | **< 20ms** | Simple sorted query |
| Future vector ANN search | **< 50ms** | ANN index lookup |
| Future without ANN index | **500ms+** | Full table scan (avoid) |

### Testing Tips

```bash
# Get 5 related videos (default limit)
curl -s "http://localhost:8080/api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890/related" | jq

# Get 10 related videos
curl -s "http://localhost:8080/api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890/related?limit=10" | jq

# Verify source video is excluded
VIDEO_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
curl -s "http://localhost:8080/api/v1/videos/id/$VIDEO_ID/related" | jq ".[].videoId" | grep -c "$VIDEO_ID"
# Should output: 0

# Test with max limit
curl -s "http://localhost:8080/api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890/related?limit=20" | jq length
```

## Related Endpoints

- [GET /api/v1/videos/id/{video_id}](./GET_video_by_id.md) - Get the source video's full details
- [GET /api/v1/videos/latest](./GET_videos_latest.md) - The data source for the current stub
- [GET /api/v1/search/videos](../search/GET_search_videos.md) - Semantic search uses similar vector technology

## Further Learning

- [Cassandra Vector Search](https://cassandra.apache.org/doc/latest/cassandra/vector-search.html)
- [ANN (Approximate Nearest Neighbor)](https://en.wikipedia.org/wiki/Nearest_neighbor_search#Approximate_nearest_neighbor)
- [Sentence Transformers](https://www.sbert.net/) - Common embedding models
- [Cosine Similarity Explained](https://en.wikipedia.org/wiki/Cosine_similarity)
