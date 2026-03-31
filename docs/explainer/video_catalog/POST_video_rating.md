# POST /api/v1/videos/id/{video_id}/rating - Submit Star Rating

## Overview

This endpoint allows an authenticated user to submit a 1-5 star rating for a video. It records the individual rating and updates the aggregate counter used to compute the video's average rating.

**Why it exists**: Star ratings are the primary feedback mechanism for video quality. They feed into the average rating displayed on each video, help viewers decide what to watch, and provide creators with quality signals. The endpoint supports both new ratings and updates to existing ratings (upsert semantics).

**Design challenge**: The rating system must maintain two separate data stores -- individual ratings per user and aggregate counters -- while keeping them consistent. Cassandra's counter columns handle atomic increments, but the logic for updating (vs. creating) a rating requires careful handling.

## HTTP Details

- **Method**: POST
- **Path**: `/api/v1/videos/id/{video_id_path}/rating`
- **Auth Required**: Yes (JWT Bearer token required)
- **Success Status**: 204 No Content
- **Handler**: `app/api/v1/endpoints/video_catalog.py`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `video_id_path` | UUID | Yes | The video being rated |

### Request Body

```json
{
  "rating": 4
}
```

| Field | Type | Required | Range | Description |
|-------|------|----------|-------|-------------|
| `rating` | integer | Yes | 1-5 | Star rating value |

### Response

**204 No Content** -- empty response body on success.

### Error Responses

| Status | Condition |
|--------|-----------|
| 401 | Missing or invalid JWT token |
| 422 | Invalid UUID, missing rating, or rating outside 1-5 range |

## Cassandra Concepts Explained

### What Are Counter Columns?

Cassandra has a special column type called `counter` that supports **atomic increment and decrement** operations:

```cql
-- Counter update (atomic, no read needed)
UPDATE video_ratings SET rating_counter = rating_counter + 1,
                         rating_total = rating_total + 4
WHERE videoid = ?;
```

**Key properties of counter columns**:
- Only operation allowed is increment/decrement (no direct SET)
- Atomic -- concurrent updates do not lose counts
- All non-key columns in a counter table must be counters
- Cannot mix counter and non-counter columns in the same table

**Analogy**: Think of a mechanical counter (like a tally clicker). Multiple people can click simultaneously, and each click is always counted. You cannot "set" it to a specific number -- you can only click (increment) or un-click (decrement).

### Upsert Semantics

An **upsert** is an operation that inserts a new row if none exists, or updates the existing row if one does. In Cassandra, all writes are naturally upserts:

```cql
-- This INSERT works as both "create" and "update"
INSERT INTO video_ratings_by_user (videoid, userid, rating, rating_date)
VALUES (?, ?, 4, '2025-10-31T14:30:00Z');
```

If the `(videoid, userid)` combination already exists, the row is overwritten. If it does not exist, a new row is created. No `IF EXISTS` check is needed.

**Why this matters for ratings**: A user can change their mind. If they rated a video 3 stars and later rate it 5 stars, the upsert naturally replaces the old rating.

### Counter Table Separation

Notice that individual ratings and aggregate counts live in **separate tables**:

```
video_ratings_by_user   → Individual: "User X gave Video Y 4 stars"
video_ratings           → Aggregate:  "Video Y has 150 ratings totaling 620 points"
```

**Why separate?**
- Counter tables cannot have non-counter columns (Cassandra restriction)
- Individual ratings need a `rating` int and `rating_date` timestamp -- these are not counters
- The aggregate table needs `rating_counter` and `rating_total` -- these must be counters

### Computing Averages from Counters

The average rating is not stored directly. It is computed on read:

```
average = rating_total / rating_counter
        = 620 / 150
        = 4.13 stars
```

**Why not store the average?**
- Counter tables only support increment/decrement, not division
- Computing on read is fast (single division operation)
- Avoids floating-point precision issues in storage

## Data Model

### Table: `video_ratings_by_user` (individual ratings)

```cql
CREATE TABLE killrvideo.video_ratings_by_user (
    videoid uuid,                       -- Which video was rated
    userid uuid,                        -- Who rated it
    rating int,                         -- Star value (1-5)
    rating_date timestamp,              -- When the rating was submitted
    PRIMARY KEY (videoid, userid)        -- Partition by video, cluster by user
) WITH CLUSTERING ORDER BY (userid ASC);
```

**Key Characteristics**:
- **Partition Key**: `videoid` -- all ratings for a video are co-located
- **Clustering Key**: `userid` -- each user can have exactly one rating per video
- **Upsert behavior**: Writing the same `(videoid, userid)` pair overwrites the previous rating
- **Efficient for**: "Get all ratings for video X" and "Get user Y's rating for video X"

### Table: `video_ratings` (counter summary)

```cql
CREATE TABLE killrvideo.video_ratings (
    videoid uuid PRIMARY KEY,           -- One row per video
    rating_counter counter,             -- Number of ratings received
    rating_total counter                -- Sum of all rating values
);
```

**Key Characteristics**:
- **Partition Key**: `videoid` -- one summary row per video
- **Counter columns**: `rating_counter` and `rating_total` support atomic increments
- **Average**: Computed as `rating_total / rating_counter` at read time
- **No non-counter columns allowed**: This is a Cassandra restriction for counter tables

## Database Queries

### 1. Check for Existing Rating

**Service Function**: `video_service.record_rating()`

```python
async def record_rating(video_id: UUID, user_id: UUID, rating: int):
    ratings_by_user = await get_table("video_ratings_by_user")

    # Check if this user has already rated this video
    existing = await ratings_by_user.find_one(
        filter={"videoid": str(video_id), "userid": str(user_id)}
    )
    old_rating = existing.get("rating") if existing else None
```

**Equivalent CQL**:
```cql
SELECT rating FROM killrvideo.video_ratings_by_user
WHERE videoid = a1b2c3d4-e5f6-7890-abcd-ef1234567890
  AND userid = 550e8400-e29b-41d4-a716-446655440000;
```

**Performance**: **O(1)** -- Direct partition + clustering key lookup.

### 2. Upsert Individual Rating

```python
    # Upsert the individual rating (insert or overwrite)
    await ratings_by_user.update_one(
        filter={"videoid": str(video_id), "userid": str(user_id)},
        update={"$set": {
            "rating": rating,
            "rating_date": datetime.now(timezone.utc).isoformat()
        }}
    )
```

**Equivalent CQL**:
```cql
INSERT INTO killrvideo.video_ratings_by_user (videoid, userid, rating, rating_date)
VALUES (
    a1b2c3d4-e5f6-7890-abcd-ef1234567890,
    550e8400-e29b-41d4-a716-446655440000,
    4,
    '2025-10-31T14:30:00Z'
);
```

**Performance**: **O(1)** -- Single partition write.

### 3. Update Counter Summary

The counter update depends on whether this is a new rating or an update:

```python
    ratings_table = await get_table("video_ratings")

    if old_rating is None:
        # New rating: increment count by 1, add rating value to total
        counter_increment = 1
        total_increment = rating
    else:
        # Updated rating: count stays the same, adjust total by difference
        counter_increment = 0
        total_increment = rating - old_rating

    # Attempt atomic increment via $inc
    try:
        await ratings_table.update_one(
            filter={"videoid": str(video_id)},
            update={"$inc": {
                "rating_counter": counter_increment,
                "rating_total": total_increment
            }}
        )
    except Exception:
        # Fallback: read-modify-write if $inc is not supported
        current = await ratings_table.find_one(
            filter={"videoid": str(video_id)}
        )
        current_counter = current.get("rating_counter", 0) if current else 0
        current_total = current.get("rating_total", 0) if current else 0

        await ratings_table.update_one(
            filter={"videoid": str(video_id)},
            update={"$set": {
                "rating_counter": current_counter + counter_increment,
                "rating_total": current_total + total_increment
            }}
        )
```

**Equivalent CQL** (atomic counter update):
```cql
-- New rating (user hasn't rated before)
UPDATE killrvideo.video_ratings
SET rating_counter = rating_counter + 1,
    rating_total = rating_total + 4
WHERE videoid = a1b2c3d4-e5f6-7890-abcd-ef1234567890;

-- Updated rating (e.g., changed from 3 to 4)
UPDATE killrvideo.video_ratings
SET rating_total = rating_total + 1  -- difference: 4 - 3 = 1
WHERE videoid = a1b2c3d4-e5f6-7890-abcd-ef1234567890;
-- rating_counter unchanged (same user, same video)
```

**Performance**: **O(1)** -- Counter updates are single-partition writes.

### 4. Log to user_activity

```python
    # Record the rating action in user's activity timeline
    user_activity = await get_table("user_activity")
    await user_activity.insert_one(document={
        "userid": str(user_id),
        "day": date.today().isoformat(),
        "activity_type": "rate",
        "activity_id": str(uuid1()),
        "activity_timestamp": datetime.now(timezone.utc).isoformat()
    })
```

**Equivalent CQL**:
```cql
INSERT INTO killrvideo.user_activity (
    userid, day, activity_type, activity_id, activity_timestamp
) VALUES (
    550e8400-e29b-41d4-a716-446655440000,
    '2025-10-31',
    'rate',
    now(),
    '2025-10-31T14:30:00Z'
);
```

## Implementation Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. Client sends POST /videos/id/{video_id}/rating        │
│    Authorization: Bearer <jwt>                          │
│    { "rating": 4 }                                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. FastAPI Endpoint                                      │
│    ├─ Validates JWT (401 if invalid)                    │
│    ├─ Validates rating 1-5 (422 if out of range)        │
│    └─ Extracts user_id from JWT                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Check for Existing Rating                             │
│    SELECT rating FROM video_ratings_by_user              │
│    WHERE videoid = ? AND userid = ?                     │
│    ├─ Found: old_rating = existing value (update case)  │
│    └─ Not found: old_rating = None (new rating case)    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Upsert Individual Rating                              │
│    INSERT INTO video_ratings_by_user                     │
│    (videoid, userid, rating, rating_date)               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Update Counter Summary                                │
│    ├─ New: rating_counter += 1, rating_total += rating  │
│    └─ Update: rating_total += (new - old)               │
│    Uses $inc if available, else read-modify-write       │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 6. Log to user_activity (activity_type = 'rate')         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 7. Return 204 No Content                                 │
└─────────────────────────────────────────────────────────┘
```

## Special Notes

### 1. New Rating vs. Updated Rating

The counter logic differs based on whether the user has rated before:

| Scenario | Counter Change | Total Change |
|----------|---------------|--------------|
| **New rating** (first time) | +1 | +rating |
| **Updated rating** (e.g., 3 to 5) | 0 | +(new - old) = +2 |
| **Same rating** (e.g., 4 to 4) | 0 | 0 (no-op) |

This ensures the average calculation remains accurate when users change their rating.

### 2. Counter Consistency

Counter updates are **eventually consistent** in Cassandra. In rare cases:

- Two simultaneous counter increments will both be applied (no lost updates)
- Reading the counter immediately after writing may return the old value
- Within a few milliseconds, all replicas converge

This is the key advantage of counter columns over the read-modify-write pattern used for view counts.

### 3. $inc Operator with Fallback

The Data API's Table API may or may not support `$inc` for counter columns depending on the version. The backend tries `$inc` first (atomic) and falls back to read-modify-write if it fails:

```python
try:
    await table.update_one(update={"$inc": {...}})  # Preferred: atomic
except Exception:
    # Fallback: read current, compute new, write back
```

In production, verify which approach your Astra DB version supports and use the atomic path.

### 4. No Cascading Validation

The endpoint does **not** verify that the video exists before accepting a rating. If you rate a non-existent video:

- `video_ratings_by_user` gets a row (orphaned rating)
- `video_ratings` counter gets incremented (orphaned counter)

**Why**: The extra read to validate the video adds latency. Since ratings come from the Watch page (which already loaded the video), the video is overwhelmingly likely to exist.

### 5. Activity Logging for Both New and Updated Ratings

The backend writes to `user_activity` for **every** rating action, including updates. This means a user who changes their rating from 3 to 5 will have two "rate" entries in their activity timeline. This is intentional -- it provides a complete audit trail.

### 6. Rating Constraints

| Constraint | Enforced By | Level |
|------------|------------|-------|
| Rating 1-5 range | Pydantic validation | API layer |
| One rating per user per video | `(videoid, userid)` primary key | Database layer |
| Must be authenticated | JWT middleware | API layer |
| Integer only (no 3.5) | Pydantic `int` type | API layer |

## Developer Tips

### Common Pitfalls

1. **Forgetting to send the JWT**: This endpoint requires authentication. A 401 response means the token is missing or expired.

2. **Sending float ratings**: The API accepts integers only. `3.5` will cause a 422 error. Round to the nearest integer on the client side.

3. **Rating 0 stars**: The minimum is 1, not 0. A rating of 0 returns 422.

4. **Expecting a response body**: Like the view endpoint, this returns 204 with no body.

5. **Not updating the UI optimistically**: After submitting a rating, update the star display immediately without waiting for a server response. Revert on error.

### Best Practices

1. **Optimistic UI updates**: Show the new rating instantly, then sync with server:
   ```typescript
   const submitRating = async (rating: number) => {
     setDisplayedRating(rating);  // Instant UI update
     try {
       await api.submitRating(videoId, rating);
     } catch (error) {
       setDisplayedRating(previousRating);  // Revert on failure
     }
   };
   ```

2. **Invalidate the rating summary cache**: After submitting a rating, invalidate the GET rating query so it refetches:
   ```typescript
   queryClient.invalidateQueries(['video-rating', videoId]);
   ```

3. **Debounce rapid clicks**: If a user clicks through multiple stars quickly (1, 2, 3, 4, 5), only send the final value. Debounce by 500ms.

4. **Show the user's existing rating**: Fetch the rating summary (which includes the user's rating) before showing the star component.

5. **Handle the 204 response correctly**:
   ```typescript
   const response = await fetch(url, { method: 'POST', body: JSON.stringify({ rating }) });
   if (response.status === 204) {
     // Success: no body to parse
   }
   ```

### Query Performance Expectations

| Operation | Latency | Notes |
|-----------|---------|-------|
| Check existing rating | **< 5ms** | Partition + clustering key |
| Upsert individual rating | **< 5ms** | Single partition write |
| Update counter ($inc) | **< 5ms** | Atomic counter update |
| Update counter (fallback) | **< 10ms** | Read + write |
| Log user_activity | **< 5ms** | Append to time-series |
| **Total** | **< 20ms** | Four sequential operations |

### Testing Tips

```bash
# Submit a new 4-star rating
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "http://localhost:8080/api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890/rating" \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"rating": 4}'
# Expected: 204

# Update to 5 stars (same user, same video)
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "http://localhost:8080/api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890/rating" \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"rating": 5}'
# Expected: 204

# Verify via rating summary
curl -s "http://localhost:8080/api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890/rating" | jq

# Test without auth (should return 401)
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "http://localhost:8080/api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890/rating" \
  -H "Content-Type: application/json" \
  -d '{"rating": 4}'
# Expected: 401

# Test invalid rating value (should return 422)
curl -s -X POST \
  "http://localhost:8080/api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890/rating" \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"rating": 6}' | jq
# Expected: 422
```

## Related Endpoints

- [GET /api/v1/videos/id/{video_id}/rating](./GET_video_rating.md) - Retrieve the rating summary
- [POST /api/v1/videos/id/{video_id}/view](./POST_video_view.md) - Another user action with similar patterns
- [GET /api/v1/videos/id/{video_id}](./GET_video_by_id.md) - Video details page where ratings are displayed

## Further Learning

- [Cassandra Counter Columns](https://cassandra.apache.org/doc/latest/cassandra/cql/types.html#counters)
- [Upsert Pattern in Cassandra](https://www.datastax.com/blog/lightweight-transactions-in-cassandra-20)
- [Star Rating UX Best Practices](https://www.nngroup.com/articles/rating-scales/)
