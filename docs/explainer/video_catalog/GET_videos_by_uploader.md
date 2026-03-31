# GET /api/v1/videos/by-uploader/{user_id} - Get Videos by Uploader

## Overview

This endpoint retrieves all videos uploaded by a specific user. It powers the "creator profile" and "my videos" sections of the UI, allowing users to browse a creator's video library.

**Why it exists**: In a video platform, viewers want to discover more content from creators they enjoy. Creators need to manage their own video library. This endpoint serves both needs by returning a paginated list of videos filtered by the uploader's user ID.

**Real-world analogy**: Think of it like browsing a specific shelf in a library -- instead of searching the entire catalog, you go directly to the section for a particular author and see everything they have published.

## HTTP Details

- **Method**: GET
- **Path**: `/api/v1/videos/by-uploader/{uploader_id_path}`
- **Auth Required**: No (public endpoint)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/video_catalog.py`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uploader_id_path` | UUID | Yes | The user ID of the uploader |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | integer | No | 1 | Page number (min 1) |
| `pageSize` | integer | No | 10 | Items per page (1-100) |

### Example Request

```http
GET /api/v1/videos/by-uploader/550e8400-e29b-41d4-a716-446655440000?page=1&pageSize=10
```

### Response Body

```json
{
  "data": [
    {
      "videoid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Introduction to Apache Cassandra",
      "description": "Learn the basics of Cassandra data modeling",
      "preview_image_location": "https://img.youtube.com/vi/abc123/hqdefault.jpg",
      "userid": "550e8400-e29b-41d4-a716-446655440000",
      "added_date": "2025-10-15T14:30:00Z",
      "tags": ["cassandra", "database", "tutorial"],
      "views": 1234,
      "youtube_id": "abc123"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 10,
    "totalItems": 23,
    "totalPages": 3
  }
}
```

### Error Responses

| Status | Condition |
|--------|-----------|
| 422 | Invalid UUID format or invalid pagination params |

## Cassandra Concepts Explained

### What is a Storage-Attached Index (SAI)?

In traditional relational databases, you can filter on any column with a WHERE clause. In Cassandra, you can only query efficiently by the **partition key** by default. To query by other columns, you need an index.

**SAI (Storage-Attached Index)** is Cassandra 5.0's modern indexing solution:

- **Old secondary indexes**: Maintained a separate hidden table, causing scatter-gather queries across all nodes
- **SAI**: Built directly into the SSTable storage engine, so each node only searches its own local data

**Analogy**: Imagine a library where books are organized by ISBN (partition key). Without an index, finding all books by a specific author means checking every shelf. With SAI, it is like each shelf has a small card that lists "books by Author X on this shelf" -- you still check every shelf's card, but each lookup is fast.

### Filtering vs. Partition Key Lookups

This endpoint uses a **filter on the `userid` column** rather than a direct partition key lookup:

| Query Type | How It Works | Speed |
|------------|-------------|-------|
| **Partition key** (`WHERE videoid = ?`) | Go directly to one node | O(1) |
| **SAI filter** (`WHERE userid = ?`) | Check index on each node, merge results | O(N nodes) |

SAI filtering is slower than partition key access but much faster than a full table scan. For a typical KillrVideo deployment, this still completes in single-digit milliseconds.

### Why Not a Separate Table?

The traditional Cassandra approach would be to create a denormalized table like:

```cql
CREATE TABLE videos_by_user (
    userid uuid,
    added_date timestamp,
    videoid uuid,
    name text,
    PRIMARY KEY (userid, added_date)
);
```

With SAI, we **avoid this duplication**:
- One `videos` table serves all query patterns
- No risk of data getting out of sync between tables
- Less storage overhead
- Simpler application code (no dual writes)

**Trade-off**: SAI queries are slightly slower than partition key lookups on a dedicated table, but the simplicity wins for most use cases.

## Data Model

### Table: `videos`

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
    content_features vector<float, 384>,-- Embedding vector for semantic search
    userid uuid,                        -- Uploader's user ID (SAI indexed)
    views int,                          -- View count
    youtube_id text                     -- YouTube video ID
);

-- SAI index that enables this endpoint
CREATE CUSTOM INDEX videos_userid_idx
ON killrvideo.videos(userid)
USING 'StorageAttachedIndex';
```

**Key Characteristics**:
- **Partition Key**: `videoid` (UUID) -- each video is its own partition
- **SAI on userid**: Enables efficient filtering by uploader without a denormalized table
- **Data Type**: `set<text>` for tags allows multiple tags per video with automatic deduplication

## Database Queries

### 1. Filter Videos by User ID

**Service Function**: `video_service.list_videos_by_user()`

```python
async def list_videos_by_user(user_id: UUID, page: int, page_size: int):
    table = await get_table("videos")

    # Use SAI index to filter by userid
    results = await table.find(
        filter={"userid": str(user_id)},
        sort={"added_date": -1},  # Newest first
        skip=(page - 1) * page_size,
        limit=page_size
    )

    return results
```

**Equivalent CQL**:
```cql
SELECT videoid, name, description, preview_image_location,
       userid, added_date, tags, views, youtube_id
FROM killrvideo.videos
WHERE userid = 550e8400-e29b-41d4-a716-446655440000
ORDER BY added_date DESC
LIMIT 10;
```

**Performance**: **O(N nodes)** -- SAI queries each node's local index, then merges results. For small to medium datasets (thousands of videos per user), this completes in **5-20ms**.

**Why this works**:
- The SAI index on `userid` allows Cassandra to efficiently locate rows matching the filter
- Each node checks its local index (no cross-node coordination during the index scan)
- The coordinator node merges partial results and applies pagination

### 2. Count Total Videos (for pagination)

```python
# The Data API handles count as part of the paginated response
total_count = await table.count_documents(
    filter={"userid": str(user_id)}
)
```

**Equivalent CQL**:
```cql
SELECT COUNT(*) FROM killrvideo.videos
WHERE userid = 550e8400-e29b-41d4-a716-446655440000;
```

**Performance**: Same O(N nodes) SAI scan, but only counting rows.

## Implementation Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. Client sends GET /api/v1/videos/by-uploader/{id}     │
│    ?page=1&pageSize=10                                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. FastAPI Endpoint                                      │
│    ├─ Validates UUID format (422 if invalid)            │
│    ├─ Validates pagination params                       │
│    └─ Calls video_service.list_videos_by_user()         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Query Videos Table via SAI                            │
│    Filter: {"userid": "<user_id>"}                      │
│    ├─ Coordinator sends query to all nodes              │
│    ├─ Each node checks local SAI index                  │
│    └─ Results merged, sorted by added_date DESC         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Apply Pagination                                      │
│    ├─ Skip: (page - 1) * pageSize                       │
│    ├─ Limit: pageSize                                   │
│    └─ Count total matching rows for pagination metadata │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Return 200 OK                                         │
│    { data: [...videos], pagination: {...} }             │
└─────────────────────────────────────────────────────────┘
```

**Code Flow**:
1. **Endpoint** receives the uploader UUID and pagination params
2. **Validation** ensures the UUID is well-formed and page/pageSize are in range
3. **SAI Query** filters the `videos` table by `userid`
4. **Pagination** is applied server-side via skip/limit
5. **Response** includes both the video array and pagination metadata

## Special Notes

### 1. SAI Index Must Exist

If the SAI index on `userid` does not exist, this query will **fail** with an error like:

```
Cannot execute this query as it might involve data filtering and thus may have
unpredictable performance. If you want to execute this query despite the
performance unpredictability, use ALLOW FILTERING.
```

The backend relies on the index being created during schema setup. Always verify indexes exist when deploying.

### 2. Astra Data API Filter Syntax

The Astra Data API uses a MongoDB-like filter syntax, not raw CQL:

```python
# Data API syntax (what the backend uses)
filter={"userid": str(user_id)}

# This translates internally to:
# SELECT * FROM videos WHERE userid = ? (using SAI)
```

UUIDs must be passed as strings to the Data API -- the backend handles the conversion.

### 3. No Existence Check on User ID

This endpoint does **not** verify that the `user_id` belongs to an existing user. If you pass a valid UUID that does not correspond to any user:

- The query still executes (no error)
- Returns an empty `data` array with `totalItems: 0`
- This is intentional -- checking user existence would add an extra round-trip

### 4. Sorting Considerations

SAI supports basic sorting, but complex multi-column sorts may fall back to in-memory sorting on the coordinator. For this endpoint, sorting by `added_date DESC` (newest first) is efficient because it is a simple single-column sort.

### 5. Large Creator Libraries

If a creator has thousands of videos, SAI pagination with `skip` becomes less efficient for deep pages (e.g., page 100). The Data API handles this transparently, but performance degrades for very large offsets.

**Mitigation**: The UI typically shows only the first few pages. For programmatic access, consider cursor-based pagination in future API versions.

## Developer Tips

### Common Pitfalls

1. **Forgetting the SAI index**: Without `videos_userid_idx`, this query cannot execute. If you see "ALLOW FILTERING" errors during development, the index is missing.

2. **UUID format mismatch**: The path parameter must be a valid UUID. Passing a non-UUID string (e.g., "john") returns a 422 validation error, not a 404.

3. **Expecting ordered results without sort**: SAI does not guarantee result order. Always specify a sort parameter if order matters.

4. **Confusing `videoid` and `userid`**: The partition key is `videoid`, but this endpoint filters by `userid`. These are different UUIDs serving different purposes.

5. **Large pageSize values**: While the API allows up to 100, requesting large pages with SAI filtering is slower than small pages. Stick to 10-20 for UI use cases.

### Best Practices

1. **Cache aggressively on the client**: A creator's video list changes infrequently. Use React Query with a MEDIUM stale time (5 minutes).

2. **Prefetch on hover**: When a user hovers over a creator's name, prefetch their video list for instant navigation.

3. **Show loading skeletons**: SAI queries take slightly longer than partition key lookups. Use skeleton UI for a better perceived performance.

4. **Handle empty states gracefully**: New creators have zero videos. Display a friendly "No videos yet" message rather than a blank page.

### Query Performance Expectations

| Scenario | Latency | Notes |
|----------|---------|-------|
| Creator with 5 videos | **< 10ms** | Minimal data to scan |
| Creator with 100 videos, page 1 | **< 20ms** | SAI is efficient |
| Creator with 100 videos, page 10 | **< 30ms** | Skip-based pagination overhead |
| Creator with 1000+ videos, page 50 | **50-100ms** | Deep pagination degrades |

### Testing Tips

```bash
# Fetch videos by uploader
curl -s "http://localhost:8080/api/v1/videos/by-uploader/550e8400-e29b-41d4-a716-446655440000?page=1&pageSize=5" | jq

# Test with non-existent user (should return empty data array)
curl -s "http://localhost:8080/api/v1/videos/by-uploader/00000000-0000-0000-0000-000000000000" | jq

# Test invalid UUID (should return 422)
curl -s "http://localhost:8080/api/v1/videos/by-uploader/not-a-uuid"

# Test pagination boundary
curl -s "http://localhost:8080/api/v1/videos/by-uploader/550e8400-e29b-41d4-a716-446655440000?page=999&pageSize=10" | jq
```

## Related Endpoints

- [GET /api/v1/videos/id/{video_id}](./GET_video_by_id.md) - Get full details for a specific video
- [POST /api/v1/videos](./POST_videos.md) - Submit a new video (creates records this endpoint returns)
- [GET /api/v1/videos/latest](./GET_videos_latest.md) - Latest videos across all uploaders
