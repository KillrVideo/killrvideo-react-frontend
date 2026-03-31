# GET /api/v1/videos/{video_id}/ratings -- Get Ratings Summary

## 1. Overview

This endpoint returns the aggregate rating statistics for a video: the average star
rating and total number of ratings. If the caller is authenticated, it also returns
the current user's individual rating for that video.

This is the endpoint that powers the star rating display on every video page -- the
"4.2 stars (127 ratings)" line you see beneath a video player.

The endpoint demonstrates two Cassandra concepts:

- **Counter-based aggregation** -- reading pre-computed counters is dramatically
  faster than scanning all individual ratings and computing an average at query time
- **Optional auth enrichment** -- the same endpoint returns different levels of detail
  depending on whether the caller provides a JWT token

---

## 2. HTTP Details

### Request

```
GET /api/v1/videos/{video_id}/ratings
```

| Detail            | Value                                     |
|-------------------|-------------------------------------------|
| **Method**        | GET                                       |
| **Path**          | `/api/v1/videos/{video_id}/ratings`       |
| **Authentication**| Optional (public, but enriched with auth)  |

#### Path Parameters

| Parameter   | Type   | Required | Description                    |
|-------------|--------|----------|--------------------------------|
| `video_id`  | UUID   | Yes      | The UUID of the video          |

### Response -- 200 OK

Returns an `AggregateRatingResponse` object:

#### Unauthenticated Response (no JWT)

```json
{
  "videoId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "averageRating": 4.2,
  "totalRatingsCount": 127,
  "currentUserRating": null
}
```

#### Authenticated Response (with JWT)

```json
{
  "videoId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "averageRating": 4.2,
  "totalRatingsCount": 127,
  "currentUserRating": 5
}
```

#### Field Details

| Field               | Type        | Nullable | Description                                           |
|---------------------|-------------|----------|-------------------------------------------------------|
| `videoId`           | UUID string | No       | The video these ratings are for                       |
| `averageRating`     | number      | Yes      | Average rating (null if no ratings yet)               |
| `totalRatingsCount` | integer     | No       | Total number of users who have rated (default: 0)     |
| `currentUserRating` | integer     | Yes      | The authenticated user's rating (null if not rated or not logged in) |

### Error Responses

| Status | Meaning          | When                                    |
|--------|------------------|-----------------------------------------|
| 422    | Validation Error | Invalid UUID format                     |

---

## 3. Cassandra Concepts Explained

### Counter-Based Aggregation: Pre-Computed Totals

In a relational database, you might compute a video's average rating with:

```sql
-- Relational approach: compute on the fly
SELECT AVG(rating), COUNT(*) FROM ratings WHERE video_id = ?;
```

This scans every individual rating row, sums them up, and divides. For a video with
10,000 ratings, that is 10,000 rows to read.

Cassandra's approach is different. Instead of computing aggregates at read time,
KillrVideo **maintains running totals** using counter columns:

```sql
-- Cassandra approach: read pre-computed counters
SELECT rating_counter, rating_total FROM video_ratings WHERE videoid = ?;
-- Average = rating_total / rating_counter
```

This reads exactly **one row** regardless of how many individual ratings exist. The
counters were updated incrementally each time someone rated the video.

**Analogy:** Imagine a restaurant that tracks its average customer satisfaction score.

- **Relational approach:** At the end of each day, go through every feedback card
  ever submitted and calculate the average from scratch.
- **Counter approach:** Keep a running tally on a whiteboard: "Total cards: 847,
  Total score: 3,612." When a new card comes in, add 1 to the count and add the
  score to the total. To get the average, just divide: 3,612 / 847 = 4.27.

The counter approach is dramatically faster for reads, especially as the number of
ratings grows.

### Trade-Offs of Counter Aggregation

| Advantage                    | Disadvantage                                    |
|------------------------------|-------------------------------------------------|
| O(1) read performance        | Counters can drift due to retries/race conditions|
| No table scan needed         | Cannot recompute without scanning individual table|
| Scales to millions of ratings| Counter tables have strict schema restrictions   |

### Optional Auth Enrichment

This endpoint accepts an *optional* JWT token. The behavior changes based on
authentication:

```
                     +-----------------+
                     | GET /ratings    |
                     +-----------------+
                            |
                    +-------+-------+
                    |               |
              [No JWT]         [Has JWT]
                    |               |
              Read counters    Read counters
              only             + read user's
                    |          individual rating
                    |               |
              Return:          Return:
              avg + count      avg + count
              userRating=null  + userRating=4
```

This pattern is common in APIs where public data is available to everyone, but
authenticated users get personalized information layered on top.

**Why not make it two separate endpoints?** Combining them into one reduces the
number of API calls the frontend needs to make when loading a video page. One
request gives you everything you need to render the star rating component.

### Computing the Average

The average rating is not stored directly -- it is computed from the two counters:

```
averageRating = rating_total / rating_counter
```

For example:
- 5 users rated the video: 5, 4, 4, 3, 5 stars
- `rating_counter` = 5
- `rating_total` = 5 + 4 + 4 + 3 + 5 = 21
- `averageRating` = 21 / 5 = 4.2

If `rating_counter` is 0 (no one has rated the video), `averageRating` is returned
as `null` to avoid division by zero.

---

## 4. Data Model

### Table: `video_ratings` (counter-based aggregates)

```sql
CREATE TABLE killrvideo.video_ratings (
    videoid        uuid PRIMARY KEY,
    rating_counter counter,
    rating_total   counter
);
```

This table has one row per video. Each row stores:
- How many people have rated the video (`rating_counter`)
- The sum of all rating values (`rating_total`)

**Example data:**

```
 videoid                              | rating_counter | rating_total
--------------------------------------+----------------+--------------
 a1b2c3d4-e5f6-7890-abcd-ef1234567890 |            127 |          533
 99887766-5544-3322-1100-aabbccddeeff |             42 |          168
```

### Table: `video_ratings_by_user` (individual ratings)

```sql
CREATE TABLE killrvideo.video_ratings_by_user (
    videoid     uuid,
    userid      uuid,
    rating      int,
    rating_date timestamp,
    PRIMARY KEY (videoid, userid)
) WITH CLUSTERING ORDER BY (userid ASC);
```

This table stores one row per user-video combination. It is queried by this endpoint
only when the caller is authenticated (to fetch `currentUserRating`).

**Example data:**

```
 videoid       | userid        | rating | rating_date
---------------+---------------+--------+----------------------------
 a1b2c3d4-...  | 11223344-...  |      5 | 2026-03-18 10:15:00+0000
 a1b2c3d4-...  | f9e8d7c6-...  |      4 | 2026-03-19 14:30:00+0000
 a1b2c3d4-...  | aabbccdd-...  |      3 | 2026-03-17 08:45:00+0000
```

### How Both Tables Work Together

```
GET /videos/{id}/ratings (authenticated)

  Step 1: Read aggregate from video_ratings
  +----------+---------+-------+
  | videoid  | counter | total |
  | vid-1    |   127   |  533  |  --> averageRating = 533/127 = 4.2
  +----------+---------+-------+      totalRatingsCount = 127

  Step 2: Read individual from video_ratings_by_user
  +----------+--------+--------+
  | videoid  | userid | rating |
  | vid-1    | usr-A  |   5    |  --> currentUserRating = 5
  +----------+--------+--------+
```

---

## 5. Database Queries

### Backend: `rating_service.get_video_ratings_summary()`

```python
# Pseudocode based on the backend implementation
async def get_video_ratings_summary(
    video_id: UUID,
    user_id: Optional[UUID] = None   # None if unauthenticated
):
    # Step 1: Read aggregate counters
    counters = await ratings_counter_collection.find_one(
        filter={"videoid": video_id}
    )

    if counters:
        rating_counter = counters.get("rating_counter", 0)
        rating_total = counters.get("rating_total", 0)
        average = rating_total / rating_counter if rating_counter > 0 else None
    else:
        rating_counter = 0
        average = None

    # Step 2: Optionally read the current user's rating
    current_user_rating = None
    if user_id is not None:
        user_rating = await ratings_by_user_collection.find_one(
            filter={"videoid": video_id, "userid": user_id}
        )
        if user_rating:
            current_user_rating = user_rating["rating"]

    return {
        "videoId": video_id,
        "averageRating": round(average, 1) if average else None,
        "totalRatingsCount": rating_counter,
        "currentUserRating": current_user_rating,
    }
```

### Equivalent CQL Statements

#### Unauthenticated (public) -- 1 query

```sql
-- Read aggregate counters
SELECT rating_counter, rating_total
FROM killrvideo.video_ratings
WHERE videoid = a1b2c3d4-e5f6-7890-abcd-ef1234567890;
```

#### Authenticated -- 2 queries

```sql
-- Query 1: Read aggregate counters (same as above)
SELECT rating_counter, rating_total
FROM killrvideo.video_ratings
WHERE videoid = a1b2c3d4-e5f6-7890-abcd-ef1234567890;

-- Query 2: Read the authenticated user's individual rating
SELECT rating
FROM killrvideo.video_ratings_by_user
WHERE videoid = a1b2c3d4-e5f6-7890-abcd-ef1234567890
  AND userid = f9e8d7c6-b5a4-3210-9876-543210fedcba;
```

**Both queries are single-partition lookups** -- the fastest type of Cassandra query.

### Performance Characteristics

| Metric                       | Unauthenticated | Authenticated                |
|------------------------------|-----------------|------------------------------|
| Cassandra reads              | 1               | 2                            |
| Query type                   | Partition key   | Partition key (both)         |
| Data scanned                 | 1 row           | 1 row + 1 row               |
| Expected latency             | Sub-millisecond | Low single-digit ms          |
| Scales with number of ratings| No (O(1))       | No (O(1))                    |

The key insight: **reading the aggregate is always O(1)** regardless of how many
individual ratings exist. Whether a video has 5 ratings or 5 million, the counter
read takes the same amount of time.

---

## 6. Implementation Flow

```
Client (Browser)                    Backend API                     Cassandra
      |                                  |                              |
      |  GET /videos/{id}/ratings        |                              |
      |  [Optional: Authorization header]|                              |
      |--------------------------------->|                              |
      |                                  |                              |
      |                          [Check for JWT]                        |
      |                          [Extract user_id if present]           |
      |                                  |                              |
      |                                  |  SELECT rating_counter,      |
      |                                  |         rating_total         |
      |                                  |  FROM video_ratings          |
      |                                  |  WHERE videoid = ?           |
      |                                  |----------------------------->|
      |                                  |  counter=127, total=533      |
      |                                  |<-----------------------------|
      |                                  |                              |
      |                          [Compute average: 533/127 = 4.2]       |
      |                                  |                              |
      |                  (If authenticated)                              |
      |                                  |  SELECT rating               |
      |                                  |  FROM video_ratings_by_user  |
      |                                  |  WHERE videoid=? AND userid=?|
      |                                  |----------------------------->|
      |                                  |       rating = 5             |
      |                                  |<-----------------------------|
      |                                  |                              |
      |  200 OK                          |                              |
      |  {                               |                              |
      |    averageRating: 4.2,           |                              |
      |    totalRatingsCount: 127,       |                              |
      |    currentUserRating: 5          |                              |
      |  }                               |                              |
      |<---------------------------------|                              |
```

---

## 7. Special Notes

### Astra DB / DataStax Considerations

- **Counter reads via Data API:** The Data API returns counter values as regular
  integers in JSON responses. There is no special handling needed on the client side.

- **Counter precision:** Cassandra counters are 64-bit signed integers (Java `long`).
  For a rating system, overflow is not a concern -- you would need over 9 quintillion
  ratings to overflow.

- **No aggregation functions needed:** Unlike relational databases where you might use
  `AVG()` and `COUNT()`, the Cassandra approach pre-computes these values. The Data
  API does support some aggregation operations, but reading pre-computed counters is
  always faster.

### Counter Drift and Accuracy

Because the `video_ratings` counter table is updated incrementally (see the POST
rating endpoint documentation), the values may drift slightly from the true aggregates
in `video_ratings_by_user`. Sources of drift include:

- **Retry storms:** If a counter increment times out and the client retries, the
  counter may be double-incremented
- **Rating update race conditions:** Two concurrent rating changes can cause the
  total to be off by a small amount

For a video rating system, this drift is typically negligible. A displayed average
of 4.18 vs. the true value of 4.19 does not affect user experience. If precision
is critical, a background reconciliation job can periodically recompute the true
aggregates from `video_ratings_by_user`.

### Null Average Rating

When a video has zero ratings:
- `rating_counter` = 0 (or the row may not exist at all)
- `averageRating` is returned as `null` (not 0.0)
- `totalRatingsCount` = 0

The frontend should handle the null case by displaying "No ratings yet" or showing
empty/gray stars rather than "0.0 stars."

### Security and Privacy

- This endpoint returns aggregate data publicly. Individual ratings (who rated what)
  are not exposed to unauthenticated callers.
- The `currentUserRating` field only returns the **caller's own** rating. You cannot
  see another user's individual rating through this endpoint.
- The JWT is optional. If the `Authorization` header is missing or invalid, the
  endpoint still succeeds -- it just returns `currentUserRating: null`.

---

## 8. Developer Tips

### Common Pitfalls

1. **Division by zero.** Always check that `rating_counter > 0` before computing
   the average. If no one has rated the video, dividing `rating_total` by
   `rating_counter` will produce a runtime error.

2. **Assuming currentUserRating is always present.** This field is null in three
   cases: (a) the user is not authenticated, (b) the user is authenticated but has
   not rated this video, (c) the counter row does not exist yet. Your frontend code
   must handle all three identically.

3. **Caching stale data too long.** After a user rates a video, the cached ratings
   summary becomes stale. Invalidate the React Query cache for this endpoint
   immediately after a successful POST to `/ratings`.

### Frontend Integration

The React frontend fetches the ratings summary via the API client in `src/lib/api.ts`:

```typescript
async getVideoRatings(videoId: string) {
  return this.request(`/videos/${videoId}/ratings`);
}
```

The `StarRating` component (`src/components/StarRating.tsx`) uses this data to:

1. Display the average rating as filled/empty stars
2. Show the total number of ratings
3. Highlight the current user's rating (if logged in) so they can see what they
   previously rated

### Testing with cURL

```bash
# Public: get aggregate only
curl http://localhost:8080/api/v1/videos/VIDEO_UUID/ratings

# Authenticated: get aggregate + current user's rating
curl http://localhost:8080/api/v1/videos/VIDEO_UUID/ratings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Best Practices

- **Fetch ratings summary when the video page loads.** This should be one of the
  first API calls on the Watch page, as users expect to see the rating immediately.

- **Use React Query's `staleTime` wisely.** Ratings change slowly -- a stale time of
  60 seconds is reasonable. But invalidate immediately after the user submits their
  own rating.

- **Round the average for display.** The raw average may have many decimal places
  (e.g., 4.1578947...). Round to one decimal place for display (4.2). The backend
  typically handles this, but the frontend should be resilient to extra precision.

- **Show half-stars for visual representation.** A rating of 4.2 can be displayed
  as 4 filled stars and a partially filled fifth star. This gives users a more
  precise visual sense of the rating without needing to read the number.

- **Handle the "no ratings" state gracefully.** Display a call-to-action like
  "Be the first to rate this video!" when `totalRatingsCount` is 0, rather than
  showing empty stars with "0 ratings."
