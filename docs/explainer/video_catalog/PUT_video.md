# PUT /api/v1/videos/id/{video_id} -- Update Video Metadata

## 1. Overview

This endpoint allows the video owner or a moderator to update a video's metadata after
it has been submitted. Only certain fields can be changed: the title, description, and
tags. Structural fields like the YouTube URL, upload date, and uploader cannot be modified.

**Why it exists:** After a video is submitted and processed, the creator may want to
fix a typo in the title, add a more detailed description, or update the tags to improve
discoverability. Moderators may also need to edit metadata for policy compliance.

**Who can call it:** Only the video's owner (the user who submitted it) or a user with
the `moderator` role. Other users receive a 403 Forbidden response.

---

## 2. HTTP Details

| Property        | Value                                          |
|-----------------|------------------------------------------------|
| **Method**      | `PUT`                                          |
| **Path**        | `/api/v1/videos/id/{video_id_path}`            |
| **Auth**        | Bearer JWT (owner or moderator)                |
| **Content-Type**| `application/json`                             |
| **Success Code**| `200 OK`                                       |

### Path Parameters

| Parameter       | Type   | Required | Description              |
|-----------------|--------|----------|--------------------------|
| `video_id_path` | UUID   | Yes      | The video's unique ID    |

### Request Body (`VideoUpdateRequest`)

```json
{
  "title": "Updated: Introduction to Apache Cassandra",
  "description": "A comprehensive guide to Cassandra data modeling...",
  "tags": ["cassandra", "database", "nosql", "tutorial"]
}
```

**All fields are optional.** You only need to include the fields you want to change:

| Field         | Type           | Required | Constraints        | Notes                      |
|--------------|----------------|----------|--------------------|----------------------------|
| `title`       | string or null | No       | 3-100 characters   | New video title            |
| `description` | string or null | No       | Max 2000 characters | New description            |
| `tags`        | string[] or null | No     | Array of strings   | Replaces the entire tag set |

**Partial update example** -- changing only the title:

```json
{
  "title": "Fixed Title"
}
```

Fields not included in the request body are **left unchanged** in the database.

### Response Body (`VideoDetailResponse`)

Returns the full updated video object (same schema as `GET /api/v1/videos/id/{video_id}`):

```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "title": "Updated: Introduction to Apache Cassandra",
  "description": "A comprehensive guide to Cassandra data modeling...",
  "tags": ["cassandra", "database", "nosql", "tutorial"],
  "submittedAt": "2026-03-15T10:00:00Z",
  "thumbnailUrl": "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  "location": "https://www.youtube.com/watch?v=abc123",
  "location_type": 1,
  "status": "READY",
  "views": 1542,
  "averageRating": 4.3,
  "totalRatingsCount": 27,
  "is_deleted": false,
  "deleted_at": null
}
```

### Error Responses

| Status | Condition                                    |
|--------|----------------------------------------------|
| `401`  | Missing or invalid JWT                       |
| `403`  | User is not the owner and not a moderator    |
| `404`  | Video does not exist                         |
| `422`  | Validation error (title too short, etc.)     |

### Example cURL

```bash
curl -X PUT https://localhost:8443/api/v1/videos/id/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer eyJhbGciOi..." \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Title", "tags": ["cassandra", "tutorial"]}'
```

---

## 3. Cassandra Concepts Explained

### Partial Updates with `$set`

In a relational database, an `UPDATE` statement replaces specific columns and leaves
others untouched. Cassandra works the same way at the CQL level -- you can `UPDATE` only
the columns you specify. The Data API expresses this with the `$set` operator, borrowed
from MongoDB-style syntax.

**Analogy:** Imagine you have an index card for each video in a filing cabinet. When
someone wants to change the title, you do not throw away the card and write a new one.
You erase just the title line and write the new one. The rest of the card stays the same.
That is what `$set` does.

```python
# Only updates the "name" column; all other columns remain as-is
videos_collection.update_one(
    {"videoid": video_id},
    {"$set": {"name": "New Title"}}
)
```

### The `exclude_unset` Pattern

The backend uses Pydantic's `model_dump(exclude_unset=True)` pattern to determine which
fields the client actually sent. This is crucial for distinguishing between:

- **Field omitted** (not in JSON): "I do not want to change this field"
- **Field set to null** (explicitly `null`): "I want to clear this field"

```python
# If the request JSON is: {"title": "New Title"}
request.model_dump(exclude_unset=True)
# Returns: {"title": "New Title"}
# "description" and "tags" are NOT in the dict because they were not sent

# If the request JSON is: {"title": "New Title", "description": null}
request.model_dump(exclude_unset=True)
# Returns: {"title": "New Title", "description": None}
# "description" IS in the dict because the client explicitly sent null
```

This pattern prevents accidental data loss. Without it, sending `{"title": "New Title"}`
would overwrite `description` and `tags` with null.

### Cassandra Writes Are Upserts

A subtle but important Cassandra concept: every `INSERT` and `UPDATE` is effectively an
**upsert**. If you `UPDATE` a row that does not exist, Cassandra will create it. The
backend must therefore verify the video exists **before** performing the update, otherwise
you could accidentally create a phantom record.

**Analogy:** Imagine a post office where you can leave a note in any mailbox, even one
that does not have an owner yet. If you write "change the name to X" for mailbox #999
and nobody owns mailbox #999, the post office creates it with just a name and nothing
else. The backend guards against this by doing a `find_one` check first.

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

**Updatable fields** (via this endpoint):

| API Field     | CQL Column    | Type        |
|--------------|---------------|-------------|
| `title`       | `name`        | text        |
| `description` | `description` | text        |
| `tags`        | `tags`        | set\<text\> |

**Non-updatable fields** (immutable after creation):

| CQL Column                | Reason                                      |
|--------------------------|----------------------------------------------|
| `videoid`                 | Primary key -- cannot be changed              |
| `userid`                  | Uploader identity is permanent                |
| `added_date`              | Submission timestamp is historical fact       |
| `location`                | YouTube URL does not change                   |
| `location_type`           | Source type is fixed at submission             |
| `preview_image_location`  | Derived from YouTube, not user-editable       |
| `content_features`        | Generated by ML model, not user-editable      |
| `views`                   | Managed by the view-recording endpoint        |

### Note on `tags` as a SET

The `tags` column is a Cassandra `set<text>`. When updated via `$set`, the **entire set
is replaced**, not merged. If the video has tags `["a", "b", "c"]` and you send
`{"tags": ["x", "y"]}`, the result is `["x", "y"]` -- the old tags are gone.

If you want to add a tag without removing existing ones, you must read the current tags
first, add the new one to the array, and send the complete list.

---

## 5. Database Queries

### Backend Function: `video_service.update_video_details()`

```python
def update_video_details(video_id: UUID, request: VideoUpdateRequest,
                         current_user: User) -> VideoDetailResponse:
    # Step 1: Verify the video exists
    existing = videos_collection.find_one({"videoid": str(video_id)})
    if existing is None:
        raise HTTPException(status_code=404, detail="Video not found")

    # Step 2: Check authorization (owner or moderator)
    if (str(existing["userid"]) != str(current_user.userid)
            and "moderator" not in current_user.roles):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Step 3: Extract only the fields the client actually sent
    updates = request.model_dump(exclude_unset=True)

    # Step 4: Filter to allowed columns only
    allowed = {"title", "description", "tags"}
    filtered = {k: v for k, v in updates.items() if k in allowed}

    # Step 5: Map API field names to CQL column names
    column_map = {"title": "name"}
    cql_updates = {}
    for key, value in filtered.items():
        cql_key = column_map.get(key, key)
        cql_updates[cql_key] = value

    # Step 6: Perform the update
    if cql_updates:
        videos_collection.update_one(
            {"videoid": str(video_id)},
            {"$set": cql_updates}
        )

    # Step 7: Return the updated document
    updated = videos_collection.find_one({"videoid": str(video_id)})
    return VideoDetailResponse(**updated)
```

### Equivalent CQL -- Updating Title and Tags

```sql
UPDATE killrvideo.videos
SET name = 'Updated: Introduction to Apache Cassandra',
    tags = {'cassandra', 'database', 'nosql', 'tutorial'}
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
```

### Equivalent CQL -- Updating Only Description

```sql
UPDATE killrvideo.videos
SET description = 'A comprehensive guide to Cassandra data modeling...'
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
```

### Performance Characteristics

| Operation              | Complexity | Notes                                       |
|------------------------|-----------|----------------------------------------------|
| find_one (existence)   | O(1)      | Single-partition read by primary key          |
| update_one ($set)      | O(1)      | Single-partition write by primary key         |
| find_one (return)      | O(1)      | Read-after-write to return updated state      |
| **Total round trips**  | 3         | Existence check + update + re-read            |

All three operations target the same partition (`videoid`), so they are all O(1).

---

## 6. Implementation Flow

```
    Client (React)                    Backend (FastAPI)                  Cassandra
    ──────────────                    ─────────────────                  ─────────
         │                                  │                               │
         │  PUT /api/v1/videos/id/{uuid}    │                               │
         │  { title: "New Title" }          │                               │
         │─────────────────────────────────>│                               │
         │                                  │                               │
         │                                  │  1. Validate JWT              │
         │                                  │                               │
         │                                  │  2. find_one({videoid: uuid}) │
         │                                  │─────────────────────────────>│
         │                                  │  { userid: "owner-id", ... }  │
         │                                  │<─────────────────────────────│
         │                                  │                               │
         │                                  │  3. Check: is caller the      │
         │                                  │     owner or a moderator?     │
         │                                  │                               │
         │                                  │  4. model_dump(exclude_unset) │
         │                                  │     -> { "title": "New Title"}│
         │                                  │                               │
         │                                  │  5. Map "title" -> "name"     │
         │                                  │                               │
         │                                  │  6. update_one($set: {name})  │
         │                                  │─────────────────────────────>│
         │                                  │  OK                           │
         │                                  │<─────────────────────────────│
         │                                  │                               │
         │                                  │  7. find_one (re-read)        │
         │                                  │─────────────────────────────>│
         │                                  │  { updated document }         │
         │                                  │<─────────────────────────────│
         │                                  │                               │
         │  200 OK                          │                               │
         │  { videoId, title: "New Title" } │                               │
         │<─────────────────────────────────│                               │
```

---

## 7. Special Notes

### Astra DB / DataStax Specifics

- The `update_one` with `$set` operation is atomic at the row level in Cassandra. There
  is no risk of partial updates within a single row.
- The Data API translates `$set` into a CQL `UPDATE ... SET col1 = ?, col2 = ?` statement.
- If you update the `name` column (which has an SAI index), the index is updated
  automatically by Cassandra. No additional application code is needed.

### Denormalization Gap

When a video title is updated via this endpoint, the change is written to the `videos`
table only. The `latest_videos` table, which also stores the `name` column, is **not**
updated. This means:

- The Watch page (which reads from `videos`) will show the new title immediately.
- The home page feed (which reads from `latest_videos`) will show the old title until
  the cache expires or the row is refreshed.

This is an accepted trade-off. Keeping denormalized tables perfectly in sync would require
additional writes and complexity. For a video sharing app, slightly stale titles in list
views are not a critical issue.

### Security Considerations

- **Authorization is two-level:** First the JWT is validated, then the backend checks
  ownership or moderator role against the video's `userid`.
- **Field filtering is server-side:** Even if a malicious client sends `{"views": 999999}`
  in the request body, the backend ignores it because `views` is not in the `allowed` set.
- **No direct CQL injection:** The Data API parameterizes all values, preventing injection.

### Concurrent Updates

If two users (e.g., the owner and a moderator) update the same video simultaneously,
Cassandra applies **last-write-wins** semantics. The update with the later timestamp
will prevail. There is no locking or conflict detection. In practice, simultaneous edits
to the same video are rare.

---

## 8. Developer Tips

### Common Pitfalls

1. **Sending an empty body.** If you send `{}`, the backend will find no fields to update
   and return the video unchanged. This is not an error, but it is a wasted round trip.

2. **Tag replacement, not merge.** Sending `{"tags": ["new-tag"]}` replaces **all** tags
   with just `["new-tag"]`. If the video had 5 tags, 4 of them are now gone. Always
   read the current tags first and merge on the client side.

3. **Field name mismatch.** The API uses `title` but the CQL column is `name`. The
   backend handles this mapping, but be aware of it when debugging database queries.

4. **No cascade to `latest_videos`.** After updating a title, the latest videos feed
   will still show the old title. This is by design, not a bug.

### Frontend Integration Pattern

```typescript
// From src/lib/api.ts
async updateVideo(videoId: string, data: VideoUpdateRequest): Promise<VideoDetailResponse> {
  return this.put(`/videos/id/${videoId}`, data);
}
```

After a successful update, invalidate the React Query cache to reflect the changes:

```typescript
const queryClient = useQueryClient();
// After successful mutation:
queryClient.invalidateQueries({ queryKey: ['video', videoId] });
```

### Testing Tips

- **Partial update:** Send only `{"description": "new desc"}` and verify the title and
  tags remain unchanged.
- **Authorization:** Try updating a video owned by another user without moderator role.
  Expect 403.
- **Moderator override:** Log in as a moderator and update someone else's video. Should
  succeed with 200.
- **Validation:** Try `{"title": "ab"}` (too short, minimum 3 chars). Expect 422.
- **Empty tags:** Send `{"tags": []}` and verify the tag set is cleared.

### Optimistic Updates in the UI

For a snappy user experience, consider applying optimistic updates in the React Query
cache before the server responds:

```typescript
const mutation = useMutation({
  mutationFn: (data) => api.updateVideo(videoId, data),
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['video', videoId] });
    const previous = queryClient.getQueryData(['video', videoId]);
    queryClient.setQueryData(['video', videoId], (old) => ({
      ...old,
      ...newData,
    }));
    return { previous };
  },
  onError: (err, newData, context) => {
    queryClient.setQueryData(['video', videoId], context.previous);
  },
});
```

This makes the title change appear instantly in the UI while the PUT request is in flight.
If the request fails, the cache rolls back to the previous state.
