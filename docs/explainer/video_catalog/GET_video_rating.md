# GET /api/v1/videos/id/{video_id}/rating - Get Rating Summary

## Overview

This endpoint retrieves the aggregate rating summary for a video, including the average star rating and total number of ratings. It powers the star rating display shown beneath every video on the platform.

**Why it exists**: Viewers need a quick quality signal before deciding to watch a video. The average rating and rating count provide social proof -- "4.3 stars from 150 ratings" tells you the community thinks this video is good. This endpoint computes that summary from Cassandra counter columns in real time.

**Key insight**: The average rating is not stored directly in the database. Instead, Cassandra stores two counters (total rating points and number of ratings), and the backend computes the average via simple division on every read.

## HTTP Details

- **Method**: GET
- **Path**: `/api/v1/videos/id/{video_id_path}/rating`
- **Auth Required**: No (public endpoint)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/video_catalog.py`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `video_id_path` | UUID | Yes | The video to get ratings for |

### Example Request

```http
GET /api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890/rating
```

### Response Body

```json
{
  "videoId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "averageRating": 4.13,
  "ratingCount": 150
}
```

| Field | Type | Description |
|-------|------|-------------|
| `videoId` | UUID | The video's identifier |
| `averageRating` | number | Computed average (rating_total / rating_counter) |
| `ratingCount` | integer | Total number of ratings received |

### Special Cases

| Scenario | Response |
|----------|----------|
| Video has ratings | `{ averageRating: 4.13, ratingCount: 150 }` |
| Video has no ratings | `{ averageRating: 0, ratingCount: 0 }` |
| Video does not exist | `{ averageRating: 0, ratingCount: 0 }` (no 404) |

### Error Responses

| Status | Condition |
|--------|-----------|
| 422 | Invalid UUID format |

## Cassandra Concepts Explained

### Counter-Based Aggregation

Instead of storing every individual rating and computing the average with `AVG()`, Cassandra uses **counter columns** to maintain running totals:

```
Traditional SQL approach:
  SELECT AVG(rating) FROM ratings WHERE videoid = ?
  → Scans ALL rows, computes average (slow at scale)

Cassandra counter approach:
  SELECT rating_total, rating_counter FROM video_ratings WHERE videoid = ?
  → Single row read, divide in application (fast always)
```

**Why counters win at scale**:

| Approach | 10 ratings | 1M ratings | 100M ratings |
|----------|------------|------------|--------------|
| SQL AVG() | < 1ms | ~500ms | ~30s |
| Counter read + divide | < 5ms | < 5ms | < 5ms |

The counter approach is **O(1)** regardless of how many ratings exist because it reads a single row, not scanning individual ratings.

### How Counter Columns Work Internally

When a counter is incremented, Cassandra does not read-then-write. Instead:

1. The increment instruction is written to the commit log
2. The memtable stores the delta (e.g., +1)
3. During compaction, deltas are merged into a single value
4. Reads sum up all deltas from memtables and SSTables

**Analogy**: Instead of a bank checking your balance before every deposit, they just record "+$50" in a ledger. When you check your balance, they add up all the deposits and withdrawals. This is much faster when many people are depositing simultaneously.

### Why Not Store the Average Directly?

You might wonder: "Why not just store `average_rating = 4.13` and update it on each new rating?"

**Problems with storing averages**:
1. **Cassandra counters cannot store floats** -- counter columns are 64-bit integers
2. **Updating an average requires the count**: `new_avg = (old_avg * count + new_rating) / (count + 1)` -- this is a read-modify-write with race conditions
3. **Counter approach is naturally concurrent**: Multiple simultaneous ratings do not interfere

**The math is simple**:
```
average = rating_total / rating_counter
        = (4 + 5 + 3 + 4 + 5) / 5
        = 21 / 5
        = 4.2
```

### Reading Counter Values

Counter reads in Cassandra have the same performance as regular column reads. The value is reconstructed from SSTables and memtables during the read path:

```cql
SELECT rating_counter, rating_total FROM video_ratings WHERE videoid = ?;
```

This is a single partition key lookup -- **O(1)** time complexity.

## Data Model

### Table: `video_ratings` (counter summary)

```cql
CREATE TABLE killrvideo.video_ratings (
    videoid uuid PRIMARY KEY,           -- One summary row per video
    rating_counter counter,             -- Total number of ratings
    rating_total counter                -- Sum of all rating values
);
```

**Key Characteristics**:
- **Partition Key**: `videoid` -- each video has exactly one summary row
- **Counter columns**: Both `rating_counter` and `rating_total` are counters
- **No initialization needed**: Counters start at 0 implicitly
- **Restrictions**: Cannot have non-counter columns, cannot use INSERT (only UPDATE)

### Table: `video_ratings_by_user` (individual ratings, for reference)

```cql
CREATE TABLE killrvideo.video_ratings_by_user (
    videoid uuid,                       -- Which video
    userid uuid,                        -- Which user
    rating int,                         -- Their rating (1-5)
    rating_date timestamp,              -- When they rated
    PRIMARY KEY (videoid, userid)
) WITH CLUSTERING ORDER BY (userid ASC);
```

This table is primarily used by the POST endpoint to track individual ratings, but it could also be queried to show a user their own rating for a video.

## Database Queries

### 1. Read Counter Summary

**Service Function**: `video_service.get_rating_summary()`

```python
async def get_rating_summary(video_id: UUID):
    table = await get_table("video_ratings")

    # Read the counter row for this video
    result = await table.find_one(
        filter={"videoid": str(video_id)}
    )

    if not result:
        # No ratings yet -- return zeros
        return {
            "videoId": str(video_id),
            "averageRating": 0,
            "ratingCount": 0
        }

    rating_counter = result.get("rating_counter", 0)
    rating_total = result.get("rating_total", 0)

    # Compute average (guard against division by zero)
    average = round(rating_total / rating_counter, 2) if rating_counter > 0 else 0

    return {
        "videoId": str(video_id),
        "averageRating": average,
        "ratingCount": rating_counter
    }
```

**Equivalent CQL**:
```cql
SELECT rating_counter, rating_total
FROM killrvideo.video_ratings
WHERE videoid = a1b2c3d4-e5f6-7890-abcd-ef1234567890;
```

**Performance**: **O(1)** -- Direct partition key lookup. Returns a single row with two counter values.

### 2. Application-Side Average Calculation

```python
# The division happens in Python, not in CQL
average = rating_total / rating_counter

# Example:
# rating_total = 620, rating_counter = 150
# average = 620 / 150 = 4.133...
# Rounded to 2 decimal places: 4.13
```

**Why not in CQL?** Cassandra's CQL does not support arithmetic expressions in SELECT statements:

```cql
-- This does NOT work in CQL:
SELECT rating_total / rating_counter AS average FROM video_ratings WHERE videoid = ?;
-- Error: division is not supported
```

The computation must happen in the application layer.

## Implementation Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. Client sends GET /videos/id/{video_id}/rating         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. FastAPI Endpoint                                      │
│    ├─ Validates UUID format (422 if invalid)            │
│    └─ Calls video_service.get_rating_summary()          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Read Counter Row                                      │
│    SELECT rating_counter, rating_total                   │
│    FROM video_ratings WHERE videoid = ?                  │
│    ├─ Found: proceed with calculation                   │
│    └─ Not found: return zeros                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Compute Average                                       │
│    average = rating_total / rating_counter              │
│    ├─ rating_counter > 0: compute and round             │
│    └─ rating_counter = 0: average = 0                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Return 200 OK                                         │
│    { videoId, averageRating, ratingCount }              │
└─────────────────────────────────────────────────────────┘
```

**Code Flow**:
1. **Endpoint** receives the video UUID
2. **Validation** ensures UUID format is correct
3. **Counter Read** fetches the single summary row from `video_ratings`
4. **Average Computation** divides total by count (with zero-guard)
5. **Response** returns the computed summary

## Special Notes

### 1. No 404 for Unrated Videos

Unlike most "get by ID" endpoints, this one does **not** return 404 for videos that have no ratings. Instead, it returns a valid response with `averageRating: 0` and `ratingCount: 0`. This simplifies the frontend -- it does not need to handle a "no ratings yet" error case separately.

### 2. No Video Existence Check

The endpoint does not verify that the `video_id` corresponds to an existing video. Requesting ratings for a non-existent video returns the same `{ averageRating: 0, ratingCount: 0 }` as an unrated video.

**Why**: Adding a video existence check would require an extra read from the `videos` table, doubling latency for a common endpoint. The frontend already knows the video exists (it loaded the Watch page first).

### 3. Eventual Consistency of Counters

Counter values in Cassandra are **eventually consistent**. After a new rating is submitted:

| Time | Counter State |
|------|--------------|
| T+0ms | Rating submitted (counter incremented on one replica) |
| T+1ms | Read may return old value (other replicas not yet updated) |
| T+5ms | All replicas converged (counter is accurate) |

For most practical purposes, this delay is imperceptible. If you need strict accuracy, use `CONSISTENCY ALL` for reads (at the cost of higher latency).

### 4. Precision and Rounding

The average is rounded to 2 decimal places:

```python
average = round(rating_total / rating_counter, 2)
```

This avoids returning values like `4.133333333333333`. The frontend can further format this (e.g., showing one decimal place: "4.1 stars").

### 5. Counter Overflow

Counter columns are 64-bit signed integers. The maximum value is `2^63 - 1 = 9,223,372,036,854,775,807`. For a video rating system:

- `rating_counter` would overflow after ~9.2 quintillion ratings (not a concern)
- `rating_total` would overflow after ~1.8 quintillion ratings at max value of 5

In practice, counter overflow is not a real-world concern for this use case.

### 6. Counter Reset Limitation

Cassandra counters **cannot be reset to zero**. If you need to recalculate ratings from scratch (e.g., after removing spam ratings), you must:

1. Delete the counter row: `DELETE FROM video_ratings WHERE videoid = ?`
2. Re-increment from individual ratings in `video_ratings_by_user`

This is a deliberate trade-off in Cassandra's design -- counters optimize for increment/decrement, not arbitrary sets.

## Developer Tips

### Common Pitfalls

1. **Dividing by zero**: Always check `ratingCount > 0` before dividing. A video with zero ratings should show "No ratings yet," not crash.

2. **Caching too aggressively**: Ratings change frequently. Use a SHORT stale time (30 seconds) in React Query.

3. **Showing raw floats**: `4.133333` looks unprofessional. Round to one decimal for display: "4.1 stars."

4. **Expecting the user's own rating**: This endpoint returns the aggregate only. To show "You rated this 4 stars," you need to check `video_ratings_by_user` separately or use the companion endpoint that includes `currentUserRating`.

5. **Parsing the response as an array**: This returns a single object, not an array. Do not wrap it in `data[0]`.

### Best Practices

1. **Display stars with partial fill**: Use the decimal average to show partially filled stars:
   ```
   4.3 → ★★★★☆ (4 full + 30% fill on 5th)
   ```

2. **Show both average and count**: "4.3 (150 ratings)" is more informative than just "4.3 stars."

3. **Fetch alongside video details**: Load the rating summary in parallel with the video details to avoid a sequential loading cascade:
   ```typescript
   const { data: video } = useVideoById(videoId);
   const { data: rating } = useVideoRating(videoId);  // Parallel fetch
   ```

4. **Cache with React Query**: The rating summary is a good candidate for caching since it changes relatively slowly:
   ```typescript
   useQuery(['video-rating', videoId], () => api.getVideoRating(videoId), {
     staleTime: 30_000  // 30 seconds
   });
   ```

5. **Handle the zero-rating state gracefully**:
   ```typescript
   if (rating.ratingCount === 0) {
     return <span className="text-muted">No ratings yet</span>;
   }
   return <StarRating value={rating.averageRating} count={rating.ratingCount} />;
   ```

6. **Invalidate after submitting a rating**: When the user rates a video, invalidate this query so the new average appears:
   ```typescript
   queryClient.invalidateQueries(['video-rating', videoId]);
   ```

### Query Performance Expectations

| Operation | Latency | Notes |
|-----------|---------|-------|
| Read counter row | **< 5ms** | Single partition key lookup |
| Compute average | **< 0.01ms** | Simple division in Python |
| **Total** | **< 5ms** | One DB read + arithmetic |

This is one of the fastest endpoints in the API -- a single partition key lookup with trivial computation.

### Testing Tips

```bash
# Get rating summary
curl -s "http://localhost:8080/api/v1/videos/id/a1b2c3d4-e5f6-7890-abcd-ef1234567890/rating" | jq

# Expected output:
# {
#   "videoId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
#   "averageRating": 4.13,
#   "ratingCount": 150
# }

# Get rating for unrated video (should return zeros, not 404)
curl -s "http://localhost:8080/api/v1/videos/id/00000000-0000-0000-0000-000000000000/rating" | jq

# Expected output:
# {
#   "videoId": "00000000-0000-0000-0000-000000000000",
#   "averageRating": 0,
#   "ratingCount": 0
# }

# Test invalid UUID (should return 422)
curl -s "http://localhost:8080/api/v1/videos/id/not-a-uuid/rating" | jq

# Full workflow: rate then check summary
TOKEN="<jwt_token>"
VIDEO="a1b2c3d4-e5f6-7890-abcd-ef1234567890"

# Submit rating
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "http://localhost:8080/api/v1/videos/id/$VIDEO/rating" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rating": 5}'

# Check updated summary
curl -s "http://localhost:8080/api/v1/videos/id/$VIDEO/rating" | jq
```

## Related Endpoints

- [POST /api/v1/videos/id/{video_id}/rating](./POST_video_rating.md) - Submit or update a rating
- [GET /api/v1/videos/id/{video_id}](./GET_video_by_id.md) - Video details (displayed alongside the rating)
- [GET /api/v1/videos/trending](./GET_videos_trending.md) - Trending may factor in ratings in the future

## Further Learning

- [Cassandra Counter Columns](https://cassandra.apache.org/doc/latest/cassandra/cql/types.html#counters)
- [Distributed Counters Explained](https://www.datastax.com/blog/distributed-counters-in-cassandra)
- [Star Rating UI Patterns](https://www.nngroup.com/articles/rating-scales/)
- [Eventual Consistency in Cassandra](https://cassandra.apache.org/doc/latest/cassandra/architecture/guarantees.html)
