# POST /api/v1/videos/id/{video_id}/view - Record Playback View

## Overview

This endpoint increments a video's view count and logs the view event in time-series activity tables. It fires every time a viewer starts watching a video, whether they are logged in or anonymous.

**Why it exists**: View counts are a core engagement metric for any video platform. They drive the trending algorithm, help creators understand their reach, and give viewers a signal of content popularity. Beyond the counter, the activity log feeds the user's activity timeline and powers analytics.

**Design challenge**: Cassandra does not natively support atomic increment operations through the Data API's Table API. This endpoint must perform a **read-modify-write** cycle to increment the view count, which introduces nuances around concurrency and consistency.

## HTTP Details

- **Method**: POST
- **Path**: `/api/v1/videos/id/{video_id_path}/view`
- **Auth Required**: Optional (works for both authenticated and anonymous users)
- **Success Status**: 204 No Content
- **Handler**: `app/api/v1/endpoints/video_catalog.py`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `video_id_path` | UUID | Yes | The video being viewed |

### Request Body

None. This is a simple notification endpoint.

### Response

**204 No Content** -- empty response body on success.

### Error Responses

| Status | Condition |
|--------|-----------|
| 403 | Authenticated user trying to view a non-READY video they do not own |
| 404 | Video does not exist, or non-READY video accessed by anonymous user |
| 422 | Invalid UUID format |

### Auth Behavior

| Caller | Video Status | Result |
|--------|-------------|--------|
| Anyone | READY | 204 (view recorded) |
| Anonymous | Not READY | 404 (video hidden) |
| Authenticated viewer | Not READY | 403 (forbidden) |
| Video owner | Not READY | 204 (owner can view own video) |

## Cassandra Concepts Explained

### The Counter Problem

In a relational database, incrementing a counter is straightforward:

```sql
UPDATE videos SET views = views + 1 WHERE videoid = ?;
```

In Cassandra, this is more nuanced. Cassandra has a dedicated `counter` column type for atomic increments, but the `videos` table uses a regular `int` for views. Here is why that matters:

**Regular int column** (what `videos.views` uses):
- Cannot use `views = views + 1` syntax in normal tables
- Requires read-modify-write: read current value, add 1, write new value
- Risk of lost updates under concurrent access

**Counter column** (what `video_ratings` uses):
- Supports atomic `SET rating_counter = rating_counter + 1`
- Dedicated counter tables have restrictions (all non-key columns must be counters)
- Cannot mix counter and non-counter columns

### Why Read-Modify-Write?

The Data API's Table API does not support an `$inc` (increment) operator for regular columns. The backend must:

```
1. READ:   current_views = SELECT views FROM videos WHERE videoid = ?
2. MODIFY: new_views = current_views + 1
3. WRITE:  UPDATE videos SET views = new_views WHERE videoid = ?
```

**Analogy**: Imagine a scoreboard where you cannot just say "add one point." Instead, you must look at the current score, mentally add one, and write the new number. If two people try this at the same time, one person's update can overwrite the other's.

### Time-Series Data Modeling

The `video_activity` and `user_activity` tables follow a **time-series pattern** -- one of Cassandra's strongest use cases.

**Key idea**: Partition by time bucket (day), cluster by timestamp within that bucket.

```
Day: 2025-10-31
├── 14:30:01 - User A viewed Video X
├── 14:30:02 - User B viewed Video Y
├── 14:30:05 - User C viewed Video X
└── 14:31:00 - User A viewed Video Z
```

**Why partition by day?**
- Prevents unbounded partition growth (each day is a new partition)
- Easy to query "all activity for today" or "all activity for October 31"
- Old data can be TTL'd or archived per-partition

### TimeUUID for Ordering

Both activity tables use `timeuuid` for ordering. A TimeUUID is a UUID that encodes a timestamp:

- **UUID v4** (random): `550e8400-e29b-41d4-a716-446655440000` -- no time information
- **TimeUUID (v1)**: `d2177dd0-eaa2-11de-a572-001b779c76e3` -- encodes `2009-12-11T23:03:00Z`

**Benefits**:
- Natural chronological ordering (sort by timeuuid = sort by time)
- Uniqueness guaranteed even for simultaneous events
- Extract the timestamp later: `toTimestamp(timeuuid_column)`

## Data Model

### Table: `videos` (view count updated here)

```cql
CREATE TABLE killrvideo.videos (
    videoid uuid PRIMARY KEY,           -- Partition key
    added_date timestamp,
    description text,
    location text,
    location_type int,
    name text,
    preview_image_location text,
    tags set<text>,
    content_features vector<float, 384>,
    userid uuid,
    views int,                          -- View counter (regular int, not counter type)
    youtube_id text
);
```

### Table: `video_activity` (time-series view log)

```cql
CREATE TABLE killrvideo.video_activity (
    videoid uuid,                       -- Which video was viewed
    day date,                           -- Date bucket (e.g., 2025-10-31)
    watch_time timeuuid,                -- TimeUUID for ordering and uniqueness
    PRIMARY KEY (day, watch_time)        -- Partition by day, cluster by time
) WITH CLUSTERING ORDER BY (watch_time DESC);
```

**Key Characteristics**:
- **Partition Key**: `day` -- all activity for a single day lives in one partition
- **Clustering Key**: `watch_time DESC` -- newest events first within each day
- **No userid column**: This table logs all views (authenticated and anonymous)
- **Compact rows**: Only stores videoid per event, keeping partitions small

### Table: `user_activity` (per-user activity log)

```cql
CREATE TABLE killrvideo.user_activity (
    userid uuid,                        -- Which user performed the action
    day date,                           -- Date bucket
    activity_type text,                 -- 'view', 'rate', 'comment', etc.
    activity_id timeuuid,               -- Unique event identifier
    activity_timestamp timestamp,       -- When the action occurred
    PRIMARY KEY ((userid, day), activity_type, activity_timestamp, activity_id)
) WITH CLUSTERING ORDER BY (activity_type ASC, activity_timestamp DESC, activity_id ASC);
```

**Key Characteristics**:
- **Composite Partition Key**: `(userid, day)` -- each user gets one partition per day
- **Clustering Keys**: `activity_type`, `activity_timestamp`, `activity_id`
- **Only written for authenticated users**: Anonymous views do not create rows here

## Database Queries

### 1. Read Current View Count

**Service Function**: `video_service.record_video_view()`

```python
async def record_video_view(video_id: UUID, user_id: Optional[UUID] = None):
    table = await get_table("videos")

    # Step 1: Read current video (also validates it exists)
    video = await table.find_one(filter={"videoid": str(video_id)})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    current_views = video.get("views", 0) or 0
```

**Equivalent CQL**:
```cql
SELECT videoid, views, userid FROM killrvideo.videos
WHERE videoid = a1b2c3d4-e5f6-7890-abcd-ef1234567890;
```

**Performance**: **O(1)** -- Direct partition key lookup.

### 2. Increment View Count (Write Back)

```python
    # Step 2: Increment and write back using $set
    new_views = current_views + 1
    await table.update_one(
        filter={"videoid": str(video_id)},
        update={"$set": {"views": new_views}}
    )
```

**Equivalent CQL**:
```cql
UPDATE killrvideo.videos
SET views = 1235
WHERE videoid = a1b2c3d4-e5f6-7890-abcd-ef1234567890;
```

**Performance**: **O(1)** -- Direct partition key update.

**Concurrency risk**: If two requests read `views = 1234` simultaneously, both write `views = 1235`, losing one increment. See Special Notes for mitigation.

### 3. Log to video_activity

```python
    # Step 3: Insert activity record
    activity_table = await get_table("video_activity")
    from uuid import uuid1
    watch_time = uuid1()  # TimeUUID with current timestamp

    await activity_table.insert_one(document={
        "videoid": str(video_id),
        "day": date.today().isoformat(),
        "watch_time": str(watch_time)
    })
```

**Equivalent CQL**:
```cql
INSERT INTO killrvideo.video_activity (videoid, day, watch_time)
VALUES (
    a1b2c3d4-e5f6-7890-abcd-ef1234567890,
    '2025-10-31',
    now()  -- Generates server-side TimeUUID
);
```

**Performance**: **O(1)** -- Appending to a time-series partition.

### 4. Log to user_activity (Authenticated Users Only)

```python
    # Step 4: Only for authenticated users
    if user_id:
        user_activity_table = await get_table("user_activity")
        now = datetime.now(timezone.utc)

        await user_activity_table.insert_one(document={
            "userid": str(user_id),
            "day": date.today().isoformat(),
            "activity_type": "view",
            "activity_id": str(uuid1()),
            "activity_timestamp": now.isoformat()
        })
```

**Equivalent CQL**:
```cql
INSERT INTO killrvideo.user_activity (
    userid, day, activity_type, activity_id, activity_timestamp
) VALUES (
    550e8400-e29b-41d4-a716-446655440000,
    '2025-10-31',
    'view',
    now(),
    '2025-10-31T14:30:01Z'
);
```

**Performance**: **O(1)** -- Single partition write.

## Implementation Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. Client sends POST /videos/id/{video_id}/view          │
│    (Optional: Authorization header with JWT)            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. FastAPI Endpoint                                      │
│    ├─ Validates UUID format                             │
│    ├─ Extracts user_id from JWT (if present)            │
│    └─ Calls video_service.record_video_view()           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Read Video Record                                     │
│    SELECT * FROM videos WHERE videoid = ?               │
│    ├─ Not found → 404                                   │
│    ├─ Not READY + anonymous → 404                       │
│    ├─ Not READY + authenticated non-owner → 403         │
│    └─ READY (or owner) → proceed                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Increment View Count (read-modify-write)              │
│    current_views = video.views (or 0)                   │
│    UPDATE videos SET views = current_views + 1          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Log to video_activity                                 │
│    INSERT INTO video_activity (videoid, day, watch_time) │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 6. If Authenticated: Log to user_activity                │
│    INSERT INTO user_activity                             │
│    (userid, day, activity_type='view', ...)             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 7. Return 204 No Content                                 │
└─────────────────────────────────────────────────────────┘
```

## Special Notes

### 1. Read-Modify-Write Race Condition

The biggest caveat of this endpoint is the **lost update problem**:

```
Time    Request A              Request B
────    ─────────              ─────────
T1      READ views = 100
T2                             READ views = 100
T3      WRITE views = 101
T4                             WRITE views = 101  ← Should be 102!
```

**Impact**: Under high concurrency, some view increments can be lost. For a reference application, this is acceptable -- view counts do not need to be perfectly accurate.

**Mitigations** (for production):
1. **Use a counter table**: Move `views` to a dedicated counter table with atomic `$inc`
2. **Lightweight Transaction (LWT)**: Use `IF views = expected_value` for conditional updates
3. **Accept approximate counts**: Many platforms show "1.2K views" rather than exact numbers
4. **Periodic reconciliation**: Count `video_activity` rows to reconcile the counter

### 2. 204 No Content Response

This endpoint returns **no response body**. The 204 status code tells the client "your request was processed successfully, but there is nothing to return." This is the correct HTTP semantic for a fire-and-forget action.

### 3. Anonymous vs. Authenticated Behavior

| What happens | Anonymous | Authenticated |
|-------------|-----------|---------------|
| View counter incremented | Yes | Yes |
| video_activity row created | Yes | Yes |
| user_activity row created | No | Yes |

Anonymous users contribute to view counts and global activity, but their individual actions are not tracked (no user ID to associate).

### 4. video_activity Partition Sizing

The `video_activity` table partitions by `day`. On a busy platform:

- 100K views/day = 100K rows per partition
- Each row is small (~50 bytes): videoid + timeuuid
- 100K * 50 bytes = ~5MB per daily partition

This is well within Cassandra's recommended partition size limit of 100MB. For much larger platforms, consider partitioning by `(day, hour)` or `(day, videoid)`.

### 5. TimeUUID Generation

The backend generates TimeUUIDs (UUID v1) for activity logging:

```python
from uuid import uuid1
watch_time = uuid1()  # Contains current timestamp + node ID
```

**Warning**: `uuid1()` in Python uses the machine's MAC address by default. In containerized environments, this may not be unique across instances. Some deployments use `uuid1(node=random_node_id)` or server-side TimeUUID generation.

### 6. No Duplicate View Protection

This endpoint does **not** prevent the same user from recording multiple views. Every call increments the counter. Rate limiting (if needed) must be handled at the application or API gateway level.

### 7. Idempotency

This endpoint is **not idempotent**. Calling it twice increments the view count twice and creates two activity records. This is intentional -- multiple views from the same user are valid (they watched the video multiple times).

## Developer Tips

### Common Pitfalls

1. **Calling on every seek/pause event**: Only call this endpoint once when playback starts, not on every player interaction. Multiple calls inflate view counts.

2. **Expecting a response body**: The 204 response has no body. Parsing `response.json()` will throw an error. Check `response.ok` or `response.status === 204` instead.

3. **Blocking the UI on view recording**: Fire this request and forget it. Do not show a loading spinner or block video playback waiting for a 204.

4. **Forgetting to handle 403/404**: Non-READY videos return errors for non-owners. Handle these cases in the UI.

5. **Not sending the auth token**: If the user is logged in, send the JWT so user_activity is recorded. Without it, the view is anonymous even for logged-in users.

### Best Practices

1. **Fire and forget**: Use a mutation without awaiting the result:
   ```typescript
   const recordView = useRecordViewMutation();

   useEffect(() => {
     recordView.mutate(videoId);
     // Do not await -- video playback should start immediately
   }, [videoId]);
   ```

2. **Call once per video load**: Record the view when the Watch page mounts, not on every player event.

3. **Include auth token when available**: Send the Authorization header so the backend can log to user_activity.

4. **Do not retry on failure**: If the view recording fails, do not retry. A missed view count is acceptable; duplicate counts from retries are worse.

5. **Handle 204 correctly**:
   ```typescript
   const response = await fetch(`/api/v1/videos/id/${videoId}/view`, {
     method: 'POST'
   });
   if (response.status === 204) {
     // Success -- no body to parse
   }
   ```

### Query Performance Expectations

| Operation | Latency | Notes |
|-----------|---------|-------|
| Read current views | **< 5ms** | Partition key lookup |
| Write new view count | **< 5ms** | Partition key update |
| Insert video_activity | **< 5ms** | Append to time-series |
| Insert user_activity | **< 5ms** | Append to time-series |
| **Total (authenticated)** | **< 20ms** | Four sequential operations |
| **Total (anonymous)** | **< 15ms** | Three operations (no user_activity) |

### Testing Tips

```bash
# Record a view (anonymous)
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "http://localhost:8080/api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890/view"
# Expected: 204

# Record a view (authenticated)
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "http://localhost:8080/api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890/view" \
  -H "Authorization: Bearer <jwt_token>"
# Expected: 204

# Verify view count increased
curl -s "http://localhost:8080/api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890" | jq .views

# Test non-existent video (should return 404)
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "http://localhost:8080/api/v1/videos/id/00000000-0000-0000-0000-000000000000/view"
# Expected: 404
```

## Related Endpoints

- [GET /api/v1/videos/id/{video_id}](./GET_video_by_id.md) - Retrieve the video (including view count)
- [GET /api/v1/videos/trending](./GET_videos_trending.md) - Trending videos use view counts from this endpoint
- [POST /api/v1/videos/id/{video_id}/rating](./POST_video_rating.md) - Another user action that logs to user_activity

## Further Learning

- [Cassandra Counter Columns](https://cassandra.apache.org/doc/latest/cassandra/cql/types.html#counters)
- [Time-Series Data Modeling in Cassandra](https://www.datastax.com/blog/time-series-data-modeling-cassandra)
- [TimeUUID Explained](https://www.datastax.com/blog/uuid-vs-timeuuid)
- [Lost Update Problem](https://en.wikipedia.org/wiki/Write%E2%80%93write_conflict)
