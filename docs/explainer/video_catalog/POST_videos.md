# POST /api/v1/videos -- Submit YouTube URL for Async Processing

## 1. Overview

This endpoint is the entry point for adding new video content to KillrVideo. A creator
or moderator submits a YouTube URL, and the backend kicks off an **asynchronous pipeline**
that fetches metadata from YouTube, generates an AI embedding vector, and writes the
video record to Cassandra. The caller receives an immediate `202 Accepted` response
with a preliminary video record -- the video is not yet playable but has been queued
for processing.

**Why it exists:** Video ingestion is inherently slow. Fetching YouTube metadata,
generating a 384-dimensional embedding vector via IBM Granite, and writing to multiple
Cassandra tables can take several seconds. Rather than making the user wait, the API
accepts the request immediately and processes it in the background. The frontend can
poll the `/status` endpoint to know when processing completes.

**Who can call it:** Only authenticated users with the `creator` or `moderator` role.
Regular viewers cannot submit videos.

---

## 2. HTTP Details

| Property        | Value                                    |
|-----------------|------------------------------------------|
| **Method**      | `POST`                                   |
| **Path**        | `/api/v1/videos`                         |
| **Auth**        | Bearer JWT (creator or moderator role)   |
| **Content-Type**| `application/json`                       |
| **Success Code**| `202 Accepted`                           |

### Request Body (`VideoSubmitRequest`)

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "Optional pre-filled title from preview step"
}
```

| Field        | Type     | Required | Constraints            | Notes                                          |
|-------------|----------|----------|------------------------|-------------------------------------------------|
| `youtubeUrl` | string   | Yes      | URI format, 1-2083 chars | Must be a valid YouTube URL                    |
| `title`      | string   | No       | 1-150 chars            | If omitted, the backend fetches it from YouTube |

The `title` field is optional because the frontend typically calls the `/api/v1/videos/preview`
endpoint first to look up the YouTube title. If the user already has the title, passing it
here avoids a redundant YouTube API call on the backend.

### Response Body (`VideoDetailResponse`)

```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "title": "Never Gonna Give You Up",
  "description": null,
  "tags": [],
  "submittedAt": "2026-03-19T14:30:00Z",
  "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "location": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "location_type": 1,
  "content_features": null,
  "content_rating": null,
  "category": null,
  "language": null,
  "youtubeVideoId": "dQw4w9WgXcQ",
  "updatedAt": null,
  "status": "PENDING",
  "views": 0,
  "averageRating": null,
  "totalRatingsCount": 0,
  "is_deleted": false,
  "deleted_at": null
}
```

Note that `status` starts as `"PENDING"` and `content_features` is `null` -- the embedding
has not been generated yet.

### Error Responses

| Status | Condition                          |
|--------|------------------------------------|
| `401`  | Missing or invalid JWT             |
| `403`  | User lacks creator/moderator role  |
| `422`  | Validation error (bad URL, etc.)   |

### Example cURL

```bash
curl -X POST https://localhost:8443/api/v1/videos \
  -H "Authorization: Bearer eyJhbGciOi..." \
  -H "Content-Type: application/json" \
  -d '{"youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

---

## 3. Cassandra Concepts Explained

### UUID Generation

Every video gets a **UUID** (Universally Unique Identifier) as its primary key. Think of
a UUID like a Social Security number for data -- it is globally unique without needing a
central authority to assign it. The backend generates a UUID v4 (random) for each new video.

In Cassandra, UUIDs are the preferred primary key type because:
- They can be generated on any node without coordination
- There is virtually zero chance of collision (2^122 possible values)
- They avoid the "hot partition" problem that auto-incrementing integers cause

### Denormalization

When a video is submitted, the backend writes to **two tables**: `videos` and
`latest_videos`. This is called **denormalization** -- storing the same data in multiple
places, each optimized for a different query pattern.

**Analogy:** Imagine a library where you need to find books by ISBN and also browse the
"New Arrivals" shelf. Rather than having one big catalog and searching it two different
ways, the library maintains both an ISBN index (the `videos` table) and a separate
"New Arrivals" display (the `latest_videos` table). When a new book arrives, the
librarian adds it to both places.

In a relational database you would use a single table with multiple indexes. In Cassandra,
you design separate tables for separate query patterns. This is the fundamental Cassandra
trade-off: **write more, read faster**.

### Async Workflows and Background Processing

The `202 Accepted` status code signals that the server has accepted the request but has
not finished processing it. This is a common pattern for operations that involve:
- External API calls (YouTube metadata fetch)
- CPU-intensive work (embedding generation)
- Multiple database writes that should not block the user

The client is expected to poll `GET /api/v1/videos/id/{video_id}/status` to track progress
through the `PENDING -> PROCESSING -> READY` state machine.

### Vector Embeddings

The backend generates a 384-dimensional vector embedding using IBM Granite. This embedding
captures the semantic meaning of the video's content (title, description, tags) as a
point in high-dimensional space. Videos with similar content will have vectors that are
close together, enabling similarity search later.

---

## 4. Data Model

### Primary Table: `videos`

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

**Key points:**
- `videoid` is the sole partition key -- every video lives in its own partition
- `content_features vector<float, 384>` stores the IBM Granite embedding
- `tags set<text>` uses a Cassandra collection type (an unordered set of strings)
- `location_type` is an integer enum (1 = YouTube)

### Denormalized Table: `latest_videos`

```sql
CREATE TABLE killrvideo.latest_videos (
    day date,
    added_date timestamp,
    videoid uuid,
    name text,
    preview_image_location text,
    userid uuid,
    content_rating text,
    category text,
    PRIMARY KEY (day, added_date, videoid)
) WITH CLUSTERING ORDER BY (added_date DESC, videoid ASC);
```

**Key points:**
- Partitioned by `day` so each day's videos form a single partition
- `added_date DESC` clustering puts the newest videos first within each day
- Contains a **subset** of columns -- only what is needed for the video list view
- This table exists so that "show me the latest videos" is a single-partition read

---

## 5. Database Queries

### Backend Function: `video_service.submit_new_video()`

The backend performs these operations in sequence:

**Step 1: Extract YouTube ID and fetch metadata**

```python
# Extract the YouTube video ID from the URL
youtube_id = extract_youtube_id(request.youtubeUrl)

# Fetch metadata from YouTube (title, description, thumbnail, etc.)
metadata = fetch_youtube_metadata(youtube_id)
```

**Step 2: Generate embedding vector**

```python
# Generate a 384-dimensional embedding using IBM Granite
# Input: concatenation of title + description + tags
embedding = granite_embed(f"{metadata.title} {metadata.description}")
# Result: [0.0234, -0.1567, 0.8921, ...] (384 floats)
```

**Step 3: Insert into `videos` table**

```python
# Using the Data API (Astra DB / Stargate)
videos_collection.insert_one({
    "videoid": new_uuid,
    "name": metadata.title,
    "description": metadata.description,
    "preview_image_location": metadata.thumbnail_url,
    "location": request.youtubeUrl,
    "location_type": 1,
    "youtube_id": youtube_id,
    "userid": current_user.userid,
    "added_date": now,
    "tags": set(),
    "content_features": embedding,
    "views": 0,
    "status": "READY"
})
```

**Equivalent CQL:**

```sql
INSERT INTO killrvideo.videos (
    videoid, name, description, preview_image_location,
    location, location_type, youtube_id, userid,
    added_date, tags, content_features, views
) VALUES (
    550e8400-e29b-41d4-a716-446655440000,
    'Never Gonna Give You Up',
    'The official video for...',
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    1,
    'dQw4w9WgXcQ',
    123e4567-e89b-12d3-a456-426614174000,
    '2026-03-19T14:30:00Z',
    {},
    [0.0234, -0.1567, 0.8921, ...],  -- 384 floats
    0
);
```

**Step 4: Insert into `latest_videos` table**

```python
latest_videos_collection.insert_one({
    "day": today,
    "added_date": now,
    "videoid": new_uuid,
    "name": metadata.title,
    "preview_image_location": metadata.thumbnail_url,
    "userid": current_user.userid,
    "content_rating": None,
    "category": None
})
```

**Equivalent CQL:**

```sql
INSERT INTO killrvideo.latest_videos (
    day, added_date, videoid, name,
    preview_image_location, userid
) VALUES (
    '2026-03-19',
    '2026-03-19T14:30:00Z',
    550e8400-e29b-41d4-a716-446655440000,
    'Never Gonna Give You Up',
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    123e4567-e89b-12d3-a456-426614174000
);
```

### Performance Characteristics

| Operation                   | Complexity | Notes                                    |
|-----------------------------|-----------|------------------------------------------|
| Insert into `videos`        | O(1)      | Single-partition write by UUID            |
| Insert into `latest_videos` | O(1)      | Single-partition write (partition = day)  |
| YouTube metadata fetch      | Variable  | External HTTP call, 100-2000ms typical    |
| Embedding generation        | ~200ms    | IBM Granite model inference               |

---

## 6. Implementation Flow

```
    Client (React)                    Backend (FastAPI)                  Cassandra
    ──────────────                    ─────────────────                  ─────────
         │                                  │                               │
         │  POST /api/v1/videos             │                               │
         │  { youtubeUrl: "..." }           │                               │
         │─────────────────────────────────>│                               │
         │                                  │                               │
         │                                  │  1. Validate JWT + role       │
         │                                  │  2. Extract YouTube ID        │
         │                                  │  3. Generate UUID v4          │
         │                                  │                               │
         │  202 Accepted                    │                               │
         │  { videoId, status: "PENDING" }  │                               │
         │<─────────────────────────────────│                               │
         │                                  │                               │
         │                                  │  4. Fetch YouTube metadata    │
         │                                  │     (async background)        │
         │                                  │                               │
         │                                  │  5. Generate 384-dim          │
         │                                  │     embedding (IBM Granite)   │
         │                                  │                               │
         │                                  │  6. INSERT INTO videos        │
         │                                  │─────────────────────────────>│
         │                                  │                               │
         │                                  │  7. INSERT INTO latest_videos │
         │                                  │─────────────────────────────>│
         │                                  │                               │
         │  (polls GET .../status)          │  8. Update status -> READY    │
         │─────────────────────────────────>│─────────────────────────────>│
         │  { status: "READY" }             │                               │
         │<─────────────────────────────────│                               │
```

---

## 7. Special Notes

### Astra DB / DataStax Specifics

- The backend uses the **Data API** (JSON/REST) rather than raw CQL. Operations like
  `insert_one()` map to CQL `INSERT` statements under the hood.
- Vector columns (`content_features vector<float, 384>`) require **Astra DB** or a
  Cassandra 5.0+ cluster with vector search enabled.
- The 384-dimension limit matches IBM Granite's `slate.125m` model output.

### Dual-Write Consistency

The inserts into `videos` and `latest_videos` are **not** atomic. If the second write
fails, the video will exist in the `videos` table but will not appear in the latest
videos feed. This is an accepted trade-off in Cassandra -- eventual consistency is
preferred over the performance cost of distributed transactions.

In practice, write failures are rare and the impact is minimal (the video is still
accessible by direct ID lookup).

### Security Considerations

- The JWT is validated before any processing begins
- Role checking ensures only `creator` and `moderator` roles can submit
- The YouTube URL is validated server-side to prevent injection attacks
- The `userid` in the video record is always derived from the JWT, never from the request body

### Rate Limiting

Video submission is an expensive operation (external API calls + ML inference). Production
deployments should implement rate limiting to prevent abuse -- for example, 10 submissions
per hour per user.

---

## 8. Developer Tips

### Common Pitfalls

1. **Forgetting the title field.** If you omit `title` in the request, the backend will
   fetch it from YouTube. This adds latency. For the best UX, call `POST /api/v1/videos/preview`
   first and pass the title through.

2. **Not polling for status.** The `202 Accepted` response does not mean the video is
   ready. You must poll `GET /api/v1/videos/id/{videoId}/status` until `status` changes
   to `"READY"`. Do not display the video player until it is ready.

3. **Invalid YouTube URLs.** The backend only accepts standard YouTube URL formats:
   - `https://www.youtube.com/watch?v=VIDEO_ID`
   - `https://youtu.be/VIDEO_ID`
   - Other formats may return a 422 validation error.

### Frontend Integration Pattern

```typescript
// From src/lib/api.ts -- the frontend API client
async submitVideo(youtubeUrl: string, title?: string): Promise<VideoDetailResponse> {
  return this.post('/videos', { youtubeUrl, title });
}

// Typical React component flow:
// 1. User pastes URL -> call preview endpoint for title
// 2. User confirms -> call submitVideo()
// 3. Redirect to video page, which polls status
```

### Testing Tips

- Use any valid YouTube URL for testing; the backend extracts metadata automatically.
- To test error cases, try submitting without auth (expect 401) or with a viewer-only
  account (expect 403).
- Check that the video appears in the latest videos feed (`GET /api/v1/videos/latest`)
  after status becomes READY.
- Verify the embedding was generated by checking that `content_features` is non-null
  in the `GET /api/v1/videos/id/{videoId}` response.

### Monitoring Checklist

- Track submission-to-READY latency (p50, p95, p99)
- Alert on videos stuck in `PENDING` or `PROCESSING` for more than 60 seconds
- Monitor YouTube API quota usage
- Log embedding generation failures separately from YouTube fetch failures
