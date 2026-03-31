# GET /api/v1/videos/latest -- Get Latest Videos (Paginated)

## 1. Overview

This endpoint returns the most recently submitted videos in reverse chronological order
(newest first), with pagination support. It powers the main home page feed -- the first
thing users see when they visit KillrVideo.

**Why it exists:** Browsing the latest content is the primary discovery mechanism for a
video platform. Users expect to see fresh content on the home page, sorted by upload date.
This query pattern ("give me the newest N items") is one of the most common in any
content-driven application.

**Who can call it:** Everyone. This is a **public endpoint** with no authentication
required. Both anonymous visitors and logged-in users see the same latest videos feed.

---

## 2. HTTP Details

| Property        | Value                                  |
|-----------------|----------------------------------------|
| **Method**      | `GET`                                  |
| **Path**        | `/api/v1/videos/latest`                |
| **Auth**        | None (public)                          |
| **Success Code**| `200 OK`                               |

### Query Parameters

| Parameter  | Type    | Required | Default | Constraints  | Description          |
|-----------|---------|----------|---------|--------------|----------------------|
| `page`     | integer | No       | 1       | min: 1       | Page number          |
| `pageSize` | integer | No       | 10      | min: 1, max: 100 | Items per page  |

### Response Body (`PaginatedResponse`)

```json
{
  "data": [
    {
      "videoId": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Introduction to Apache Cassandra",
      "thumbnailUrl": "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
      "userId": "123e4567-e89b-12d3-a456-426614174000",
      "submittedAt": "2026-03-19T14:30:00Z",
      "content_rating": "G",
      "category": "Education",
      "views": 1542,
      "averageRating": 4.3
    },
    {
      "videoId": "660f9511-f30c-52e5-b827-557766551111",
      "title": "Data Modeling Best Practices",
      "thumbnailUrl": "https://i.ytimg.com/vi/xyz789/hqdefault.jpg",
      "userId": "234f5678-f90c-23e4-b567-537725285111",
      "submittedAt": "2026-03-19T13:15:00Z",
      "content_rating": null,
      "category": "Technology",
      "views": 873,
      "averageRating": 4.7
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 10,
    "totalItems": 156,
    "totalPages": 16
  }
}
```

The `data` array contains `VideoSummary` objects -- a lighter representation than the full
`VideoDetailResponse`. Notably, these do **not** include `description`, `tags`,
`content_features` (the embedding vector), or `location`.

### Pagination Object

| Field         | Type    | Description                              |
|--------------|---------|------------------------------------------|
| `currentPage` | integer | The page number returned                 |
| `pageSize`    | integer | Number of items per page                 |
| `totalItems`  | integer | Total videos matching the query          |
| `totalPages`  | integer | Total number of pages                    |

### Error Responses

| Status | Condition                                    |
|--------|----------------------------------------------|
| `422`  | Validation error (page < 1, pageSize > 100)  |

### Example cURL

```bash
# First page, default page size (10)
curl https://localhost:8443/api/v1/videos/latest

# Second page, 20 items per page
curl "https://localhost:8443/api/v1/videos/latest?page=2&pageSize=20"
```

---

## 3. Cassandra Concepts Explained

### Time-Series Data Modeling

"Show me the latest videos" is a **time-series query** -- you want data sorted by time,
most recent first. This is one of Cassandra's sweet spots, but it requires careful data
modeling.

**The naive approach (and why it fails):** You might think you can just query the `videos`
table sorted by `added_date DESC`. But in Cassandra, you can only sort by clustering
columns within a partition. The `videos` table has `videoid` as the sole primary key --
there is no clustering column to sort by. A full table scan sorted by `added_date` would
be extremely expensive.

**The Cassandra approach:** There are two strategies used in KillrVideo:

1. **SAI index on `added_date`** -- The backend queries the `videos` table using an SAI
   (Storage Attached Index) on the `added_date` column with a sort. This works well for
   moderate data sizes.

2. **Dedicated `latest_videos` table** -- Partitioned by `day` with `added_date DESC`
   clustering. This is the classic Cassandra time-series pattern used for high-throughput
   scenarios.

### SAI (Storage Attached Indexes)

SAI is a Cassandra indexing technology that allows efficient queries on non-primary-key
columns. Unlike traditional Cassandra secondary indexes (2i), SAI indexes are:

- **Storage-attached:** The index data lives alongside the SSTable data on the same node
- **Efficient for range queries:** Can handle `>`, `<`, and `ORDER BY` operations
- **Good for moderate selectivity:** Works well when queries return a reasonable subset of data

**Analogy:** Think of SAI like the index at the back of a textbook. Without it, finding
every mention of "Cassandra" requires reading every page (full table scan). With the
index, you look up "Cassandra" and get a list of page numbers to check. SAI works
similarly -- it maintains a mapping from `added_date` values to the rows that have
those dates, stored locally on each node.

```
    Without SAI                     With SAI on added_date
    ──────────                      ──────────────────────
    Scan ALL rows in               Look up the index:
    all partitions                  "added_date DESC"
    Sort results                     ↓
    Return top N                    Get row pointers for
                                    the most recent dates
    Cost: O(N) where                 ↓
    N = total rows                  Fetch those specific rows

                                    Cost: O(K) where
                                    K = page size
```

### Pagination in Cassandra

Cassandra does not natively support `OFFSET`-based pagination (like SQL's `LIMIT 10 OFFSET 20`).
The Data API abstracts this for you, but under the hood it uses one of these strategies:

1. **Skip-and-limit:** Fetch `(page - 1) * pageSize + pageSize` rows and discard the first
   `(page - 1) * pageSize`. This works but gets slower for higher page numbers.
2. **Token-based paging:** Use the Cassandra paging state to resume from where the
   previous page left off. More efficient but requires state management.

The KillrVideo API uses offset-based pagination (page numbers) for simplicity. For most
use cases, users do not paginate past the first few pages.

---

## 4. Data Model

### Table: `videos` (with SAI on `added_date`)

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

CREATE CUSTOM INDEX videos_added_date_idx
    ON killrvideo.videos (added_date)
    USING 'StorageAttachedIndex';
```

The SAI index on `added_date` enables sorting by date without a full table scan.

### Table: `latest_videos` (dedicated time-series table)

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

**Key design decisions:**

| Aspect               | Choice                | Why                                            |
|----------------------|----------------------|------------------------------------------------|
| Partition key         | `day` (date)         | Groups one day's videos into one partition      |
| Clustering column 1   | `added_date DESC`    | Newest videos first within each partition       |
| Clustering column 2   | `videoid ASC`        | Tiebreaker for videos added at the same second  |
| Columns included      | Subset only          | Only fields needed for the list/card view       |

**Analogy:** The `latest_videos` table is like a daily newspaper's "New Videos" section.
Each day gets its own section (partition). Within each section, videos are listed newest
first (clustering order). The section only includes the headline and thumbnail (summary
fields), not the full article (no description, no embedding vector).

---

## 5. Database Queries

### Backend Function: `video_service.list_latest_videos()`

```python
def list_latest_videos(page: int = 1, page_size: int = 10) -> PaginatedResponse:
    # Query the videos table using SAI index with sort
    skip = (page - 1) * page_size

    cursor = videos_collection.find(
        {},  # No filter -- we want all videos
        sort={"added_date": -1},  # Sort by added_date descending
        skip=skip,
        limit=page_size
    )

    results = list(cursor)

    # Get total count for pagination metadata
    total = videos_collection.count_documents({})

    return PaginatedResponse(
        data=[VideoSummary(**doc) for doc in results],
        pagination=Pagination(
            currentPage=page,
            pageSize=page_size,
            totalItems=total,
            totalPages=ceil(total / page_size)
        )
    )
```

### Equivalent CQL (using SAI)

```sql
-- Page 1, 10 items per page
SELECT videoid, name, preview_image_location, userid,
       added_date, content_rating, category, views
FROM killrvideo.videos
ORDER BY added_date DESC
LIMIT 10;

-- Page 2 (skip first 10, take next 10)
-- Note: CQL does not have OFFSET; the Data API handles this
-- using paging state or skip logic
```

### Alternative CQL (using `latest_videos` table)

If using the dedicated time-series table instead of SAI:

```sql
-- Get today's latest videos
SELECT videoid, name, preview_image_location, userid,
       added_date, content_rating, category
FROM killrvideo.latest_videos
WHERE day = '2026-03-19'
ORDER BY added_date DESC
LIMIT 10;

-- For a full feed, query multiple days:
-- day = '2026-03-19' UNION day = '2026-03-18' UNION ...
-- (done in application code, not a single CQL query)
```

### Multi-Day Query Pattern

When using the `latest_videos` table, fetching a full page of results may require
reading from multiple day partitions:

```python
# Pseudocode for multi-day query
results = []
current_day = today

while len(results) < page_size and current_day > earliest_allowed:
    day_results = latest_videos.find(
        {"day": current_day},
        sort={"added_date": -1},
        limit=page_size - len(results)
    )
    results.extend(day_results)
    current_day -= one_day

# This pattern handles days with few or no videos
```

### Performance Characteristics

| Approach        | Complexity            | Latency         | Trade-offs                    |
|----------------|----------------------|-----------------|-------------------------------|
| SAI on videos  | O(K) where K = page  | 5-50ms          | Simpler code, works for moderate scale |
| latest_videos  | O(K) per partition   | 1-10ms per day  | More writes, guaranteed fast reads |

**When to use which:**
- **SAI approach:** Fewer than ~100K videos. Simpler write path (no denormalization).
- **Dedicated table:** Millions of videos. Guaranteed O(1) partition reads per day.

---

## 6. Implementation Flow

```
    Client (React)                    Backend (FastAPI)                  Cassandra
    ──────────────                    ─────────────────                  ─────────
         │                                  │                               │
         │  GET /api/v1/videos/latest       │                               │
         │  ?page=1&pageSize=10             │                               │
         │─────────────────────────────────>│                               │
         │                                  │                               │
         │                                  │  1. Parse pagination params   │
         │                                  │     (defaults: page=1, sz=10) │
         │                                  │                               │
         │                                  │  2. find({}, sort: -added_date│
         │                                  │     skip: 0, limit: 10)       │
         │                                  │─────────────────────────────>│
         │                                  │                               │
         │                                  │  3. SAI index scan on         │
         │                                  │     added_date DESC           │
         │                                  │                               │
         │                                  │  4. Return 10 rows            │
         │                                  │<─────────────────────────────│
         │                                  │                               │
         │                                  │  5. count_documents({})       │
         │                                  │─────────────────────────────>│
         │                                  │  6. Total count               │
         │                                  │<─────────────────────────────│
         │                                  │                               │
         │                                  │  7. Build PaginatedResponse   │
         │                                  │                               │
         │  200 OK                          │                               │
         │  { data: [...], pagination: {..}}│                               │
         │<─────────────────────────────────│                               │
```

---

## 7. Special Notes

### Astra DB / DataStax Specifics

- SAI indexes are a first-class feature in Astra DB and are automatically maintained.
  No manual rebuilding is required.
- The Data API supports the `sort` parameter with SAI-indexed columns. Under the hood,
  it generates `SELECT ... ORDER BY added_date DESC` which the SAI index can service.
- `count_documents({})` can be expensive on large tables. Astra DB may use an approximate
  count for performance. The `totalItems` in the pagination object should be considered
  an estimate, not an exact count.

### Caching Strategy

The frontend uses React Query with a `SHORT` stale time for the latest videos feed.
New videos can appear at any time, so the cache should not be too aggressive:

```typescript
// From src/hooks/useApi.ts pattern
export function useLatestVideos(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['videos', 'latest', page, pageSize],
    queryFn: () => api.getLatestVideos(page, pageSize),
    staleTime: STALE_TIMES.SHORT,
  });
}
```

The cache key includes `page` and `pageSize` so each page is cached independently.

### Hot Partition Concerns

If using the `latest_videos` table, today's partition receives all the writes. On a
very active platform, this could create a "hot partition" where one node handles
disproportionate write load. Mitigations include:

1. **Sub-day partitioning:** Use `(day, hour)` as the partition key instead of just `day`
2. **Bucketing:** Add a random bucket number to distribute writes
3. **Using SAI instead:** Eliminates the denormalized table entirely

For KillrVideo's scale (thousands, not millions, of videos per day), a daily partition
is perfectly fine.

### Performance at Scale

| Videos in DB | SAI Approach          | Dedicated Table          |
|-------------|----------------------|--------------------------|
| 1,000       | < 10ms               | < 5ms                    |
| 100,000     | 10-50ms              | < 5ms                    |
| 1,000,000   | 50-200ms             | < 5ms                    |
| 10,000,000  | May timeout          | < 5ms                    |

The dedicated `latest_videos` table maintains consistent read performance regardless of
total data size because each query only hits one day's partition.

---

## 8. Developer Tips

### Common Pitfalls

1. **Requesting page 0.** Pages are 1-indexed, not 0-indexed. Sending `page=0` returns
   a 422 validation error. The minimum valid page is 1.

2. **Over-fetching pages.** Requesting `page=999` when there are only 16 pages returns
   an empty `data` array with `pagination.totalPages: 16`. Check `totalPages` on the
   first response and do not request beyond it.

3. **Assuming stable ordering.** If two videos have the exact same `added_date` timestamp,
   their relative order may vary between requests. The `latest_videos` table uses `videoid`
   as a tiebreaker, but the SAI approach may not guarantee consistent ordering for ties.

4. **Missing videos.** A newly submitted video in PENDING status may or may not appear
   in the latest feed depending on the backend implementation. Some implementations filter
   to only READY videos.

### Frontend Integration Pattern

```typescript
// From src/components/home/FeaturedVideos.tsx pattern
const { data, isLoading } = useLatestVideos(currentPage, PAGE_SIZE);

return (
  <div>
    {data?.data.map(video => (
      <VideoCard key={video.videoId} video={video} />
    ))}
    <Pagination
      currentPage={data?.pagination.currentPage}
      totalPages={data?.pagination.totalPages}
      onPageChange={setCurrentPage}
    />
  </div>
);
```

### Testing Tips

- **Empty database:** Verify the endpoint returns `{ data: [], pagination: { totalItems: 0 } }`
  when no videos exist.
- **Pagination math:** Submit 25 videos, request `pageSize=10`. Verify:
  - Page 1: 10 items
  - Page 2: 10 items
  - Page 3: 5 items
  - `totalPages: 3`, `totalItems: 25`
- **Sort order:** Submit 3 videos with known timestamps. Verify they come back newest first.
- **Page size limits:** Request `pageSize=101`. Expect 422 (max is 100).
- **Concurrent submissions:** Submit a video while another client is paginating. The new
  video should appear on page 1 for subsequent requests.

### Infinite Scroll Alternative

If you want to implement infinite scroll instead of traditional pagination, you can
still use this endpoint with incrementing `page` numbers:

```typescript
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['videos', 'latest'],
  queryFn: ({ pageParam = 1 }) => api.getLatestVideos(pageParam, 10),
  getNextPageParam: (lastPage) => {
    const { currentPage, totalPages } = lastPage.pagination;
    return currentPage < totalPages ? currentPage + 1 : undefined;
  },
});
```

This appends each page's results to the previous ones, creating a seamless scrolling
experience.
