# GET /api/v1/users/{user_id}/activity - User Activity Timeline

## Overview

This endpoint returns a chronological timeline of a user's activity on the platform, including
video uploads, comments, ratings, and other interactions. It powers the "Activity" tab on user
profile pages, showing a feed of recent actions.

**Why it exists**: An activity timeline gives users visibility into their own contributions
and lets other users see what someone has been up to. It is a common social feature that
increases engagement by surfacing user actions as a browsable feed rather than requiring
navigation to individual videos or comments.

**Key design insight**: The `user_activity` table uses a **composite partition key** of
`(userid, day)` to bound partition sizes. Each day's activity for a user lives in its own
partition. Querying 30 days of activity means reading up to 30 partitions, which the backend
handles by querying all partitions concurrently using `asyncio.gather`.

## HTTP Details

- **Method**: GET
- **Path**: `/api/v1/users/{user_id}/activity`
- **Auth Required**: No (public endpoint)
- **Success Status**: 200 OK

### Request

```http
GET /api/v1/users/7c9e6679-7425-40de-944b-e07fc1f90ae7/activity?page=1&pageSize=20
```

| Parameter  | Type    | Required | Default | Description                        |
|------------|---------|----------|---------|------------------------------------|
| `user_id`  | UUID    | Yes      | -       | User ID (path parameter)           |
| `page`     | integer | No       | 1       | Page number (>=1)                  |
| `pageSize` | integer | No       | 20      | Results per page (1-100)           |

### Success Response (200 OK)

```json
{
  "data": [
    {
      "activity_type": "upload",
      "activity_id": "e4a1b2c3-d4e5-11ef-8a7b-0242ac120002",
      "activity_timestamp": "2025-11-15T14:30:00Z",
      "details": {
        "videoid": "550e8400-e29b-41d4-a716-446655440000",
        "video_name": "Advanced Python Decorators"
      }
    },
    {
      "activity_type": "comment",
      "activity_id": "f5b2c3d4-e5f6-11ef-9b8c-0242ac120003",
      "activity_timestamp": "2025-11-15T12:15:00Z",
      "details": {
        "videoid": "660f9500-f39c-52e5-b827-557766550001",
        "comment_text": "Great tutorial, very helpful!"
      }
    },
    {
      "activity_type": "rating",
      "activity_id": "a6c3d4e5-f6a7-11ef-ac9d-0242ac120004",
      "activity_timestamp": "2025-11-14T19:45:00Z",
      "details": {
        "videoid": "770a0600-a40d-63f6-c938-668877660002",
        "rating": 5
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 20,
    "totalItems": 150,
    "totalPages": 8
  }
}
```

### Error Responses

| Status | Condition                 | Example Body                              |
|--------|---------------------------|-------------------------------------------|
| 422    | Invalid UUID format       | `{"detail": "Invalid user_id format"}`    |
| 422    | pageSize out of range     | `{"detail": "pageSize must be 1-100"}`    |
| 500    | Database connection error | `{"detail": "Internal server error"}`     |

**Note**: A valid UUID for a user with no activity returns 200 with an empty `data` array,
not 404.

## Cassandra Concepts Explained

### Composite Partition Key: (userid, day)

The `user_activity` table partitions data by `(userid, day)`. This means each combination of
user and calendar date creates a separate partition on disk.

**Analogy**: Imagine a filing cabinet where each drawer is labeled with a person's name AND a
date. "Alice / 2025-11-15" is one drawer, "Alice / 2025-11-14" is another, and
"Bob / 2025-11-15" is a third. To find all of Alice's activity for the past week, you open
7 drawers. Each drawer is small and fast to read.

```
Partition: (user_abc, 2025-11-15)
  +-- upload at 14:30:00
  +-- comment at 12:15:00
  +-- rating at 10:00:00

Partition: (user_abc, 2025-11-14)
  +-- upload at 19:45:00
  +-- comment at 16:30:00

Partition: (user_abc, 2025-11-13)
  +-- (empty -- no activity this day)
```

### Why Not Just Partition by userid?

A single-key partition `PRIMARY KEY (userid)` would put ALL of a user's activity in one
partition. For an active user over several years, this partition could grow to millions of
rows, causing:

1. **Slow reads**: Reading the partition requires loading a large amount of data.
2. **Hot spots**: Popular users' partitions become "hot" -- a single node handles
   disproportionate load.
3. **Unbounded growth**: Partitions grow forever without manual cleanup.

The `(userid, day)` composite key bounds each partition to one day's worth of activity.
Even the most active user generates at most a few hundred actions per day, keeping partitions
small and fast.

### Time-Series with Bounded Partitions

This is a classic Cassandra time-series pattern called **time-bucketed partitioning**:

```
Time resolution  | Partition key             | Rows per partition
-----------------+---------------------------+-------------------
Per year         | (userid, year)            | Up to 365K+ (too large)
Per month        | (userid, month)           | Up to 31K (large)
Per day          | (userid, day)             | Up to ~500 (ideal)
Per hour         | (userid, hour)            | Up to ~20 (too many partitions)
```

**Per day** is the sweet spot for user activity: partitions are small enough for fast reads
and large enough that 30 days of history requires only 30 partition reads.

### Clustering Order and Multi-Column Sorting

Within each partition, rows are sorted by the clustering columns:

```cql
PRIMARY KEY ((userid, day), activity_type, activity_timestamp, activity_id)
WITH CLUSTERING ORDER BY (activity_type ASC, activity_timestamp DESC, activity_id ASC)
```

**What this means**:
- Rows are first grouped by `activity_type` (alphabetically: "comment", "rating", "upload").
- Within each type, rows are sorted by `activity_timestamp` in descending order (newest
  first).
- `activity_id` (a TimeUUID) breaks ties if two activities have the same timestamp.

**Example partition layout** (userid=abc, day=2025-11-15):

```
activity_type | activity_timestamp      | activity_id
--------------+-------------------------+-----------------------------------
comment       | 2025-11-15T16:30:00Z    | f5b2c3d4-e5f6-11ef-...
comment       | 2025-11-15T12:15:00Z    | a1b2c3d4-d5e6-11ef-...
rating        | 2025-11-15T10:00:00Z    | b2c3d4e5-e6f7-11ef-...
upload        | 2025-11-15T14:30:00Z    | e4a1b2c3-d4e5-11ef-...
```

### TimeUUID for Unique Activity IDs

The `activity_id` column uses the `timeuuid` type, which embeds a timestamp in a UUID. This
serves two purposes:

1. **Uniqueness**: Even if two activities happen at the exact same millisecond, the TimeUUID
   ensures they have different keys.
2. **Temporal ordering**: TimeUUIDs sort chronologically, providing a natural tiebreaker.

```
TimeUUID: e4a1b2c3-d4e5-11ef-8a7b-0242ac120002
          |                |
          +-- timestamp ---+-- random node/sequence
              (embedded)
```

### Concurrent Partition Queries

When querying 30 days of activity, the backend sends 30 parallel queries (one per day
partition) and merges the results. This is possible because each day partition is independent
-- there are no cross-partition transactions or ordering guarantees in Cassandra.

**Analogy**: Imagine asking 30 librarians (one per day) to each find a user's activities
for their assigned day. They all work simultaneously and hand you their results. You then
merge and sort the combined results yourself.

```
Day 1 query  ---|
Day 2 query  ---|
Day 3 query  ---|--> asyncio.gather() --> merge --> sort --> paginate
...              |
Day 30 query ---|
```

This pattern works well because:
- Each individual query is fast (small partition, direct lookup).
- Queries execute concurrently (total time ~= slowest single query, not sum).
- Merging in application code is trivial for bounded result sets.

## Data Model

### Table: `user_activity`

```cql
CREATE TABLE killrvideo.user_activity (
    userid uuid,
    day date,
    activity_type text,
    activity_id timeuuid,
    activity_timestamp timestamp,
    PRIMARY KEY ((userid, day), activity_type, activity_timestamp, activity_id)
) WITH CLUSTERING ORDER BY (activity_type ASC, activity_timestamp DESC, activity_id ASC);
```

**Column details**:

| Column               | Type     | Role                    | Description                           |
|----------------------|----------|-------------------------|---------------------------------------|
| `userid`             | uuid     | Partition key (part 1)  | The user who performed the action     |
| `day`                | date     | Partition key (part 2)  | Calendar date of the activity         |
| `activity_type`      | text     | Clustering key 1        | Type: "upload", "comment", "rating"   |
| `activity_timestamp` | timestamp | Clustering key 2       | Exact time of the activity (DESC)     |
| `activity_id`        | timeuuid | Clustering key 3        | Unique ID, tiebreaker for ordering    |

**Additional columns** (stored in the activity row but not in the primary key):

The table may include additional columns for activity details (video ID, comment text, etc.)
depending on the activity type. These are stored as regular columns and vary by activity type.

### Example Data

```
Partition (user_abc, 2025-11-15):
userid   | day        | activity_type | activity_timestamp      | activity_id
---------+------------+---------------+-------------------------+----------------------------------
user_abc | 2025-11-15 | comment       | 2025-11-15T16:30:00Z    | f5b2c3d4-e5f6-11ef-9b8c-...
user_abc | 2025-11-15 | comment       | 2025-11-15T12:15:00Z    | a1b2c3d4-d5e6-11ef-8a7b-...
user_abc | 2025-11-15 | upload        | 2025-11-15T14:30:00Z    | e4a1b2c3-d4e5-11ef-8a7b-...

Partition (user_abc, 2025-11-14):
userid   | day        | activity_type | activity_timestamp      | activity_id
---------+------------+---------------+-------------------------+----------------------------------
user_abc | 2025-11-14 | rating        | 2025-11-14T19:45:00Z    | a6c3d4e5-f6a7-11ef-ac9d-...
user_abc | 2025-11-14 | upload        | 2025-11-14T09:00:00Z    | b7d4e5f6-a7b8-11ef-bd0e-...
```

### Partition Size Estimates

| User Activity Level | Rows per Day | Partition Size | 30-Day Total |
|---------------------|-------------|----------------|--------------|
| Casual viewer       | 1-5         | ~0.5 KB        | ~15 KB       |
| Active user         | 10-50       | ~5 KB          | ~150 KB      |
| Power user          | 100-500     | ~50 KB         | ~1.5 MB      |

All well within Cassandra's recommended partition size limit of 100 MB.

## Database Queries

### Query Strategy: 30 Concurrent Partition Reads

**Service Function**: `user_activity_service.list_user_activity()`

```python
async def list_user_activity(user_id: UUID, page: int = 1, page_size: int = 20):
    """
    Query all 30 day-partitions concurrently, merge results,
    sort by timestamp, and paginate.
    """
    activity_table = await get_table("user_activity")

    # Step 1: Generate the last 30 days as date strings
    today = date.today()
    days = [today - timedelta(days=i) for i in range(30)]

    # Step 2: Query all 30 partitions concurrently
    async def query_one_day(day):
        cursor = activity_table.find(
            filter={
                "userid": str(user_id),
                "day": day.isoformat()
            }
        )
        return await cursor.to_list()

    results = await asyncio.gather(*[query_one_day(d) for d in days])

    # Step 3: Flatten and merge all results
    all_activities = []
    for day_results in results:
        all_activities.extend(day_results)

    # Step 4: Sort by timestamp descending (newest first)
    all_activities.sort(
        key=lambda a: a["activity_timestamp"],
        reverse=True
    )

    # Step 5: Hard cap at 1000 rows
    all_activities = all_activities[:1000]

    # Step 6: Paginate
    total = len(all_activities)
    start = (page - 1) * page_size
    page_activities = all_activities[start : start + page_size]

    return page_activities, total
```

### Equivalent CQL (Per Partition)

Each of the 30 concurrent queries executes:

```cql
SELECT *
FROM killrvideo.user_activity
WHERE userid = 7c9e6679-7425-40de-944b-e07fc1f90ae7
  AND day = '2025-11-15';
```

This is a single-partition query -- the most efficient query pattern in Cassandra. The
coordinator routes the request directly to the node owning that partition.

**For all 30 days**, the backend effectively runs:

```cql
-- These 30 queries run in PARALLEL (not sequentially)
SELECT * FROM user_activity WHERE userid = ? AND day = '2025-11-15';
SELECT * FROM user_activity WHERE userid = ? AND day = '2025-11-14';
SELECT * FROM user_activity WHERE userid = ? AND day = '2025-11-13';
-- ... 27 more ...
SELECT * FROM user_activity WHERE userid = ? AND day = '2025-10-17';
```

### Performance Characteristics

| Metric                     | Value             | Notes                                |
|----------------------------|-------------------|--------------------------------------|
| Queries per request        | 30                | One per day partition                |
| Execution pattern          | Concurrent        | asyncio.gather (parallel)            |
| Per-query latency          | ~2-5 ms           | Single partition read                |
| Total wall-clock latency   | ~10-30 ms         | Parallel execution, max of 30 queries|
| Rows scanned               | Up to 1000 (cap)  | Hard cap prevents runaway reads      |
| Application merge/sort     | ~1-5 ms           | In-memory sort of up to 1000 rows    |
| **Total end-to-end**       | **~15-40 ms**     | Fast despite 30 queries              |

### Why a Hard Cap of 1000?

Without a limit, a user who has been active for 30 days with hundreds of activities per day
could return tens of thousands of rows. Sorting and paginating 10,000+ rows in application
memory is wasteful when the user likely only views the first few pages.

The 1000-row cap means:
- Maximum memory: ~1 MB (1000 rows x ~1 KB each)
- Maximum pages: 50 pages at pageSize=20
- Sort cost: O(1000 * log(1000)) -- negligible

### Pagination Across Partitions

Because results come from 30 separate partitions, pagination cannot use Cassandra's built-in
paging state. Instead, pagination is done in application code:

```
30 partitions --> merge --> sort --> cap at 1000 --> slice [start:end]
```

This works well because the total result set is bounded (1000 rows max) and fits easily in
memory. For a system with unbounded activity, you would need a cursor-based approach with
server-side state.

## Implementation Flow

```
+-------------------------------------------------------------+
| 1. Client sends GET /api/v1/users/{user_id}/activity        |
|    ?page=1&pageSize=20                                      |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 2. Validate parameters                                      |
|    +-- Invalid UUID? --> 422 Validation Error               |
|    +-- pageSize out of range? --> 422                       |
|    +-- Valid? --> Continue                                   |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 3. Generate date range: today minus 30 days                 |
|    [2025-11-15, 2025-11-14, ..., 2025-10-17]               |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 4. Fire 30 concurrent partition queries                     |
|    asyncio.gather(                                          |
|      query(userid, day1),                                   |
|      query(userid, day2),                                   |
|      ...                                                    |
|      query(userid, day30)                                   |
|    )                                                        |
|    Each: SELECT * FROM user_activity                        |
|          WHERE userid = ? AND day = ?                       |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 5. Merge results from all 30 partitions                     |
|    Flatten into single list                                 |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 6. Sort by activity_timestamp DESC (newest first)           |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 7. Apply hard cap: keep first 1000 rows                     |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 8. Paginate: slice rows[(page-1)*pageSize : page*pageSize]  |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 9. Build response with pagination metadata                  |
|    { "data": [...], "pagination": { ... } }                 |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 10. Return 200 OK                                           |
+-------------------------------------------------------------+
```

**Total database queries**: 30 (concurrent)
**External service calls**: 0
**Expected latency**: 15-40 ms

## Special Notes

### 1. The 30-Day Window is Hardcoded

The backend always queries the last 30 days, regardless of pagination parameters. This means:
- Activity older than 30 days is invisible through this endpoint.
- The window cannot be configured by the client.

**If you need longer history**, adjust the range in the service function or add a `days`
query parameter. Be aware that more days = more concurrent queries = higher load.

### 2. Empty Partitions are Free

If a user had no activity on a particular day, the partition for that day simply does not
exist. The query returns an empty result instantly -- there is no tombstone or placeholder.
Querying 30 days when the user was only active on 3 of them still fires 30 queries, but 27
of them return empty results in microseconds.

### 3. Clustering Order: activity_type First

The clustering order sorts by `activity_type` first, which groups activities by type within
each partition. This is useful for type-filtered queries:

```cql
-- Efficiently fetch only comments for a specific day
SELECT * FROM user_activity
WHERE userid = ? AND day = '2025-11-15' AND activity_type = 'comment';
```

However, for the activity timeline (which mixes all types sorted by time), the backend must
re-sort the merged results by `activity_timestamp`. The clustering order optimizes per-type
queries at the cost of requiring application-side sorting for mixed timelines.

### 4. Write Pattern: Dual Write from Action Endpoints

Activity rows are inserted by the endpoints that perform the action:

```python
# In the comment creation endpoint:
async def create_comment(video_id, user_id, text):
    # 1. Write the comment
    await comments_table.insert_one({...})

    # 2. Write the activity record
    await activity_table.insert_one({
        "userid": str(user_id),
        "day": date.today().isoformat(),
        "activity_type": "comment",
        "activity_timestamp": datetime.utcnow().isoformat(),
        "activity_id": uuid1(),  # TimeUUID
        "details": {"videoid": str(video_id), "comment_text": text[:100]}
    })
```

This "dual write" pattern means every user action requires two inserts (the action itself
and the activity log). Both are single-partition writes, so they are fast and independent.

**Risk**: If the first write succeeds and the second fails, the activity timeline is
incomplete. For KillrVideo this is acceptable (activity is supplementary, not critical). For
production systems, consider using Cassandra's lightweight transactions or an outbox pattern.

### 5. TimeUUID Ordering Nuance

TimeUUIDs created by different nodes at the exact same millisecond may not sort in the "true"
chronological order because clock skew between nodes can reorder them slightly. For a user
activity timeline, this sub-millisecond ordering difference is invisible to humans and does
not affect the user experience.

### 6. Data Retention

The 30-day query window acts as an implicit retention policy for reads. Older data still
exists in the table but is never queried by this endpoint. To reclaim storage, set a TTL
on activity rows:

```cql
INSERT INTO user_activity (userid, day, activity_type, ...)
VALUES (?, ?, ?, ...)
USING TTL 2592000;  -- 30 days in seconds
```

With TTL, Cassandra automatically deletes rows after 30 days, keeping storage bounded.

## Developer Tips

### Common Pitfalls

1. **Expecting activity for users that do not exist**: This endpoint does not validate that
   the user_id belongs to a real user. A request for a non-existent user simply returns an
   empty timeline (200 with empty data), not 404.

2. **Paginating past 1000 rows**: With a hard cap of 1000 and a default pageSize of 20, the
   maximum page number is 50. Requesting page 51 returns an empty data array.

3. **Assuming real-time consistency**: Activity rows are written asynchronously by action
   endpoints. There may be a brief delay (milliseconds) between performing an action and
   seeing it in the timeline.

4. **Not accounting for empty days**: The 30 concurrent queries may seem wasteful when a user
   is only active a few days per month, but empty partitions return in microseconds. The
   overhead is negligible.

5. **Sorting confusion**: Within each partition, rows are sorted by `activity_type` first,
   not by `activity_timestamp`. The merged, time-sorted order comes from application code.

### Best Practices

1. **Cache the timeline on the frontend**:
   ```typescript
   const { data } = useQuery({
     queryKey: ['user-activity', userId, page],
     queryFn: () => api.getUserActivity(userId, page),
     staleTime: 30_000  // 30 seconds -- activity changes slowly
   });
   ```

2. **Use infinite scroll instead of pagination**: Activity timelines work well with infinite
   scroll. Load page 1, then page 2 as the user scrolls down.

3. **Show relative timestamps**: "2 hours ago" is more useful than "2025-11-15T14:30:00Z"
   on an activity feed.

4. **Group by date**: Display a date header ("Today", "Yesterday", "November 13") to help
   users orient themselves in the timeline.

5. **Handle the empty state**: A user with no activity should see a friendly message like
   "No recent activity" rather than a blank page.

### Testing Tips

```python
# Test basic activity retrieval
async def test_get_user_activity():
    response = await client.get(
        f"/api/v1/users/{test_user_id}/activity"
    )

    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "pagination" in data

# Test pagination
async def test_activity_pagination():
    response = await client.get(
        f"/api/v1/users/{active_user_id}/activity",
        params={"page": 2, "pageSize": 5}
    )

    data = response.json()
    assert data["pagination"]["currentPage"] == 2
    assert data["pagination"]["pageSize"] == 5
    assert len(data["data"]) <= 5

# Test chronological ordering
async def test_activity_ordered_by_time():
    response = await client.get(
        f"/api/v1/users/{active_user_id}/activity",
        params={"pageSize": 50}
    )

    data = response.json()
    timestamps = [a["activity_timestamp"] for a in data["data"]]
    assert timestamps == sorted(timestamps, reverse=True)

# Test empty activity for new user
async def test_empty_activity():
    new_user_id = "00000000-0000-0000-0000-000000000099"
    response = await client.get(
        f"/api/v1/users/{new_user_id}/activity"
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) == 0
    assert data["pagination"]["totalItems"] == 0

# Test invalid UUID
async def test_activity_invalid_uuid():
    response = await client.get(
        "/api/v1/users/not-a-uuid/activity"
    )
    assert response.status_code == 422

# Test hard cap (if user has >1000 activities)
async def test_activity_hard_cap():
    response = await client.get(
        f"/api/v1/users/{very_active_user_id}/activity",
        params={"page": 1, "pageSize": 100}
    )

    data = response.json()
    # Total should not exceed 1000
    assert data["pagination"]["totalItems"] <= 1000
```

### curl Examples

```bash
# Get recent activity
curl "http://localhost:8080/api/v1/users/7c9e6679-7425-40de-944b-e07fc1f90ae7/activity"

# Paginated
curl "http://localhost:8080/api/v1/users/7c9e6679-7425-40de-944b-e07fc1f90ae7/activity?page=2&pageSize=10"
```

## Related Endpoints

- [GET /api/v1/users/{user_id}](../account_management/GET_users_by_id.md) - User profile (activity tab links here)
- [GET /api/v1/recommendations/foryou](../recommendations/GET_for_you.md) - Activity feeds preference computation
- [POST /api/v1/videos/{video_id}/comments](../comments_ratings/POST_video_comments.md) - Creates activity records

## Further Learning

- [Cassandra Time-Series Data Modeling](https://www.datastax.com/blog/basic-rules-cassandra-data-modeling)
- [Composite Partition Keys](https://docs.datastax.com/en/cql/developing/tables/compound-keys.html)
- [TimeUUID in Cassandra](https://docs.datastax.com/en/cql/developing/types/type-uuid.html)
- [asyncio.gather for Concurrent IO](https://docs.python.org/3/library/asyncio-task.html#asyncio.gather)
- [Time-Bucketed Partitioning Pattern](https://www.instaclustr.com/blog/cassandra-data-modelling-time-series/)
