# GET /api/v1/videos/by-tag/{tag} -- Filter Videos by Tag

## 1. Overview

This endpoint returns all videos that have a specific tag, with pagination support. Tags
are user-defined labels like "cassandra", "tutorial", "nosql", or "data-modeling" that
categorize videos and make them discoverable.

**Why it exists:** Tags are a fundamental content discovery mechanism. When a user clicks
on a tag (e.g., clicking "cassandra" on a video's detail page), they expect to see all
other videos with that same tag. This endpoint powers that tag-based browsing experience.

**Who can call it:** Everyone. This is a **public endpoint** with no authentication required.

---

## 2. HTTP Details

| Property        | Value                                          |
|-----------------|------------------------------------------------|
| **Method**      | `GET`                                          |
| **Path**        | `/api/v1/videos/by-tag/{tag_name}`             |
| **Auth**        | None (public)                                  |
| **Success Code**| `200 OK`                                       |

### Path Parameters

| Parameter  | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| `tag_name` | string | Yes      | The tag to filter by           |

### Query Parameters

| Parameter  | Type    | Required | Default | Constraints     | Description          |
|-----------|---------|----------|---------|-----------------|----------------------|
| `page`     | integer | No       | 1       | min: 1          | Page number          |
| `pageSize` | integer | No       | 10      | min: 1, max: 100 | Items per page      |

### Response Body (`PaginatedResponse`)

```json
{
  "data": [
    {
      "videoId": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Introduction to Apache Cassandra",
      "thumbnailUrl": "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
      "userId": "123e4567-e89b-12d3-a456-426614174000",
      "submittedAt": "2026-03-15T10:00:00Z",
      "content_rating": "G",
      "category": "Education",
      "views": 1542,
      "averageRating": 4.3
    },
    {
      "videoId": "770a0622-a41d-63f6-c938-668877662222",
      "title": "Cassandra Data Modeling Workshop",
      "thumbnailUrl": "https://i.ytimg.com/vi/def456/hqdefault.jpg",
      "userId": "345g6789-a01d-34f5-c678-648836396222",
      "submittedAt": "2026-03-10T16:45:00Z",
      "content_rating": null,
      "category": "Education",
      "views": 923,
      "averageRating": 4.6
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 10,
    "totalItems": 24,
    "totalPages": 3
  }
}
```

### Error Responses

| Status | Condition                                    |
|--------|----------------------------------------------|
| `422`  | Validation error (page < 1, pageSize > 100)  |

Note: an unknown tag does not produce a 404 -- it returns an empty `data` array with
`totalItems: 0`. This is by design: the absence of videos for a tag is not an error.

### Example cURL

```bash
# All videos tagged "cassandra"
curl https://localhost:8443/api/v1/videos/by-tag/cassandra

# Page 2, 5 per page
curl "https://localhost:8443/api/v1/videos/by-tag/cassandra?page=2&pageSize=5"

# Multi-word tags are URL-encoded
curl "https://localhost:8443/api/v1/videos/by-tag/data-modeling"
```

---

## 3. Cassandra Concepts Explained

### SAI on Collection Types

The `tags` column in the `videos` table is a Cassandra `SET<TEXT>` -- an unordered
collection of unique strings. Querying "find all videos with tag X" means searching
inside this collection, which requires an index.

SAI (Storage Attached Indexes) supports indexing on collection columns. When you create
an SAI index on a `SET<TEXT>` column, Cassandra builds an inverted index that maps each
individual tag value to the rows containing it.

**Analogy:** Think of a recipe book where each recipe has a list of ingredients. An SAI
index on the ingredients set is like building a separate "ingredient index" at the back
of the book:

```
    Ingredient Index
    ─────────────────
    butter    -> Recipe #3, #7, #12, #45
    cassandra -> Video #550e, #770a, #880b, ...
    eggs      -> Recipe #1, #3, #7, #22
    nosql     -> Video #550e, #990c, ...
    sugar     -> Recipe #1, #12, #33
```

When you look up "cassandra" in the index, you get the list of videos that contain that
tag. This is much faster than reading every video and checking its tag list.

### CONTAINS Queries

In CQL, searching within a collection uses the `CONTAINS` keyword:

```sql
SELECT * FROM killrvideo.videos
WHERE tags CONTAINS 'cassandra';
```

The Data API expresses the same concept differently. Instead of `CONTAINS`, it uses
the `$in` operator to check if a collection contains a specific value:

```python
{"tags": {"$in": ["cassandra"]}}
```

This might look confusing because `$in` typically means "value is IN this list." But
when applied to a Cassandra SET column, the semantics flip: "does this set contain any
of these values?" In this case, with a single-element list `["cassandra"]`, it
effectively means "does the tags set contain 'cassandra'?"

### How SAI Processes Collection Queries

When you query `WHERE tags CONTAINS 'cassandra'`, here is what happens on each node:

1. **Index lookup:** The SAI index for `tags` is consulted. It maintains a mapping from
   each tag value to the SSTable rows containing that value.
2. **Row identification:** The index returns a list of row keys (videoid values) that
   have "cassandra" in their tags set.
3. **Row fetch:** The identified rows are read from the SSTable data.
4. **Merge:** Results from all relevant SSTables are merged and deduplicated.

This happens **locally on each node**. The coordinator then collects results from all
nodes in the cluster.

```
    Node 1                    Node 2                    Node 3
    ──────                    ──────                    ──────
    SAI index:                SAI index:                SAI index:
    "cassandra" ->            "cassandra" ->            "cassandra" ->
      row-A, row-D             row-B, row-E              row-C
         │                        │                        │
         v                        v                        v
    Fetch rows                Fetch rows                Fetch rows
    A, D                      B, E                      C
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                           Coordinator merges
                           [A, B, C, D, E]
```

### SAI vs. Dedicated Tag Table

An alternative to SAI on collections is a dedicated **tag-to-video mapping table**:

```sql
CREATE TABLE killrvideo.videos_by_tag (
    tag text,
    added_date timestamp,
    videoid uuid,
    name text,
    preview_image_location text,
    PRIMARY KEY (tag, added_date, videoid)
) WITH CLUSTERING ORDER BY (added_date DESC, videoid ASC);
```

**Comparison:**

| Aspect              | SAI on `videos.tags`          | Dedicated `videos_by_tag`     |
|---------------------|-------------------------------|-------------------------------|
| Write complexity    | 1 table write                 | 1 write per tag per video     |
| Read complexity     | Distributed index scan        | Single-partition read         |
| Consistency         | Always consistent             | May drift from source         |
| Storage overhead    | Index metadata only           | Full row duplication per tag  |
| Query flexibility   | Can combine with other filters| Fixed query pattern only      |

KillrVideo uses the SAI approach because it avoids the write amplification of maintaining
a separate table for every tag.

---

## 4. Data Model

### Table: `videos` (with SAI on `tags`)

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

CREATE CUSTOM INDEX videos_tags_idx
    ON killrvideo.videos (tags)
    USING 'StorageAttachedIndex';
```

**The `tags` column:**

- Type: `set<text>` -- an unordered collection of unique strings
- Example value: `{'cassandra', 'nosql', 'database', 'tutorial'}`
- Tags are case-sensitive: "Cassandra" and "cassandra" are different tags
- No limit on the number of tags per video (but practical limit ~50 for performance)

### How Sets Work in Cassandra

A `SET<TEXT>` in Cassandra is:
- **Unordered:** Elements have no defined order (unlike a list)
- **Unique:** Duplicate values are automatically deduplicated
- **Frozen vs. non-frozen:** KillrVideo uses a non-frozen set, meaning individual elements
  can be added/removed without rewriting the entire collection

```sql
-- Add a tag to an existing video
UPDATE killrvideo.videos
SET tags = tags + {'new-tag'}
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;

-- Remove a tag
UPDATE killrvideo.videos
SET tags = tags - {'old-tag'}
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
```

---

## 5. Database Queries

### Backend Function: `video_service.list_videos_by_tag()`

```python
def list_videos_by_tag(tag: str, page: int = 1, page_size: int = 10) -> PaginatedResponse:
    skip = (page - 1) * page_size

    # Query using SAI index on the tags collection
    filter_condition = {"tags": {"$in": [tag]}}

    cursor = videos_collection.find(
        filter_condition,
        sort={"added_date": -1},   # Newest first
        skip=skip,
        limit=page_size
    )

    results = list(cursor)

    # Count total matching documents
    total = videos_collection.count_documents(filter_condition)

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

### Equivalent CQL

```sql
-- Find all videos tagged "cassandra", newest first, page 1
SELECT videoid, name, preview_image_location, userid,
       added_date, content_rating, category, views
FROM killrvideo.videos
WHERE tags CONTAINS 'cassandra'
ORDER BY added_date DESC
LIMIT 10;
```

### CQL for Counting Matches

```sql
SELECT COUNT(*) FROM killrvideo.videos
WHERE tags CONTAINS 'cassandra';
```

### The `$in` Operator with Collections

The Data API's `$in` operator is overloaded for collection columns:

```python
# "Does the tags set contain 'cassandra'?"
{"tags": {"$in": ["cassandra"]}}

# You could also search for videos with ANY of multiple tags:
{"tags": {"$in": ["cassandra", "nosql"]}}
# This returns videos that have "cassandra" OR "nosql" (or both)
```

**Important:** `$in` on a set column means "set CONTAINS any of these values." It does
NOT mean "set EQUALS this list."

### Performance Characteristics

| Operation                     | Complexity            | Notes                              |
|-------------------------------|----------------------|------------------------------------|
| SAI index lookup              | O(M) per node         | M = matching rows on that node     |
| Cross-node coordination       | O(nodes)              | Query sent to all nodes in parallel|
| Sorting by added_date         | O(M log M)            | Applied after index filtering      |
| Pagination (skip/limit)       | O(skip + limit)       | Must skip past earlier pages       |
| Count documents               | O(M)                  | Counts all matching rows           |
| **Typical latency**           | 5-100ms               | Depends on tag popularity          |

**Tag cardinality matters:** A very popular tag (e.g., "tutorial" with 10,000 matches)
will be slower than a niche tag (e.g., "cassandra-5.0" with 15 matches) because the
SAI index returns more rows to filter and sort.

---

## 6. Implementation Flow

```
    Client (React)                    Backend (FastAPI)                  Cassandra
    ──────────────                    ─────────────────                  ─────────
         │                                  │                               │
         │  GET /api/v1/videos/by-tag/      │                               │
         │      cassandra?page=1&pageSize=10│                               │
         │─────────────────────────────────>│                               │
         │                                  │                               │
         │                                  │  1. URL-decode tag name       │
         │                                  │  2. Parse pagination params   │
         │                                  │                               │
         │                                  │  3. find(                     │
         │                                  │     {tags: {$in: ["cassandra"]}},│
         │                                  │     sort: {added_date: -1},   │
         │                                  │     skip: 0, limit: 10        │
         │                                  │  )                            │
         │                                  │─────────────────────────────>│
         │                                  │                               │
         │                                  │  4. SAI scans tags index      │
         │                                  │     on each node              │
         │                                  │                               │
         │                                  │  5. Matching rows returned    │
         │                                  │<─────────────────────────────│
         │                                  │                               │
         │                                  │  6. count_documents(          │
         │                                  │     {tags: {$in: ["cassandra"]}})│
         │                                  │─────────────────────────────>│
         │                                  │  7. Count returned            │
         │                                  │<─────────────────────────────│
         │                                  │                               │
         │                                  │  8. Build PaginatedResponse   │
         │                                  │                               │
         │  200 OK                          │                               │
         │  { data: [...], pagination: {..}}│                               │
         │<─────────────────────────────────│                               │
```

### Tag Discovery Flow (user journey)

```
    ┌─────────────────────┐
    │  User watches video  │
    │  sees tags:          │
    │  [cassandra] [nosql] │
    └─────────┬───────────┘
              │
              │  clicks "cassandra"
              v
    ┌─────────────────────┐
    │  GET /videos/by-tag/ │
    │      cassandra       │
    └─────────┬───────────┘
              │
              v
    ┌─────────────────────┐
    │  Results page shows  │
    │  24 videos with this │
    │  tag, newest first   │
    └─────────────────────┘
```

---

## 7. Special Notes

### Astra DB / DataStax Specifics

- SAI on collection columns (`SET`, `LIST`, `MAP`) is supported in Astra DB and
  Cassandra 5.0+. Earlier Cassandra versions require SASI or custom secondary indexes.
- The `$in` operator is specific to the Data API. In raw CQL, use `CONTAINS`.
- SAI indexes are maintained automatically on writes. When a video's tags are updated
  (via `PUT /api/v1/videos/id/{id}`), the index is updated atomically as part of the
  same write.

### Case Sensitivity

Tags are **case-sensitive** in Cassandra. Searching for "Cassandra" will not match videos
tagged with "cassandra". The backend should normalize tags to lowercase on write to
prevent confusion:

```python
# Normalize tags on submission
tags = {tag.lower().strip() for tag in request.tags}
```

If this normalization is not in place, users may create inconsistent tags. The frontend
should also display tags in a consistent format.

### Tag Limits and Performance

While there is no hard limit on the number of tags per video, practical considerations
apply:

| Tags per video | Impact                                               |
|---------------|------------------------------------------------------|
| 1-10          | Normal operation, no concerns                         |
| 10-50         | Slightly larger row size, more index entries           |
| 50-100        | Noticeable write amplification in SAI                 |
| 100+          | Not recommended; consider alternative modeling        |

Each tag in the set creates an entry in the SAI index. A video with 100 tags will have
100 index entries, which is 100x the index write overhead compared to a 1-tag video.

### Empty Tag Handling

- A video with no tags (`tags: {}`) will not appear in any tag-based query.
- Searching for an empty string tag (`""`) returns a 422 or empty results depending on
  backend validation.
- The frontend should prevent users from adding empty or whitespace-only tags.

### Combining Filters

The SAI approach allows combining the tag filter with other SAI-indexed columns:

```python
# Videos tagged "cassandra" in the "Education" category
{"tags": {"$in": ["cassandra"]}, "category": "Education"}
```

This multi-filter query uses SAI intersection -- both indexes are consulted and the
results are intersected. This is more efficient than filtering in application code.

---

## 8. Developer Tips

### Common Pitfalls

1. **URL encoding for special characters.** Tags with spaces, hashes, or other special
   characters must be URL-encoded in the path:
   - `data-modeling` -> `/videos/by-tag/data-modeling` (hyphens are fine)
   - `c++` -> `/videos/by-tag/c%2B%2B`
   - `machine learning` -> `/videos/by-tag/machine%20learning`

2. **Case sensitivity.** `"Cassandra"` and `"cassandra"` are different tags. Ensure the
   frontend sends the exact tag string. Best practice: normalize all tags to lowercase.

3. **Expecting 404 for unknown tags.** Unknown tags return `{ data: [], totalItems: 0 }`,
   not 404. This is semantically correct -- the tag exists as a concept, there just
   happen to be zero videos with it.

4. **Tag replacement on update.** When a video's tags are updated via `PUT /api/v1/videos/id/{id}`,
   the entire tag set is replaced (see the PUT endpoint explainer). This means removing
   a tag from a video will immediately remove it from this endpoint's results.

### Frontend Integration Pattern

```typescript
// From src/lib/api.ts
async getVideosByTag(tag: string, page: number = 1, pageSize: number = 10) {
  return this.get(`/videos/by-tag/${encodeURIComponent(tag)}`, {
    params: { page, pageSize }
  });
}
```

Tags are typically displayed as clickable chips on the video detail page:

```typescript
// From a video detail component
{video.tags.map(tag => (
  <Link
    key={tag}
    to={`/search?tag=${encodeURIComponent(tag)}`}
    className="px-2 py-1 bg-muted rounded-full text-sm hover:bg-accent"
  >
    {tag}
  </Link>
))}
```

### Testing Tips

- **Known tag:** Submit 3 videos all with the tag "test-tag". Query by "test-tag" and
  verify all 3 are returned.
- **No results:** Query for a tag that no video has (e.g., "zzz-nonexistent-tag").
  Verify empty data array and `totalItems: 0`.
- **Case sensitivity:** Submit a video with tag "Cassandra" (capital C). Query for
  "cassandra" (lowercase). Verify it does NOT match (unless the backend normalizes).
- **Pagination:** Submit 25 videos with the same tag. Request `pageSize=10`:
  - Page 1: 10 items
  - Page 2: 10 items
  - Page 3: 5 items
- **Tag removal:** Update a video to remove a tag, then query by that tag. Verify the
  video no longer appears in results.

### Tag Cloud / Popular Tags

This endpoint does not tell you which tags are popular. To build a tag cloud or "popular
tags" feature, you would need a separate aggregation -- either a background job that
counts videos per tag, or a real-time query:

```sql
-- This is expensive and not recommended for production
SELECT tags FROM killrvideo.videos;
-- Then count occurrences in application code
```

A better approach is to maintain a `tag_counts` table updated on write:

```sql
CREATE TABLE killrvideo.tag_counts (
    tag text PRIMARY KEY,
    video_count counter
);
```

This is not currently implemented in KillrVideo but would be a natural extension.

### Multi-Tag Search

The current API only supports single-tag filtering. To search for videos with multiple
tags (AND or OR), you would need:

- **OR (any tag):** Call the endpoint for each tag and merge results client-side, or
  use `$in` with multiple values on the backend
- **AND (all tags):** Not directly supported by the current endpoint; would require a
  backend change to use multiple `CONTAINS` clauses:
  ```sql
  SELECT * FROM videos WHERE tags CONTAINS 'cassandra' AND tags CONTAINS 'tutorial';
  ```
