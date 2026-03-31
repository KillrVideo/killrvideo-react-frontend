# GET /api/v1/videos/id/{video_id}/status -- Check Processing Status

## 1. Overview

This endpoint returns the current processing status of a submitted video. After a creator
submits a YouTube URL via `POST /api/v1/videos`, the video goes through an asynchronous
pipeline (metadata fetch, embedding generation, etc.). This endpoint lets the frontend
poll for completion so it knows when the video is ready to display.

**Why it exists:** Video ingestion is asynchronous. The `POST /api/v1/videos` endpoint
returns `202 Accepted` immediately, but the video is not playable yet. The frontend needs
a lightweight way to check "is my video ready?" without fetching the full video detail
payload every time. This endpoint returns only two fields (`videoId` and `status`),
making it ideal for frequent polling.

**Who can call it:** Only the video's owner (creator) or a user with the `moderator`
role. Regular viewers cannot check processing status -- they should not even know about
videos that are not yet READY.

---

## 2. HTTP Details

| Property        | Value                                              |
|-----------------|----------------------------------------------------|
| **Method**      | `GET`                                              |
| **Path**        | `/api/v1/videos/id/{video_id_path}/status`         |
| **Auth**        | Bearer JWT (owner or moderator)                    |
| **Success Code**| `200 OK`                                           |

### Path Parameters

| Parameter       | Type   | Required | Description              |
|-----------------|--------|----------|--------------------------|
| `video_id_path` | UUID   | Yes      | The video's unique ID    |

### Response Body (`VideoStatusResponse`)

```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PROCESSING"
}
```

| Field     | Type   | Description                              |
|-----------|--------|------------------------------------------|
| `videoId` | UUID   | The video's unique identifier            |
| `status`  | enum   | Current processing state (see below)     |

### Status Enum Values

| Value        | Meaning                                                    |
|--------------|------------------------------------------------------------|
| `PENDING`    | Video submitted, processing has not started yet            |
| `PROCESSING` | Backend is actively fetching metadata / generating embeddings |
| `READY`      | Processing complete, video is playable                     |
| `ERROR`      | Processing failed (YouTube unavailable, embedding failure, etc.) |

### Error Responses

| Status | Condition                                    |
|--------|----------------------------------------------|
| `401`  | Missing or invalid JWT                       |
| `403`  | User is not the owner and not a moderator    |
| `404`  | Video does not exist                         |
| `422`  | Invalid UUID format in path                  |

### Example cURL

```bash
curl https://localhost:8443/api/v1/videos/id/550e8400-e29b-41d4-a716-446655440000/status \
  -H "Authorization: Bearer eyJhbGciOi..."
```

---

## 3. Cassandra Concepts Explained

### Status Columns as State Machines

The `status` field in the `videos` table implements a **state machine** -- a pattern where
a record transitions through a defined set of states in a specific order. The valid
transitions are:

```
    PENDING ──> PROCESSING ──> READY
                    │
                    └──────────> ERROR
```

**Analogy:** Think of ordering food at a restaurant. Your order goes through states:
"Received" (PENDING) -> "Being Prepared" (PROCESSING) -> "Ready for Pickup" (READY).
If the kitchen runs out of ingredients, the order goes to "Cancelled" (ERROR). You can
check on your order at any time, and the hostess tells you its current state. That is
exactly what this endpoint does.

In Cassandra, there is no built-in state machine or enum constraint. The `status` column
is stored as plain `text`. The valid values and transition rules are enforced entirely in
application code (the Python backend). Cassandra will happily store any string in that
column -- it is the backend's job to ensure only valid status values are written.

### Reading a Single Column vs. the Whole Row

This endpoint only needs the `status` field, but Cassandra reads at the row level (from
SSTables on disk) rather than the column level. When the backend calls `find_one`, it
retrieves the entire row from storage, even though the API response only returns two fields.

**Why not use a CQL `SELECT status FROM videos WHERE videoid = ?`?** The Data API's
`find_one` does not currently support column projections in all implementations. Even if
it did, the performance difference is negligible because:

1. All columns for a row are stored together on disk (in the same SSTable partition)
2. Reading one column vs. fifteen columns from the same row costs nearly the same I/O
3. The bottleneck is the disk seek to find the partition, not the bytes read from it

**Analogy:** If you open a filing cabinet drawer to check one field on an index card,
the expensive part is walking to the cabinet and opening the drawer. Reading one line vs.
reading the whole card takes essentially the same time once the card is in your hand.

### Consistency Level Considerations

For status polling, you might consider using `LOCAL_QUORUM` consistency instead of the
default `LOCAL_ONE`. Why? Because the status is written by the background processing
pipeline, and you want the polling client to see the most recent write. With `LOCAL_ONE`,
there is a small window where the read might hit a replica that has not yet received the
latest status update.

In practice, KillrVideo uses `LOCAL_ONE` for reads because:
- The polling interval (typically 1-2 seconds) is much longer than replication delay
- A slightly stale read just means one extra poll cycle
- `LOCAL_QUORUM` doubles the read latency

---

## 4. Data Model

### Table: `videos` (status field)

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

The `status` field is stored within this table. Note that in the CQL schema shown above,
there is no explicit `status` column -- in the Data API model, the document can have
additional fields beyond what is in the CQL schema. The status may be stored as part of
the document metadata or as a column that was added after initial table creation.

### No Separate Status Table

A common question: "Should we put the status in a separate table to avoid reading the
full video row?" The answer is **no**, for these reasons:

1. **Single-partition reads are cheap.** Reading one row by primary key is already O(1).
2. **Additional table means additional writes.** Every status transition would require
   writing to two tables (the main `videos` table and the status table).
3. **Consistency across tables is hard.** If the status table says READY but the `videos`
   table still says PROCESSING, you have a data inconsistency.

The simple approach -- storing status as a column on the `videos` table -- is the right
Cassandra pattern here.

---

## 5. Database Queries

### Backend Function

The backend reads the `status` field from the video document:

```python
def get_video_status(video_id: UUID, current_user: User) -> VideoStatusResponse:
    # Step 1: Find the video
    doc = videos_collection.find_one({"videoid": str(video_id)})

    if doc is None:
        raise HTTPException(status_code=404, detail="Video not found")

    # Step 2: Authorization check
    if (str(doc["userid"]) != str(current_user.userid)
            and "moderator" not in current_user.roles):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Step 3: Return only the status fields
    return VideoStatusResponse(
        videoId=video_id,
        status=doc.get("status", "PENDING")
    )
```

### Equivalent CQL

```sql
SELECT videoid, status, userid
FROM killrvideo.videos
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
```

The `userid` column is also fetched because the backend needs it for the authorization
check (is the caller the owner?).

### How Status Gets Updated (by the processing pipeline)

When the background pipeline progresses, it updates the status:

```python
# Transition to PROCESSING
videos_collection.update_one(
    {"videoid": str(video_id)},
    {"$set": {"status": "PROCESSING"}}
)

# ... do work (fetch metadata, generate embedding) ...

# Transition to READY
videos_collection.update_one(
    {"videoid": str(video_id)},
    {"$set": {"status": "READY"}}
)
```

**Equivalent CQL:**

```sql
-- Start processing
UPDATE killrvideo.videos
SET status = 'PROCESSING'
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;

-- Processing complete
UPDATE killrvideo.videos
SET status = 'READY'
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
```

### Performance Characteristics

| Operation              | Complexity | Notes                              |
|------------------------|-----------|-------------------------------------|
| find_one by videoid    | O(1)      | Single-partition read               |
| **Total round trips**  | 1         | One read is all that is needed      |
| **Typical latency**    | 1-5ms     | Same as any primary-key lookup      |
| **Response size**      | ~100 bytes | Tiny -- just videoId and status    |

---

## 6. Implementation Flow

```
    Client (React)                    Backend (FastAPI)                  Cassandra
    ──────────────                    ─────────────────                  ─────────
         │                                  │                               │
         │  GET .../videos/id/{uuid}/status │                               │
         │  Authorization: Bearer ...       │                               │
         │─────────────────────────────────>│                               │
         │                                  │                               │
         │                                  │  1. Validate JWT              │
         │                                  │                               │
         │                                  │  2. find_one({videoid: uuid}) │
         │                                  │─────────────────────────────>│
         │                                  │  { status, userid, ... }      │
         │                                  │<─────────────────────────────│
         │                                  │                               │
         │                                  │  3. Check: caller == owner    │
         │                                  │     or has moderator role?    │
         │                                  │                               │
         │                                  │  4. Extract status field      │
         │                                  │                               │
         │  200 OK                          │                               │
         │  { videoId, status }             │                               │
         │<─────────────────────────────────│                               │
         │                                  │                               │
    ┌────┴────┐                             │                               │
    │ Wait    │  (if status != READY,       │                               │
    │ 1-2 sec │   poll again)               │                               │
    └────┬────┘                             │                               │
         │                                  │                               │
         │  GET .../videos/id/{uuid}/status │                               │
         │─────────────────────────────────>│  (repeat until READY/ERROR)   │
```

### Polling Loop on the Frontend

```
    ┌─────────────────────────┐
    │  Submit video (POST)    │
    │  Receive 202 + videoId  │
    └────────────┬────────────┘
                 │
                 v
    ┌─────────────────────────┐
    │  GET .../status         │<──────────┐
    └────────────┬────────────┘           │
                 │                        │
          ┌──────┴──────┐                 │
          │             │                 │
     READY/ERROR    PENDING/PROCESSING    │
          │             │                 │
          v             └── wait 1-2s ────┘
    ┌─────────────┐
    │  Show video  │
    │  (or error)  │
    └─────────────┘
```

---

## 7. Special Notes

### Astra DB / DataStax Specifics

- The Data API `find_one` call translates to `SELECT * FROM videos WHERE videoid = ?`.
  Even though we only need `status`, the entire document is returned. The Python code
  then extracts the relevant fields.
- Status transitions are simple `update_one` calls with `$set`. There is no transaction
  or conditional update (like `IF status = 'PENDING'`). This means it is theoretically
  possible for a race condition to set the status backward, but the processing pipeline
  is single-threaded per video so this does not happen in practice.

### No WebSocket / Server-Sent Events (Yet)

The current implementation uses **polling** to check status. A more efficient approach
would be WebSocket or Server-Sent Events (SSE), where the server pushes status updates
to the client as they happen. This is a future enhancement. For now, polling every 1-2
seconds is acceptable given the lightweight nature of this endpoint.

### Security: Why Restrict to Owner/Moderator?

Viewers should not be able to see videos in PENDING or PROCESSING state because:
1. The video might fail processing and never become visible
2. Metadata might be incomplete or incorrect during processing
3. Exposing unvetted content before moderation review is a policy risk

By restricting this endpoint, the system ensures that only authorized users (who already
know the video exists because they submitted it) can track its progress.

### Idempotency

This endpoint is inherently idempotent -- calling it multiple times with the same input
produces the same output (the current status). The status may change between calls due to
background processing, but for a given point in time, the response is deterministic.

---

## 8. Developer Tips

### Common Pitfalls

1. **Polling too fast.** Do not call this endpoint more than once per second. The
   background processing takes at least a few seconds (YouTube API call + embedding
   generation). Polling every 100ms wastes resources and does not speed up processing.

2. **Not handling ERROR status.** If processing fails, the status becomes `ERROR`. Your
   UI should display a meaningful error message and offer the user a way to retry or
   contact support. Do not keep polling forever.

3. **Polling without timeout.** Set a maximum polling duration (e.g., 60 seconds). If
   the video is still not READY after that, stop polling and show an error. Something
   may have gone wrong on the backend.

4. **Forgetting authorization.** This endpoint requires a JWT. If the token expires
   during polling, the next poll will return 401. Handle token refresh in your polling
   logic.

### Frontend Polling Pattern

```typescript
// Polling with React Query (from src/hooks/useApi.ts pattern)
export function useVideoStatus(videoId: string) {
  return useQuery({
    queryKey: ['videoStatus', videoId],
    queryFn: () => api.getVideoStatus(videoId),
    // Poll every 2 seconds while status is not terminal
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'READY' || status === 'ERROR') {
        return false; // Stop polling
      }
      return 2000; // Poll every 2 seconds
    },
    staleTime: 0, // Always fetch fresh data when polling
  });
}
```

### Testing Tips

- **Full lifecycle test:** Submit a video, then poll status until READY. Verify the
  transitions: PENDING -> PROCESSING -> READY.
- **Error state:** If you can trigger a processing failure (e.g., submit an invalid
  YouTube URL that passes initial validation but fails during metadata fetch), verify
  the status becomes ERROR.
- **Authorization:** Try polling for another user's video without moderator role.
  Expect 403.
- **Nonexistent video:** Poll with a random UUID. Expect 404.

### Status Transition Timing

Typical timing for the processing pipeline:

| Transition             | Typical Duration    | What is Happening                    |
|------------------------|--------------------|-----------------------------------------|
| PENDING -> PROCESSING  | < 1 second         | Queue pickup                            |
| PROCESSING -> READY    | 2-10 seconds       | YouTube fetch + embedding generation    |
| PROCESSING -> ERROR    | 1-30 seconds       | Depends on failure type and timeouts    |

### Debugging Slow Transitions

If videos are stuck in PENDING or PROCESSING for too long:

1. Check the backend logs for processing pipeline errors
2. Verify YouTube API connectivity (external dependency)
3. Check the embedding model service (IBM Granite) health
4. Look for queue backlog if many videos are submitted simultaneously
5. In Cassandra, directly query the status:
   ```sql
   SELECT videoid, status FROM killrvideo.videos
   WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
   ```
