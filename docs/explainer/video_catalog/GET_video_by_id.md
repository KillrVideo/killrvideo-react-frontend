# GET /api/v1/videos/id/{video_id} -- Get Full Video Details

## 1. Overview

This endpoint retrieves the complete metadata for a single video by its unique identifier.
It is the most fundamental read operation in the Video Catalog -- every time a user clicks
on a video to watch it, the frontend calls this endpoint to load the title, description,
thumbnail, tags, embed URL, and all other attributes.

**Why it exists:** The Watch page needs every detail about a video: the YouTube embed URL
for the player, the title and description for display, tags for navigation, the uploader's
user ID for attribution, ratings, view counts, and more. This endpoint delivers all of
that in a single call.

**Who can call it:** Everyone. This is a **public endpoint** -- no authentication required.
Both anonymous visitors and logged-in users can fetch video details.

---

## 2. HTTP Details

| Property        | Value                                          |
|-----------------|------------------------------------------------|
| **Method**      | `GET`                                          |
| **Path**        | `/api/v1/videos/id/{video_id_path}`            |
| **Auth**        | None (public)                                  |
| **Success Code**| `200 OK`                                       |

### Path Parameters

| Parameter       | Type   | Required | Description              |
|-----------------|--------|----------|--------------------------|
| `video_id_path` | UUID   | Yes      | The video's unique ID    |

### Response Body (`VideoDetailResponse`)

```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "title": "Introduction to Apache Cassandra",
  "description": "Learn the fundamentals of Cassandra data modeling...",
  "tags": ["cassandra", "database", "nosql"],
  "submittedAt": "2026-03-15T10:00:00Z",
  "thumbnailUrl": "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  "location": "https://www.youtube.com/watch?v=abc123",
  "location_type": 1,
  "content_features": [0.0234, -0.1567, 0.8921, ...],
  "content_rating": "G",
  "category": "Education",
  "language": "en",
  "youtubeVideoId": "abc123",
  "updatedAt": "2026-03-16T08:00:00Z",
  "status": "READY",
  "views": 1542,
  "averageRating": 4.3,
  "totalRatingsCount": 27,
  "is_deleted": false,
  "deleted_at": null
}
```

### Key Response Fields

| Field               | Type           | Notes                                          |
|---------------------|----------------|-------------------------------------------------|
| `videoId`           | UUID           | Same as the path parameter                      |
| `title`             | string         | 3-100 characters                                |
| `description`       | string or null | Up to 2000 characters                           |
| `tags`              | string[]       | Array of tag strings                            |
| `thumbnailUrl`      | URI or null    | YouTube thumbnail URL                           |
| `location`          | string         | Full YouTube URL for embedding                  |
| `location_type`     | integer        | 1 = YouTube                                     |
| `content_features`  | float[] or null| 384-dim embedding vector (may be null if pending)|
| `youtubeVideoId`    | string or null | Extracted YouTube video ID                      |
| `status`            | enum           | PENDING, PROCESSING, READY, or ERROR            |
| `views`             | integer        | Total view count                                |
| `averageRating`     | float or null  | Average of all ratings (1-5 scale)              |
| `totalRatingsCount` | integer        | Number of ratings submitted                     |

### Error Responses

| Status | Condition                              |
|--------|----------------------------------------|
| `404`  | Video does not exist                   |
| `422`  | Invalid UUID format in path            |

### Example cURL

```bash
curl https://localhost:8443/api/v1/videos/id/550e8400-e29b-41d4-a716-446655440000
```

---

## 3. Cassandra Concepts Explained

### Partition Key Lookup -- O(1) Reads

This endpoint demonstrates one of Cassandra's greatest strengths: **constant-time reads
by primary key**. When you look up a video by its `videoid`, Cassandra does not scan a
table or walk an index tree. Instead, it uses the partition key (`videoid`) to compute
a **hash**, which maps directly to the node(s) storing that data.

**Analogy:** Think of a massive warehouse with 1 million lockers. Each locker has a
combination lock, and the combination is derived from the locker's ID number using a
mathematical formula. To find locker #550e8400, you do not walk down every aisle checking
labels. You plug the ID into the formula, get "Aisle 7, Row 3, Position 12," and walk
straight there. That is how Cassandra's consistent hashing works.

**Why this matters:** Whether your `videos` table has 100 rows or 100 million rows, a
lookup by `videoid` takes roughly the same amount of time. This is **O(1)** complexity
-- constant time regardless of data size.

### How Consistent Hashing Works

1. The partition key (`videoid`) is passed through a hash function (Murmur3)
2. The hash maps to a position on a "token ring" (a conceptual circle of integers)
3. Each Cassandra node owns a range of the ring
4. The node responsible for that hash range stores (and serves) the data
5. Replicas are stored on the next N-1 nodes clockwise on the ring

```
         Token Ring
        ┌─────────┐
    Node A         Node B
   (tokens         (tokens
    0-333)         334-666)
        └─────────┘
              │
           Node C
          (tokens
           667-999)

  hash("550e8400...") = 451  -->  Node B owns this partition
```

### Single-Partition Read

Because `videoid` is the **sole** partition key (no clustering columns needed for this
query), the read touches exactly one partition on one node. In Cassandra terminology,
this is a "single-partition query" -- the most efficient type of read operation.

---

## 4. Data Model

### Table: `videos`

```sql
CREATE TABLE killrvideo.videos (
    videoid uuid PRIMARY KEY,
    added_date timestamp,
    description text,
    location text,
    location_type int,
    name text,
    preview_image_location text,
    tags set<text>,
    content_features vector<float, 384>,
    userid uuid,
    content_rating text,
    category text,
    language text,
    views int,
    youtube_id text
);
```

**Partition key:** `videoid` (UUID)

**Why a simple primary key?** This table is optimized for the most common query: "give me
all details for video X." With a single UUID as the primary key, every video is its own
partition. There are no clustering columns because we never need to query for multiple
rows within a video's partition -- one video = one row.

### SAI Indexes

The `videos` table also has Storage Attached Indexes (SAI) on several columns:

```sql
CREATE CUSTOM INDEX ON killrvideo.videos (name) USING 'StorageAttachedIndex';
CREATE CUSTOM INDEX ON killrvideo.videos (tags) USING 'StorageAttachedIndex';
CREATE CUSTOM INDEX ON killrvideo.videos (userid) USING 'StorageAttachedIndex';
CREATE CUSTOM INDEX ON killrvideo.videos (added_date) USING 'StorageAttachedIndex';
CREATE CUSTOM INDEX ON killrvideo.videos (content_rating) USING 'StorageAttachedIndex';
CREATE CUSTOM INDEX ON killrvideo.videos (category) USING 'StorageAttachedIndex';
CREATE CUSTOM INDEX ON killrvideo.videos (language) USING 'StorageAttachedIndex';
CREATE CUSTOM INDEX ON killrvideo.videos (content_features)
    USING 'StorageAttachedIndex'
    WITH OPTIONS = {'similarity_function': 'COSINE'};
```

These indexes are **not used** by this endpoint (it reads by primary key), but they
support other endpoints like search-by-tag and latest-videos.

---

## 5. Database Queries

### Backend Function: `video_service.get_video_by_id()`

```python
def get_video_by_id(video_id: UUID) -> VideoDetailResponse:
    # Single-document lookup by primary key
    doc = videos_collection.find_one({"videoid": str(video_id)})

    if doc is None:
        raise HTTPException(status_code=404, detail="Video not found")

    # Backfill youtube_id from the location URL if missing
    if doc.get("youtube_id") is None and doc.get("location"):
        doc["youtube_id"] = extract_youtube_id(doc["location"])

    return VideoDetailResponse(**doc)
```

### Equivalent CQL

```sql
SELECT videoid, added_date, description, location, location_type,
       name, preview_image_location, tags, content_features,
       userid, content_rating, category, language, views, youtube_id
FROM killrvideo.videos
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
```

This is the simplest possible Cassandra query: a single-partition, single-row read.

### What Happens Under the Hood

1. **Client** sends the query to a **coordinator node** (any node in the cluster)
2. **Coordinator** hashes the `videoid` to find the **owning node**
3. **Owning node** reads the row from its local storage (memtable or SSTable)
4. **Response** flows back: owning node -> coordinator -> client

With a replication factor of 3, the coordinator can read from any of the 3 replicas.
At consistency level `LOCAL_ONE` (typical for reads), it picks the closest replica.

### Performance Characteristics

| Metric              | Value                          |
|---------------------|--------------------------------|
| **Partitions read** | 1                              |
| **Rows returned**   | 1                              |
| **Complexity**      | O(1)                           |
| **Typical latency** | 1-5ms (local DC)               |
| **Scales with**     | Nothing -- constant regardless of table size |

### YouTube ID Backfill

The backend includes a defensive check: if `youtube_id` is null (possibly from older
records inserted before that column was added), it extracts the ID from the `location`
URL. This is done in application code, not in the database query. It is a read-time
migration pattern -- older data is "fixed up" on access rather than requiring a batch
migration.

---

## 6. Implementation Flow

```
    Client (React)                    Backend (FastAPI)                  Cassandra
    ──────────────                    ─────────────────                  ─────────
         │                                  │                               │
         │  GET /api/v1/videos/id/{uuid}    │                               │
         │─────────────────────────────────>│                               │
         │                                  │                               │
         │                                  │  1. Parse + validate UUID     │
         │                                  │                               │
         │                                  │  2. find_one({videoid: uuid}) │
         │                                  │─────────────────────────────>│
         │                                  │                               │
         │                                  │  3. Row returned (or null)    │
         │                                  │<─────────────────────────────│
         │                                  │                               │
         │                                  │  4. If null -> 404            │
         │                                  │  5. Backfill youtube_id       │
         │                                  │     if missing                │
         │                                  │  6. Map to response model     │
         │                                  │                               │
         │  200 OK                          │                               │
         │  { videoId, title, ... }         │                               │
         │<─────────────────────────────────│                               │
```

---

## 7. Special Notes

### Astra DB / DataStax Specifics

- The Data API `find_one()` call translates to a CQL `SELECT ... WHERE videoid = ?`
  with `LIMIT 1` and consistency level `LOCAL_ONE`.
- The `content_features` vector column is returned as a JSON array of floats. This array
  has 384 elements and adds approximately 3 KB to the response. The frontend does not
  use this field for display -- it exists for the related-videos recommendation engine.
- In Astra DB, single-partition reads are routed to the nearest replica automatically
  thanks to token-aware load balancing.

### Caching Strategy

The frontend uses React Query with a `MEDIUM` stale time (defined in `src/lib/constants.ts`).
Video metadata changes infrequently, so caching for a few minutes is safe. The React Query
cache key is typically `['video', videoId]`.

```typescript
// From src/hooks/useApi.ts (simplified)
export function useVideo(videoId: string) {
  return useQuery({
    queryKey: ['video', videoId],
    queryFn: () => api.getVideoById(videoId),
    staleTime: STALE_TIMES.MEDIUM,
  });
}
```

### Security Notes

- This is a public endpoint, so no sensitive data should be stored in the `videos` table.
- The `userid` field reveals who uploaded the video (by design -- this is shown on the Watch page).
- The `content_features` vector does not contain personally identifiable information;
  it is a numerical representation of the video's content.

### Soft Deletes

The response includes `is_deleted` and `deleted_at` fields. When a moderator deletes a
video, these fields are set but the row is not physically removed. The backend should
filter out soft-deleted videos from this response (returning 404), but the fields exist
for audit purposes.

---

## 8. Developer Tips

### Common Pitfalls

1. **Assuming the video is playable.** Always check the `status` field. If it is `PENDING`
   or `PROCESSING`, the video is not ready for playback. Only show the player when
   `status === "READY"`.

2. **Using the wrong ID format.** The path parameter must be a valid UUID string
   (e.g., `550e8400-e29b-41d4-a716-446655440000`). Passing an integer or malformed
   string will return a 422.

3. **Ignoring `content_features` size.** The embedding vector adds ~3 KB to every
   response. If you are building a list view and do not need embeddings, use the
   `/videos/latest` or `/videos/by-tag` endpoints instead -- they return `VideoSummary`
   objects without the vector.

4. **Not handling 404.** Videos can be deleted or may have never existed. Always handle
   the 404 case gracefully in the UI.

### Frontend Integration Pattern

```typescript
// From src/lib/api.ts
async getVideoById(videoId: string): Promise<VideoDetailResponse> {
  return this.get(`/videos/id/${videoId}`);
}
```

The Watch page (`src/pages/Watch.tsx`) calls this on mount:

```typescript
const { videoId } = useParams();
const { data: video, isLoading, error } = useVideo(videoId);
```

### Testing Tips

- **Happy path:** Submit a video, wait for READY status, then fetch by ID. Verify all
  fields match what was submitted.
- **404 case:** Request a random UUID that does not exist. Verify you get a 404 with a
  meaningful error message.
- **Deleted video:** If soft-delete is implemented, delete a video and confirm that
  fetching by ID returns 404.
- **Performance:** Time the response for a known video ID. It should consistently be
  under 10ms for a healthy cluster.

### Debugging Queries

If this endpoint is slow, the first thing to check is whether the query is hitting the
partition key. In `cqlsh`, you can trace a query:

```sql
TRACING ON;
SELECT * FROM killrvideo.videos
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
```

The trace output will show which nodes were contacted and how long each step took. A
healthy single-partition read should complete in under 1ms of Cassandra-side processing.
