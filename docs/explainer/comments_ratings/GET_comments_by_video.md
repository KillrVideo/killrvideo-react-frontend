# GET /api/v1/videos/{video_id}/comments -- List Comments for Video

## 1. Overview

This endpoint retrieves a paginated list of comments for a specific video, sorted
newest-first. It is the primary way the KillrVideo frontend populates the comments
section beneath a video player.

Behind the scenes, this endpoint showcases several important Cassandra patterns:

- **Single-partition query** -- all comments for a video are stored together, making
  retrieval extremely fast
- **Clustering column ordering** -- comments are physically sorted by TimeUUID (newest
  first) on disk, so no query-time sorting is needed
- **Enrichment / join pattern** -- comment rows only store `userid`; the backend
  enriches each comment with the author's first and last name by looking up users
  in a separate call

This is a public endpoint -- no authentication is required to read comments.

---

## 2. HTTP Details

### Request

```
GET /api/v1/videos/{video_id}/comments?page=1&pageSize=10
```

| Detail            | Value                                   |
|-------------------|-----------------------------------------|
| **Method**        | GET                                     |
| **Path**          | `/api/v1/videos/{video_id}/comments`    |
| **Authentication**| Not required (public)                   |

#### Path Parameters

| Parameter   | Type   | Required | Description                    |
|-------------|--------|----------|--------------------------------|
| `video_id`  | UUID   | Yes      | The UUID of the video          |

#### Query Parameters

| Parameter  | Type    | Required | Default | Constraints       | Description       |
|------------|---------|----------|---------|-------------------|-------------------|
| `page`     | integer | No       | 1       | Minimum: 1        | Page number       |
| `pageSize` | integer | No       | 10      | Min: 1, Max: 100  | Items per page    |

### Response -- 200 OK

Returns a `PaginatedResponse` wrapping an array of `CommentResponse` objects:

```json
{
  "data": [
    {
      "commentid": "e4b1c550-d3a7-11ef-8f5b-4b7a1e4c8d92",
      "videoid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "userid": "f9e8d7c6-b5a4-3210-9876-543210fedcba",
      "comment": "Great explanation of partitioning!",
      "sentiment_score": 0.85,
      "firstName": "Jane",
      "lastName": "Doe"
    },
    {
      "commentid": "c2a0b440-d3a6-11ef-8f5b-4b7a1e4c8d92",
      "videoid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "userid": "11223344-5566-7788-99aa-bbccddeeff00",
      "comment": "Can you do a follow-up on compaction strategies?",
      "sentiment_score": 0.62,
      "firstName": "John",
      "lastName": "Smith"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 10,
    "totalItems": 47,
    "totalPages": 5
  }
}
```

#### `CommentResponse` Fields

| Field             | Type        | Nullable | Description                                |
|-------------------|-------------|----------|--------------------------------------------|
| `commentid`       | UUID string | No       | TimeUUID of the comment                    |
| `videoid`         | UUID string | No       | The video this comment belongs to          |
| `userid`          | UUID string | No       | The user who wrote the comment             |
| `comment`         | string      | No       | The comment text                           |
| `sentiment_score` | number      | Yes      | Sentiment analysis score (0.0 to 1.0)      |
| `firstName`       | string      | Yes      | Author's first name (enriched from users)  |
| `lastName`        | string      | Yes      | Author's last name (enriched from users)   |

#### `Pagination` Fields

| Field        | Type    | Description                              |
|--------------|---------|------------------------------------------|
| `currentPage`| integer | The current page number                  |
| `pageSize`   | integer | Number of items per page                 |
| `totalItems` | integer | Total number of comments for this video  |
| `totalPages` | integer | Total number of pages available          |

### Error Responses

| Status | Meaning          | When                                    |
|--------|------------------|-----------------------------------------|
| 422    | Validation Error | Invalid UUID format or page parameters  |

---

## 3. Cassandra Concepts Explained

### Clustering Column Ordering: Pre-Sorted Data on Disk

When you query a relational database for "comments ordered by date DESC," the database
reads the rows and then sorts them. In Cassandra, the sorting happens at **write time**,
not at read time.

The `comments` table is defined with:

```sql
PRIMARY KEY (videoid, commentid)
) WITH CLUSTERING ORDER BY (commentid DESC);
```

This tells Cassandra: "Within each video's partition, physically store rows so that the
highest `commentid` (most recent TimeUUID) comes first." When the backend reads the
partition, the data is already in the correct order -- no sorting needed at query time.

**Analogy:** Imagine a filing cabinet where, every time you add a new document, you
always place it at the front of the folder. When someone asks for the newest documents,
you just grab from the front -- no need to search or reorganize.

### The Enrichment / Join Pattern

Cassandra does not support JOINs. The `comments` table stores only the `userid` of
the comment author -- not their name. To display "Jane Doe" next to each comment,
the backend must perform an **enrichment step**:

1. Read the page of comments from the `comments` table (gives you `userid` values)
2. Collect the unique `userid` values from that page
3. Look up those users in the `users` table (a second query)
4. Merge the user names into the comment response objects

```
Step 1: Read comments           Step 2: Batch-fetch users
  comments table                  users table
  +----------+---------+          +----------+-----------+
  | userid_A | "Great" |          | userid_A | Jane Doe  |
  | userid_B | "Nice!" |   --->   | userid_B | John Smith|
  | userid_A | "Thanks"|          +----------+-----------+
  +----------+---------+
                                Step 3: Merge
                                  +----------+-----------+---------+
                                  | Jane Doe | "Great"             |
                                  | John Smith| "Nice!"            |
                                  | Jane Doe | "Thanks"            |
                                  +----------+-----------+---------+
```

This is sometimes called the "application-side join" pattern. It adds a small amount
of latency but keeps the data model clean and avoids data duplication beyond what is
needed.

**Why not store the user's name directly in the comments table?** You could, but then
if a user changes their name, you would need to update every comment they ever posted
across both comment tables. Storing only the `userid` and enriching at read time
avoids this update problem.

### Pagination in Cassandra

Cassandra does not have a native `OFFSET` clause like SQL. The KillrVideo backend
implements page-based pagination by:

1. Reading all rows for the partition (up to a reasonable limit)
2. Slicing the result set to extract the requested page

For partitions with a moderate number of comments (hundreds to low thousands), this
approach works well. For extremely large partitions, token-based (cursor) pagination
would be more efficient.

---

## 4. Data Model

### Table: `comments`

```sql
CREATE TABLE killrvideo.comments (
    videoid         uuid,
    commentid       timeuuid,
    comment         text,
    userid          uuid,
    sentiment_score float,
    PRIMARY KEY (videoid, commentid)
) WITH CLUSTERING ORDER BY (commentid DESC);
```

### How Data is Physically Organized

Imagine three comments on the same video. On disk, they look like this:

```
Partition: videoid = a1b2c3d4-...
  |--> commentid = e4b1c550-... (newest)  | comment = "Great!"   | userid = ...
  |--> commentid = c2a0b440-... (middle)  | comment = "Nice!"    | userid = ...
  |--> commentid = a1908330-... (oldest)  | comment = "Thanks!"  | userid = ...
```

The rows are physically sorted by `commentid DESC` within the partition. Reading
the first N rows gives you the N newest comments -- no index scan, no sort operation.

### Supporting Table: `users` (for enrichment)

```sql
-- Simplified; actual table has more columns
CREATE TABLE killrvideo.users (
    userid    uuid PRIMARY KEY,
    firstname text,
    lastname  text,
    email     text,
    -- ... other fields
);
```

The backend uses `user_service.get_users_by_ids()` to batch-fetch user details for
all unique `userid` values found in the current page of comments.

---

## 5. Database Queries

### Backend: `comment_service.list_comments_for_video()`

```python
# Pseudocode based on the backend implementation
async def list_comments_for_video(
    video_id: UUID,
    page: int = 1,
    page_size: int = 10
):
    # Step 1: Query the comments table for this video
    # Data API: find with filter, sort by commentid DESC
    result = await comments_collection.find(
        filter={"videoid": video_id},
        sort={"commentid": -1},     # Descending (newest first)
        skip=(page - 1) * page_size,
        limit=page_size,
    )

    comments = result.documents

    # Step 2: Collect unique user IDs from this page of comments
    user_ids = list(set(c["userid"] for c in comments))

    # Step 3: Batch-fetch user details
    users = await user_service.get_users_by_ids(user_ids)
    user_map = {u["userid"]: u for u in users}

    # Step 4: Enrich comments with user names
    for comment in comments:
        user = user_map.get(comment["userid"])
        if user:
            comment["firstName"] = user.get("firstname")
            comment["lastName"] = user.get("lastname")

    # Step 5: Build pagination metadata
    total_count = await comments_collection.count(filter={"videoid": video_id})

    return {
        "data": comments,
        "pagination": {
            "currentPage": page,
            "pageSize": page_size,
            "totalItems": total_count,
            "totalPages": ceil(total_count / page_size),
        }
    }
```

### Equivalent CQL Statements

```sql
-- Step 1: Read one page of comments (newest first)
-- Note: CQL does not have OFFSET; the backend handles pagination in application code
SELECT videoid, commentid, comment, userid, sentiment_score
FROM killrvideo.comments
WHERE videoid = a1b2c3d4-e5f6-7890-abcd-ef1234567890
ORDER BY commentid DESC
LIMIT 10;

-- Step 3: Batch-fetch user names
-- Cassandra supports IN queries on partition keys (use sparingly for small sets)
SELECT userid, firstname, lastname
FROM killrvideo.users
WHERE userid IN (
    f9e8d7c6-b5a4-3210-9876-543210fedcba,
    11223344-5566-7788-99aa-bbccddeeff00
);
```

### Performance Characteristics

| Metric                     | Value                                                  |
|----------------------------|--------------------------------------------------------|
| Main query type            | Single-partition range scan (very fast)                |
| Consistency level          | LOCAL_QUORUM (typical)                                 |
| Sort cost                  | Zero -- data is pre-sorted on disk by clustering order |
| Enrichment queries         | 1 multi-key lookup to users table                      |
| Expected latency           | Low single-digit milliseconds for main query           |
| Scales with                | Number of comments per video (partition size)           |

---

## 6. Implementation Flow

```
Client (Browser)                    Backend API                     Cassandra
      |                                  |                              |
      |  GET /videos/{id}/comments       |                              |
      |  ?page=1&pageSize=10             |                              |
      |--------------------------------->|                              |
      |                                  |                              |
      |                          [Parse & validate params]              |
      |                                  |                              |
      |                                  |  SELECT * FROM comments      |
      |                                  |  WHERE videoid = ?           |
      |                                  |  ORDER BY commentid DESC     |
      |                                  |  LIMIT 10                    |
      |                                  |----------------------------->|
      |                                  |    [10 comment rows]         |
      |                                  |<-----------------------------|
      |                                  |                              |
      |                          [Extract unique userids]               |
      |                          [userid_A, userid_B, ...]              |
      |                                  |                              |
      |                                  |  SELECT firstname, lastname  |
      |                                  |  FROM users                  |
      |                                  |  WHERE userid IN (?, ?, ...) |
      |                                  |----------------------------->|
      |                                  |    [user name data]          |
      |                                  |<-----------------------------|
      |                                  |                              |
      |                          [Merge names into comments]            |
      |                          [Build pagination metadata]            |
      |                                  |                              |
      |  200 OK                          |                              |
      |  { data: [...], pagination: {}}  |                              |
      |<---------------------------------|                              |
```

---

## 7. Special Notes

### Astra DB / DataStax Considerations

- **Data API pagination:** The Astra Data API supports `skip` and `limit` parameters
  on `find()`, which map to application-level pagination. Under the hood, Cassandra
  still reads from the beginning of the partition and discards rows before the offset.
  For deeply paginated results (e.g., page 100), this becomes less efficient.

- **Count operations:** Getting `totalItems` requires a count query across the
  partition. In Cassandra, COUNT can be expensive for very large partitions. The
  Data API may cache or estimate counts for performance.

- **No secondary indexes needed:** Because `videoid` is the partition key, no
  secondary index or SAI index is required for this query. It is a straightforward
  partition key lookup.

### Performance at Scale

- **Hot partitions:** A viral video with millions of comments creates a very large
  partition. Cassandra partitions should ideally stay under 100 MB. If a single video
  accumulates an enormous number of comments, consider time-bucketing (e.g.,
  partitioning by `videoid` + `year_month`).

- **Read-ahead efficiency:** Because the clustering order is DESC, reading the newest
  comments requires no seek to the end of the partition. Cassandra reads from the
  beginning of the sorted data, which is the newest comment.

### Enrichment Overhead

- The user name enrichment adds one additional round-trip to Cassandra. For a page of
  10 comments, you might fetch details for up to 10 unique users (though often fewer,
  as some users post multiple comments).
- The `IN` query on the `users` table fans out to multiple partitions (one per unique
  `userid`). This is acceptable for small sets (under 20-30 keys) but should not be
  used for hundreds of keys.

---

## 8. Developer Tips

### Common Pitfalls

1. **Requesting very large page sizes.** Setting `pageSize=100` on a video with
   thousands of comments works but increases response size and enrichment overhead.
   The default of 10 is a good balance for typical comment sections.

2. **Deep pagination performance.** Requesting page 50 with `pageSize=10` means the
   backend skips 490 rows before returning 10. For very deep pages, consider switching
   to cursor-based pagination using the last `commentid` as a continuation token.

3. **Stale user names.** If a user changes their name, previously cached comment
   responses will show the old name until the cache is refreshed. This is expected
   behavior and is usually acceptable.

### Frontend Integration

The React frontend fetches comments using the API client in `src/lib/api.ts`:

```typescript
async getVideoComments(videoId: string, page = 1, pageSize = 10) {
  return this.request(
    `/videos/${videoId}/comments?page=${page}&pageSize=${pageSize}`
  );
}
```

The `CommentsSection` component (`src/components/comments/CommentsSection.tsx`) uses
React Query to manage fetching, caching, and pagination:

```typescript
const { data, isLoading } = useQuery({
  queryKey: ['comments', videoId, page],
  queryFn: () => api.getVideoComments(videoId, page, pageSize),
});
```

### Testing with cURL

```bash
# Get first page of comments for a video
curl http://localhost:8080/api/v1/videos/VIDEO_UUID/comments

# Get second page with 5 items per page
curl "http://localhost:8080/api/v1/videos/VIDEO_UUID/comments?page=2&pageSize=5"
```

### Best Practices

- **Cache aggressively on the frontend.** Comments change infrequently relative to
  how often the page is viewed. Use React Query's `staleTime` to avoid refetching
  on every page visit. A stale time of 30-60 seconds is reasonable.

- **Implement infinite scroll or "load more."** Rather than traditional page numbers,
  consider loading the next page when the user scrolls to the bottom of the comment
  list. This provides a smoother UX and avoids the deep-pagination problem.

- **Handle empty states gracefully.** A video with zero comments should display a
  friendly message ("Be the first to comment!") rather than an empty container.
  The response will return `{ "data": [], "pagination": { "totalItems": 0, ... } }`.

- **Optimistic updates after posting.** When a user posts a new comment via the
  POST endpoint, immediately prepend it to the local comment list rather than waiting
  for a full refetch. This gives instant feedback.
