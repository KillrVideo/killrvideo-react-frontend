# GET /api/v1/videos/trending -- Get Trending Videos by Views

## 1. Overview

This endpoint returns the most-viewed videos within a configurable time window (1, 7, or
30 days). It powers the "Trending" page, surfacing videos that are currently popular based
on view activity rather than upload date.

**Why it exists:** "Latest" and "trending" are fundamentally different discovery signals.
Latest shows what is new; trending shows what is popular right now. A video uploaded a
week ago might still be trending if it is receiving many views today. This endpoint
answers the question: "What are people watching?"

**Who can call it:** Everyone. This is a **public endpoint** with no authentication
required.

---

## 2. HTTP Details

| Property        | Value                                  |
|-----------------|----------------------------------------|
| **Method**      | `GET`                                  |
| **Path**        | `/api/v1/videos/trending`              |
| **Auth**        | None (public)                          |
| **Success Code**| `200 OK`                               |

### Query Parameters

| Parameter      | Type    | Required | Default | Constraints       | Description                          |
|---------------|---------|----------|---------|-------------------|--------------------------------------|
| `intervalDays` | integer | No       | 1       | min: 1, max: 30   | Time window in days (1, 7, or 30)    |
| `limit`        | integer | No       | 10      | min: 1, max: 10   | Maximum number of results            |

### Response Body (Array of `VideoSummary`)

Unlike the paginated endpoints, this returns a **flat array** of video summaries:

```json
[
  {
    "videoId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Introduction to Apache Cassandra",
    "thumbnailUrl": "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "submittedAt": "2026-03-15T10:00:00Z",
    "content_rating": "G",
    "category": "Education",
    "views": 8742,
    "averageRating": 4.3
  },
  {
    "videoId": "660f9511-f30c-52e5-b827-557766551111",
    "title": "Cassandra vs. PostgreSQL: When to Choose What",
    "thumbnailUrl": "https://i.ytimg.com/vi/xyz789/hqdefault.jpg",
    "userId": "234f5678-f90c-23e4-b567-537725285111",
    "submittedAt": "2026-03-18T09:30:00Z",
    "content_rating": null,
    "category": "Technology",
    "views": 6231,
    "averageRating": 4.8
  }
]
```

Videos are sorted by view count within the time window, most-viewed first.

**Note:** There is no pagination object. The `limit` parameter (max 10) constrains the
result set directly. Trending is a "top N" list, not a browsable feed.

### Error Responses

| Status | Condition                                    |
|--------|----------------------------------------------|
| `422`  | Validation error (bad intervalDays or limit)  |

### Example cURL

```bash
# Top 10 trending today (defaults)
curl https://localhost:8443/api/v1/videos/trending

# Top 5 trending over the past 7 days
curl "https://localhost:8443/api/v1/videos/trending?intervalDays=7&limit=5"

# Top 10 trending over the past 30 days
curl "https://localhost:8443/api/v1/videos/trending?intervalDays=30"
```

---

## 3. Cassandra Concepts Explained

### Time-Series Aggregation

Computing "trending videos" requires aggregating activity data over a time window. In a
relational database, you might write:

```sql
-- This does NOT work in Cassandra!
SELECT video_id, COUNT(*) as views
FROM video_activity
WHERE activity_date >= '2026-03-18'
GROUP BY video_id
ORDER BY views DESC
LIMIT 10;
```

Cassandra does not support `GROUP BY` across partitions or `ORDER BY` on computed
aggregates. Instead, the application code must:

1. Read raw activity data from the time-series table
2. Aggregate (count views per video) in application memory
3. Sort by count and take the top N

This is a deliberate Cassandra trade-off: writes are fast and distributed, but complex
aggregations require application-side processing.

**Analogy:** Imagine you run a chain of movie theaters, each keeping its own ticket-sales
ledger (one per day). To find the most popular movie this week, you cannot ask one theater
to compile everyone's data. Instead, you collect each day's ledger, count ticket sales per
movie across all ledgers, and sort the totals yourself. That is how trending works with
Cassandra's `video_activity` table.

### Partitioning by Day

The `video_activity` table uses `day` as its partition key. This means all activity for
a given day lives in one partition. This design has critical implications:

**Advantages:**
- Querying one day's activity is a single-partition read (fast)
- Old data can be easily purged by dropping entire daily partitions
- Write load is spread across days (yesterday's partition is no longer receiving writes)

**Trade-offs:**
- Multi-day queries require reading multiple partitions (one per day)
- Today's partition receives ALL current write traffic (potential hot spot)
- The partition grows throughout the day, bounded by total daily activity

### Counter Patterns

The trending calculation counts views per video within a time window. This is fundamentally
a **counting problem**. There are several approaches in Cassandra:

1. **Application-side counting** (used here): Read raw events from `video_activity`, count
   in Python. Flexible but requires reading all events.

2. **Cassandra counter columns**: A special column type that supports increment operations.
   Very efficient for writes but hard to reset or aggregate across time windows.

3. **Pre-computed aggregates**: A background job periodically computes and stores "views
   per video per day" in a summary table. Best for high-traffic systems.

KillrVideo uses approach #1 because it is the simplest and works well for moderate
traffic levels.

---

## 4. Data Model

### Table: `video_activity`

```sql
CREATE TABLE killrvideo.video_activity (
    videoid uuid,
    day date,
    watch_time timeuuid,
    PRIMARY KEY (day, watch_time)
) WITH CLUSTERING ORDER BY (watch_time DESC);
```

**Key design decisions:**

| Aspect               | Choice                 | Why                                           |
|----------------------|-----------------------|-----------------------------------------------|
| Partition key         | `day`                 | Groups all activity for a day into one partition|
| Clustering column     | `watch_time` (timeuuid) | Unique per event, sorted by time             |
| `videoid`             | Regular column        | Stored per event, aggregated in application    |
| Clustering order      | DESC                  | Most recent activity first                     |

**TimeUUID (`watch_time`):** A TimeUUID is a UUID that encodes a timestamp. It serves
dual purposes:
- **Uniqueness:** Every event gets a globally unique identifier (no collisions)
- **Ordering:** TimeUUIDs sort chronologically, so `watch_time DESC` gives newest events first

**Analogy:** Think of each row as a punch on a loyalty card. The `day` is the date
stamped on top of the card. Each punch (`watch_time`) records when someone watched a
video (`videoid`). To find trending videos, you collect all the cards for the past N
days, sort the punches by video, and count which video got the most punches.

### Table: `videos` (for metadata enrichment)

After counting views per video, the backend fetches metadata (title, thumbnail, etc.)
from the `videos` table:

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

---

## 5. Database Queries

### Backend Function: `video_service.list_trending_videos()`

The trending calculation is a multi-step process:

```python
def list_trending_videos(interval_days: int = 1, limit: int = 10) -> list[VideoSummary]:
    today = date.today()
    view_counts = defaultdict(int)  # {videoid: count}

    # Step 1: Query each day partition in the time window
    for day_offset in range(interval_days):
        query_day = today - timedelta(days=day_offset)

        # Read all activity rows for this day
        cursor = video_activity_collection.find(
            {"day": str(query_day)},
            sort={"watch_time": -1}
        )

        # Count views per video
        for row in cursor:
            video_id = row["videoid"]
            view_counts[video_id] += 1

    # Step 2: Sort by view count, take top N
    top_videos = sorted(
        view_counts.items(),
        key=lambda x: x[1],
        reverse=True
    )[:limit]

    # Step 3: Fetch metadata for the top N videos
    results = []
    for video_id, count in top_videos:
        doc = videos_collection.find_one({"videoid": video_id})
        if doc:
            results.append(VideoSummary(**doc))

    return results
```

### Equivalent CQL -- Step 1: Read Activity for One Day

```sql
SELECT videoid, watch_time
FROM killrvideo.video_activity
WHERE day = '2026-03-19';
```

This returns all view events for March 19th. The application then counts occurrences of
each `videoid`.

### Equivalent CQL -- Step 1: Read Activity for 7 Days

```sql
-- Day 1
SELECT videoid FROM killrvideo.video_activity WHERE day = '2026-03-19';
-- Day 2
SELECT videoid FROM killrvideo.video_activity WHERE day = '2026-03-18';
-- Day 3
SELECT videoid FROM killrvideo.video_activity WHERE day = '2026-03-17';
-- ... (repeat for each day)
-- Day 7
SELECT videoid FROM killrvideo.video_activity WHERE day = '2026-03-13';
```

Each query is a single-partition read. The backend runs these sequentially or in parallel.

### Equivalent CQL -- Step 3: Fetch Metadata for Top Videos

```sql
-- For each top video ID:
SELECT videoid, name, preview_image_location, userid,
       added_date, content_rating, category, views
FROM killrvideo.videos
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
```

### Performance Characteristics

| Step                          | Complexity              | Notes                           |
|-------------------------------|------------------------|---------------------------------|
| Read activity per day         | O(V) per partition      | V = views that day              |
| Application-side counting     | O(total views in window)| In-memory aggregation           |
| Sort top N                    | O(U log U)              | U = unique videos with views    |
| Fetch metadata (per video)    | O(1)                    | Single-partition read by UUID   |
| **Total for 1-day window**    | O(V) + O(N)             | V = daily views, N = limit      |
| **Total for 7-day window**    | O(7V) + O(N)            | 7x the activity reads           |
| **Total for 30-day window**   | O(30V) + O(N)           | 30x the activity reads          |

**Important:** The cost scales with the number of view events, not the number of videos.
On a day with 10,000 views, reading and counting those events takes measurably longer than
a day with 100 views. The 30-day window can be significantly more expensive than the
1-day window.

---

## 6. Implementation Flow

```
    Client (React)                    Backend (FastAPI)                  Cassandra
    ──────────────                    ─────────────────                  ─────────
         │                                  │                               │
         │  GET /api/v1/videos/trending     │                               │
         │  ?intervalDays=7&limit=5         │                               │
         │─────────────────────────────────>│                               │
         │                                  │                               │
         │                                  │  1. Calculate day range       │
         │                                  │     (today - 6 ... today)     │
         │                                  │                               │
         │                                  │  2. For each day partition:   │
         │                                  │     find({day: "2026-03-19"}) │
         │                                  │─────────────────────────────>│
         │                                  │     [{videoid, watch_time},..]│
         │                                  │<─────────────────────────────│
         │                                  │                               │
         │                                  │     find({day: "2026-03-18"}) │
         │                                  │─────────────────────────────>│
         │                                  │     [{videoid, watch_time},..]│
         │                                  │<─────────────────────────────│
         │                                  │                               │
         │                                  │     ... (repeat for 7 days)   │
         │                                  │                               │
         │                                  │  3. Count views per videoid   │
         │                                  │     in application memory     │
         │                                  │                               │
         │                                  │  4. Sort by count DESC        │
         │                                  │     Take top 5                │
         │                                  │                               │
         │                                  │  5. Fetch metadata for top 5  │
         │                                  │     find_one({videoid: id1})  │
         │                                  │─────────────────────────────>│
         │                                  │     find_one({videoid: id2})  │
         │                                  │─────────────────────────────>│
         │                                  │     ... (up to 5 lookups)     │
         │                                  │                               │
         │  200 OK                          │                               │
         │  [ {videoId, title, views}, ...] │                               │
         │<─────────────────────────────────│                               │
```

### Aggregation Pipeline (conceptual)

```
    video_activity                    Application Memory              videos table
    ──────────────                    ──────────────────              ────────────
    ┌──────────────┐
    │ day: 03-19   │
    │ vid-A, vid-B │──┐
    │ vid-A, vid-C │  │
    └──────────────┘  │
    ┌──────────────┐  │    ┌─────────────────┐
    │ day: 03-18   │  │    │ Count per video: │     ┌───────────────┐
    │ vid-A, vid-A │──┼───>│ vid-A: 5 views  │────>│ Top 3:        │
    │ vid-B, vid-D │  │    │ vid-B: 3 views  │     │ 1. vid-A (5)  │──> fetch metadata
    └──────────────┘  │    │ vid-C: 1 view   │     │ 2. vid-B (3)  │──> fetch metadata
    ┌──────────────┐  │    │ vid-D: 2 views  │     │ 3. vid-D (2)  │──> fetch metadata
    │ day: 03-17   │  │    └─────────────────┘     └───────────────┘
    │ vid-A, vid-D │──┘
    └──────────────┘
```

---

## 7. Special Notes

### Astra DB / DataStax Specifics

- Each day partition query is a standard single-partition read. Astra DB handles these
  with token-aware routing for minimum latency.
- The per-video metadata lookups (Step 3) can be parallelized using `asyncio.gather()` in
  the Python backend to reduce total response time.
- Large day partitions (millions of views) may hit Astra DB's page size limits. The Data
  API automatically handles paging, but the application must iterate through all pages.

### Caching Is Critical

The trending endpoint is expensive relative to other endpoints because it reads and
aggregates raw activity data. **Server-side caching is strongly recommended:**

- Cache the trending result for 5-15 minutes
- Use `intervalDays` and `limit` as cache keys
- Invalidate or refresh on a timer, not on write events

The frontend also caches with React Query:

```typescript
export function useTrendingVideos(intervalDays: number, limit: number) {
  return useQuery({
    queryKey: ['videos', 'trending', intervalDays, limit],
    queryFn: () => api.getTrendingVideos(intervalDays, limit),
    staleTime: STALE_TIMES.MEDIUM,  // Cache for several minutes
  });
}
```

### The 30-Day Window Problem

A 30-day `intervalDays` reads 30 partitions and potentially millions of activity rows.
For a high-traffic platform, this can be slow. Mitigation strategies:

1. **Pre-compute daily summaries:** A background job writes "views per video per day" to
   a summary table. The trending query reads 30 small summary rows instead of millions
   of raw events.

2. **Approximate counting:** Use probabilistic data structures (HyperLogLog, Count-Min
   Sketch) to estimate view counts without reading every row.

3. **Limit the 30-day option:** Only offer 1-day and 7-day windows in the UI. The 30-day
   window is available via the API but not prominently featured.

### No Pagination by Design

This endpoint returns a flat array (max 10 items) instead of a paginated response. This
is intentional:
- Trending is a "top N" leaderboard, not a browsable list
- The computation cost scales with the time window, not the result count
- Users care about the top 5-10 trending videos, not page 3 of trending

### Security Note

Activity data is read in aggregate -- individual user viewing behavior is not exposed.
The endpoint reveals which videos are popular, but not who is watching them.

---

## 8. Developer Tips

### Common Pitfalls

1. **Expecting pagination.** This endpoint returns an array, not a `PaginatedResponse`.
   Do not try to access `response.data` or `response.pagination` -- the array IS the data.

2. **30-day timeouts.** For active platforms, `intervalDays=30` may be slow. Set an
   appropriate HTTP timeout (at least 10 seconds) on the client side, and consider
   showing a loading spinner.

3. **Empty results.** If no videos have been viewed in the time window, the response is
   an empty array `[]`. Handle this gracefully in the UI.

4. **Stale view counts.** The `views` field in the response is the **total** view count
   from the `videos` table, not the count within the trending window. A video might be
   trending (many recent views) but have a low total view count if it is new.

5. **Time zone assumptions.** The `day` partition key uses UTC dates. "Today" means the
   current UTC date, which may differ from the user's local date near midnight.

### Frontend Integration Pattern

```typescript
// From src/pages/Trending.tsx pattern
const [intervalDays, setIntervalDays] = useState(1);
const { data: videos, isLoading } = useTrendingVideos(intervalDays, 10);

return (
  <div>
    <div className="flex gap-2">
      <Button onClick={() => setIntervalDays(1)}
              variant={intervalDays === 1 ? 'default' : 'outline'}>
        Today
      </Button>
      <Button onClick={() => setIntervalDays(7)}
              variant={intervalDays === 7 ? 'default' : 'outline'}>
        This Week
      </Button>
      <Button onClick={() => setIntervalDays(30)}
              variant={intervalDays === 30 ? 'default' : 'outline'}>
        This Month
      </Button>
    </div>

    {videos?.map((video, index) => (
      <div key={video.videoId} className="flex items-center gap-4">
        <span className="text-2xl font-bold text-muted-foreground">
          #{index + 1}
        </span>
        <VideoCard video={video} />
      </div>
    ))}
  </div>
);
```

### Testing Tips

- **Seed activity data:** Before testing, generate view events by calling
  `POST /api/v1/videos/id/{id}/view` multiple times for different videos.
- **Vary the window:** Test with `intervalDays=1`, `7`, and `30` to verify the results
  change appropriately.
- **Edge cases:**
  - No activity in the window: expect empty array
  - Only one video viewed: expect a single-element array
  - All views on the same video: expect one video in the result
- **Ordering:** Submit 20 views for video A and 10 for video B. Verify A appears before
  B in the results.

### Performance Monitoring

Track these metrics for the trending endpoint:

| Metric                        | Target           | Alert Threshold        |
|-------------------------------|-----------------|------------------------|
| Response time (intervalDays=1) | < 200ms         | > 1s                   |
| Response time (intervalDays=7) | < 1s            | > 5s                   |
| Response time (intervalDays=30)| < 5s            | > 15s                  |
| Activity rows read per request | < 100K          | > 1M                   |
| Cache hit rate                 | > 90%           | < 50%                  |

### Future Improvements

The current implementation reads raw activity events for every trending request. At
scale, consider:

1. **Materialized views or summary tables** that pre-aggregate daily view counts
2. **Stream processing** (Kafka + Flink) to maintain real-time trending scores
3. **Redis sorted sets** for a dedicated trending cache with O(log N) updates
4. **Cassandra counters** for real-time view tracking per video per day
