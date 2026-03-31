# POST /api/v1/videos/{video_id}/ratings -- Rate a Video

## 1. Overview

This endpoint allows an authenticated user to submit a rating (1 to 5 stars) for a
video. It supports **upsert semantics** -- if the user has already rated the video,
their existing rating is updated rather than creating a duplicate.

The rating system involves two tables with fundamentally different Cassandra column
types:

- **`video_ratings_by_user`** -- stores each individual user's rating (regular columns)
- **`video_ratings`** -- stores the aggregate count and total using **counter columns**

This endpoint demonstrates several important Cassandra concepts: upsert behavior,
counter columns, the `$inc` operator, and the read-modify-write pattern that handles
rating updates.

On success, the backend also logs a row to the `user_activity` table with
`activity_type = 'rate'`, regardless of whether this is a new rating or an update.

---

## 2. HTTP Details

### Request

```
POST /api/v1/videos/{video_id}/ratings
```

| Detail            | Value                                   |
|-------------------|-----------------------------------------|
| **Method**        | POST                                    |
| **Path**          | `/api/v1/videos/{video_id}/ratings`     |
| **Authentication**| Required -- Bearer JWT token             |
| **Content-Type**  | `application/json`                      |

#### Path Parameters

| Parameter   | Type   | Required | Description                    |
|-------------|--------|----------|--------------------------------|
| `video_id`  | UUID   | Yes      | The UUID of the video to rate  |

#### Request Body -- `RatingCreateOrUpdateRequest`

```json
{
  "rating": 4
}
```

| Field    | Type    | Constraints | Description                      |
|----------|---------|-------------|----------------------------------|
| `rating` | integer | 1-5         | The star rating (1=worst, 5=best)|

### Response -- 200 OK

Returns a `RatingResponse` object:

```json
{
  "rating": 4,
  "videoid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "userid": "f9e8d7c6-b5a4-3210-9876-543210fedcba",
  "created_at": "2026-03-19T14:30:00Z",
  "updated_at": "2026-03-19T14:30:00Z"
}
```

| Field        | Type        | Required | Description                                  |
|--------------|-------------|----------|----------------------------------------------|
| `rating`     | integer     | Yes      | The submitted rating value (1-5)             |
| `videoid`    | UUID string | Yes      | The video that was rated                     |
| `userid`     | UUID string | Yes      | The user who submitted the rating            |
| `created_at` | datetime    | No       | When the rating was first created            |
| `updated_at` | datetime    | No       | When the rating was last modified            |

### Error Responses

| Status | Meaning               | When                                           |
|--------|-----------------------|------------------------------------------------|
| 401    | Unauthorized          | Missing or invalid JWT token                   |
| 404    | Not Found             | Video does not exist                           |
| 409    | Conflict              | Video exists but is not in READY state         |
| 422    | Validation Error      | Invalid UUID or rating outside 1-5 range       |

---

## 3. Cassandra Concepts Explained

### Upsert Semantics: INSERT That Updates

In most relational databases, INSERT and UPDATE are distinct operations. INSERT fails
if the row already exists (unless you use `ON CONFLICT`). In Cassandra, **INSERT and
UPDATE are essentially the same operation** -- they both write column values to a
specific primary key.

This means:
- First rating by user A on video X: the row is created (like an INSERT)
- Second rating by user A on video X: the row is overwritten (like an UPDATE)

There is no error, no conflict, no special syntax. The primary key
`(videoid, userid)` determines uniqueness. If a row with that key exists, its
columns are overwritten. If it does not exist, a new row is created.

**Analogy:** Think of a whiteboard with a grid. Each cell is identified by its
row and column label. Writing a value in a cell either fills an empty cell or
overwrites whatever was there before -- there is no "insert vs. update" distinction.

### Counter Columns: Atomic Increment/Decrement

Regular Cassandra columns store a value that you set directly: "this column is now 42."
**Counter columns** are special -- you can only increment or decrement them:
"add 1 to this column" or "subtract 3 from this column."

```sql
-- Regular column: SET the value
UPDATE users SET login_count = 5 WHERE userid = ?;

-- Counter column: INCREMENT the value
UPDATE video_ratings SET rating_counter = rating_counter + 1 WHERE videoid = ?;
```

Counters are useful for aggregate statistics like "number of ratings" and "sum of all
rating values" because multiple clients can increment them concurrently without
read-modify-write race conditions.

**Analogy:** A counter column is like a tally counter (the handheld click counter
used by bouncers at a nightclub). You can click it to add one, but you cannot set
it to an arbitrary number.

Counter tables have strict rules: they can **only** contain counter columns (plus the
primary key) -- no mixing with regular columns. This is why KillrVideo uses two
separate tables: `video_ratings_by_user` (regular columns) and `video_ratings`
(counter columns).

### The $inc Operator and Read-Modify-Write Fallback

The Astra Data API provides an `$inc` operator that maps to Cassandra's counter
increment. When a user submits a new rating:

```
$inc: { rating_counter: 1, rating_total: 4 }
```

This atomically increments `rating_counter` by 1 and `rating_total` by the rating value.

But what happens when a user **changes** their rating? If user A previously rated 3
stars and now rates 5 stars, we need to:

1. Subtract the old rating total contribution: `rating_total -= 3`
2. Add the new rating total contribution: `rating_total += 5`
3. The counter stays the same (same number of ratings, just a different value)

This requires **reading the old rating first** (to know what to subtract), then
performing the counter update. This is the "read-modify-write" pattern.

---

## 4. Data Model

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

**Key design decisions:**

- **Partition key: `videoid`** -- All ratings for a video are in one partition
- **Clustering key: `userid`** -- Each user can have at most one rating per video
  (the combination `(videoid, userid)` is unique)
- **`rating` is a regular int column** -- It can be overwritten directly when a user
  changes their rating
- **`rating_date`** -- Tracks when the rating was submitted or last updated

### Table: `video_ratings` (counter-based aggregates)

```sql
CREATE TABLE killrvideo.video_ratings (
    videoid        uuid PRIMARY KEY,
    rating_counter counter,
    rating_total   counter
);
```

**Key design decisions:**

- **Single-row-per-video** -- `videoid` is the sole primary key; each video has
  exactly one row in this table
- **`rating_counter`** -- The number of users who have rated the video
- **`rating_total`** -- The sum of all rating values (used to compute average:
  `average = rating_total / rating_counter`)
- **Both are counter columns** -- They can only be incremented or decremented,
  never set directly

### Relationship Between Tables

```
User rates video 4 stars (new rating):

  video_ratings_by_user                 video_ratings
  +----------+--------+-------+         +----------+---------+-------+
  | videoid  | userid | rating|         | videoid  | counter | total |
  | vid-1    | usr-A  | 4     |         | vid-1    |   +1    |  +4   |
  +----------+--------+-------+         +----------+---------+-------+
       (upsert individual)                   (increment counters)


User changes rating from 4 to 5 stars:

  video_ratings_by_user                 video_ratings
  +----------+--------+-------+         +----------+---------+-------+
  | videoid  | userid | rating|         | videoid  | counter | total |
  | vid-1    | usr-A  | 5     |         | vid-1    |   +0    | +5-4  |
  +----------+--------+-------+         +----------+---------+-------+
       (overwrite rating)                (net change: total += 1)
```

---

## 5. Database Queries

### Backend: `rating_service.rate_video()`

```python
# Pseudocode based on the backend implementation
async def rate_video(video_id: UUID, user_id: UUID, new_rating: int):
    # Step 1: Validate video exists and is READY
    video = await video_service.get_video(video_id)
    if video is None:
        raise NotFoundException("Video not found")
    if video.status != VideoStatus.READY:
        raise ConflictException("Video is not ready")

    # Step 2: Check for existing rating (is this an update?)
    existing = await ratings_by_user_collection.find_one(
        filter={"videoid": video_id, "userid": user_id}
    )

    # Step 3: Upsert the individual rating
    now = datetime.utcnow()
    if existing:
        # Update: overwrite the rating value
        await ratings_by_user_collection.update_one(
            filter={"videoid": video_id, "userid": user_id},
            update={
                "$set": {
                    "rating": new_rating,
                    "rating_date": now,
                }
            }
        )
    else:
        # New: insert a fresh rating row
        await ratings_by_user_collection.insert_one({
            "videoid": video_id,
            "userid": user_id,
            "rating": new_rating,
            "rating_date": now,
        })

    # Step 4: Update the counter summary table
    if existing:
        old_rating = existing["rating"]
        # Read-modify-write: adjust the total by the difference
        delta = new_rating - old_rating
        # Counter stays the same (same number of ratings)
        await ratings_counter_collection.update_one(
            filter={"videoid": video_id},
            update={"$inc": {"rating_total": delta}}
        )
    else:
        # New rating: increment both counter and total
        await ratings_counter_collection.update_one(
            filter={"videoid": video_id},
            update={"$inc": {
                "rating_counter": 1,
                "rating_total": new_rating,
            }}
        )

    # Step 5: Log activity
    await activity_service.log_activity(user_id, video_id, "rate")

    return {
        "rating": new_rating,
        "videoid": video_id,
        "userid": user_id,
        "created_at": existing["rating_date"] if existing else now,
        "updated_at": now,
    }
```

### Equivalent CQL Statements

#### New Rating (user has not rated this video before)

```sql
-- Step 2: Check for existing rating
SELECT rating FROM killrvideo.video_ratings_by_user
WHERE videoid = ? AND userid = ?;
-- Returns: empty (no existing rating)

-- Step 3: Insert individual rating
INSERT INTO killrvideo.video_ratings_by_user (videoid, userid, rating, rating_date)
VALUES (
    a1b2c3d4-e5f6-7890-abcd-ef1234567890,
    f9e8d7c6-b5a4-3210-9876-543210fedcba,
    4,
    '2026-03-19T14:30:00Z'
);

-- Step 4: Increment counters
UPDATE killrvideo.video_ratings
SET rating_counter = rating_counter + 1,
    rating_total = rating_total + 4
WHERE videoid = a1b2c3d4-e5f6-7890-abcd-ef1234567890;

-- Step 5: Log activity
INSERT INTO killrvideo.user_activity (userid, activity_timestamp, activity_type, videoid)
VALUES (?, now(), 'rate', ?);
```

#### Updated Rating (user changes from 4 stars to 5 stars)

```sql
-- Step 2: Check for existing rating
SELECT rating FROM killrvideo.video_ratings_by_user
WHERE videoid = ? AND userid = ?;
-- Returns: rating = 4

-- Step 3: Update individual rating
UPDATE killrvideo.video_ratings_by_user
SET rating = 5, rating_date = '2026-03-19T15:00:00Z'
WHERE videoid = ? AND userid = ?;

-- Step 4: Adjust counter total (delta = 5 - 4 = 1)
UPDATE killrvideo.video_ratings
SET rating_total = rating_total + 1
WHERE videoid = a1b2c3d4-e5f6-7890-abcd-ef1234567890;
-- Note: rating_counter is NOT changed (same user, same video)

-- Step 5: Log activity (logged even for updates)
INSERT INTO killrvideo.user_activity (userid, activity_timestamp, activity_type, videoid)
VALUES (?, now(), 'rate', ?);
```

### Performance Characteristics

| Metric                    | Value                                                |
|---------------------------|------------------------------------------------------|
| Reads before write        | 1-2 (video validation + existing rating check)       |
| Writes (new rating)       | 3 (individual + counter + activity)                  |
| Writes (updated rating)   | 3 (individual + counter + activity)                  |
| Counter update cost       | Single-partition atomic increment                    |
| Expected latency          | Low single-digit milliseconds per operation          |

---

## 6. Implementation Flow

```
Client (Browser)                    Backend API                     Cassandra
      |                                  |                              |
      |  POST /videos/{id}/ratings       |                              |
      |  Authorization: Bearer <jwt>     |                              |
      |  { "rating": 4 }                |                              |
      |--------------------------------->|                              |
      |                                  |                              |
      |                          [Authenticate JWT]                     |
      |                          [Extract user_id]                      |
      |                                  |                              |
      |                                  |  SELECT status FROM videos   |
      |                                  |  WHERE videoid = ?           |
      |                                  |----------------------------->|
      |                                  |       status = READY         |
      |                                  |<-----------------------------|
      |                                  |                              |
      |                                  |  SELECT rating               |
      |                                  |  FROM video_ratings_by_user  |
      |                                  |  WHERE videoid=? AND userid=?|
      |                                  |----------------------------->|
      |                                  |       (empty or old rating)  |
      |                                  |<-----------------------------|
      |                                  |                              |
      |                          [Determine: new or update?]            |
      |                                  |                              |
      |                                  |  UPSERT INTO                 |
      |                                  |  video_ratings_by_user       |
      |                                  |----------------------------->|
      |                                  |            OK                |
      |                                  |<-----------------------------|
      |                                  |                              |
      |                                  |  UPDATE video_ratings        |
      |                                  |  SET counter +1, total +N    |
      |                                  |----------------------------->|
      |                                  |            OK                |
      |                                  |<-----------------------------|
      |                                  |                              |
      |                                  |  INSERT INTO user_activity   |
      |                                  |----------------------------->|
      |                                  |            OK                |
      |                                  |<-----------------------------|
      |                                  |                              |
      |  200 OK                          |                              |
      |  { rating, videoid, userid, ...} |                              |
      |<---------------------------------|                              |
```

---

## 7. Special Notes

### Astra DB / DataStax Considerations

- **$inc operator:** The Data API's `$inc` operator maps directly to Cassandra counter
  increments. This is the preferred way to update counters through the API, as it
  ensures atomicity without requiring the client to know the current value.

- **Counter table initialization:** Counter columns in Cassandra start at 0 implicitly.
  You do not need to INSERT a row before incrementing. The first `UPDATE ... SET
  counter = counter + 1` on a non-existent row creates the row with value 1.

- **Counter limitations:** Cassandra counters are not idempotent. If a counter
  increment request times out and is retried, the counter may be incremented twice.
  For a rating system, this means the aggregate count could drift slightly. The
  KillrVideo backend accepts this tradeoff for simplicity.

### Race Conditions

The read-modify-write pattern for rating updates has a potential race condition: if a
user submits two rating changes concurrently (e.g., from two browser tabs), the counter
delta may be computed from a stale "old rating" value, causing the aggregate total to
drift. In practice this is rare and the aggregate self-corrects as more users rate.

### Security

- The endpoint requires authentication. The `userid` is extracted from the JWT --
  users cannot submit ratings on behalf of others.
- The rating value is validated server-side to be between 1 and 5 inclusive.
- The video must be in READY status to accept ratings.

---

## 8. Developer Tips

### Common Pitfalls

1. **Forgetting the read-before-write for updates.** If you skip checking for an
   existing rating and always increment `rating_counter`, users who change their
   rating will be counted as new raters. The aggregate count will drift upward.

2. **Counter drift over time.** Because counters are not idempotent and the
   read-modify-write pattern has race conditions, the aggregate in `video_ratings`
   may diverge slightly from the true values in `video_ratings_by_user`. Consider
   implementing a periodic reconciliation job that recalculates the true aggregates
   from `video_ratings_by_user`.

3. **Not handling the "no video" case.** Always validate that the video exists and
   is READY before writing the rating. Writing a rating for a non-existent video
   creates orphaned data.

### Frontend Integration

The React frontend submits ratings via the API client in `src/lib/api.ts`:

```typescript
async rateVideo(
  videoId: string,
  rating: RatingCreateOrUpdateRequest
): Promise<RatingResponse> {
  return this.request(`/videos/${videoId}/ratings`, {
    method: 'POST',
    body: JSON.stringify(rating),
  });
}
```

The `StarRating` component (`src/components/StarRating.tsx`) handles the UI for
selecting a rating. After submission, the frontend should:

1. Update the displayed star rating optimistically
2. Invalidate the ratings summary cache so the average refreshes

```typescript
queryClient.invalidateQueries({ queryKey: ['ratings', videoId] });
```

### Testing with cURL

```bash
# Submit a new rating (4 stars)
curl -X POST http://localhost:8080/api/v1/videos/VIDEO_UUID/ratings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"rating": 4}'

# Change the rating to 5 stars (same endpoint, same method)
curl -X POST http://localhost:8080/api/v1/videos/VIDEO_UUID/ratings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"rating": 5}'
```

### Best Practices

- **Use optimistic UI updates.** When the user clicks a star, immediately update the
  displayed rating rather than waiting for the server response. If the request fails,
  revert to the previous value.

- **Debounce rapid rating changes.** If a user clicks through multiple star values
  quickly (1, 2, 3, 4, 5), debounce the API calls so only the final rating is
  submitted. This reduces unnecessary read-modify-write cycles.

- **Display the user's existing rating.** When loading the video page, fetch the
  ratings summary (which includes `currentUserRating`) so the star component shows
  the user's previous rating rather than an empty state.
