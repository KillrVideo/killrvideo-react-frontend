# GET /api/v1/search/tags/suggest - Autocomplete Tag Suggestions

## Overview

This endpoint provides tag autocomplete suggestions as the user types in a search box or tag
input field. Given a partial query string, it returns matching tags drawn from the existing
video catalog. This powers the "type-ahead" experience in the search bar and the tag input
when uploading or editing videos.

**Why it exists**: Autocomplete serves two purposes. First, it helps users discover content by
suggesting popular tags they may not have thought of. Second, it improves data consistency by
encouraging uploaders to reuse existing tags (e.g., picking "machine-learning" instead of
creating "ml" or "ML" or "machinelearning"). Without autocomplete, tag fragmentation grows
quickly and search quality degrades.

**Design choice**: Rather than maintaining a separate "tags" table, the backend scans the
`tags` column of recent videos and filters in application code. This is simpler to maintain
and avoids synchronization between a tag registry and the videos table, at the cost of higher
per-request compute.

## HTTP Details

- **Method**: GET
- **Path**: `/api/v1/search/tags/suggest`
- **Auth Required**: No (public endpoint)
- **Success Status**: 200 OK

### Request Parameters

```http
GET /api/v1/search/tags/suggest?query=pyth&limit=10
```

| Parameter | Type    | Required | Default | Description                             |
|-----------|---------|----------|---------|-----------------------------------------|
| `query`   | string  | Yes      | -       | Partial tag to match (min 1 character)  |
| `limit`   | integer | No       | 10      | Maximum number of suggestions to return |

### Success Response (200 OK)

```json
{
  "data": [
    "python",
    "python3",
    "python-tutorial",
    "pytorch"
  ]
}
```

The response is a simple list of tag strings sorted alphabetically. Each tag is a lowercase
string that appears on at least one video in the catalog.

### Error Responses

| Status | Condition                     | Example Body                          |
|--------|-------------------------------|---------------------------------------|
| 422    | Missing or empty query param  | `{"detail": "query is required"}`     |
| 500    | Database connection failure   | `{"detail": "Internal server error"}` |

## Cassandra Concepts Explained

### SAI on Collection Types

Cassandra's Storage-Attached Index (SAI) can index individual elements of collection columns
like `set<text>`, `list<text>`, and `map<text, text>`. When you create an SAI on a
`set<text>` column, Cassandra indexes every element of every set, allowing queries like
"find all rows where the set contains this value."

**Analogy**: Imagine a filing cabinet where each folder has multiple colored stickers on it.
An SAI on the stickers column is like building a lookup table: "red sticker -> folders 3, 7,
12" and "blue sticker -> folders 1, 5, 9." You can quickly find all folders with a specific
sticker without opening every drawer.

```cql
-- The tags column is a set of strings
CREATE TABLE killrvideo.videos (
    videoid uuid PRIMARY KEY,
    tags set<text>,
    ...
);

-- SAI indexes each individual tag in the set
CREATE CUSTOM INDEX videos_tags_idx
ON killrvideo.videos(tags)
USING 'StorageAttachedIndex';
```

With this index, Cassandra can efficiently answer:
```cql
SELECT * FROM videos WHERE tags CONTAINS 'python';
```

### Why Not a Dedicated Tags Table?

Many systems maintain a separate table for autocomplete:

```cql
-- Alternative approach (NOT used in KillrVideo)
CREATE TABLE tags (
    tag text PRIMARY KEY,
    video_count counter
);
```

**Pros of separate table**: Fast O(1) lookup, easy to sort by popularity.
**Cons of separate table**: Must be kept in sync with the videos table. Every video insert,
update, or delete requires a corresponding update to the tags table. In a distributed system,
this synchronization is a source of bugs and inconsistency.

KillrVideo avoids this complexity by deriving tags from the videos table at query time. The
trade-off is higher per-request cost (scanning up to 2000 videos), but for a demo application
with a bounded catalog, this is acceptable.

### Tag Aggregation Pattern

The backend collects tags by scanning recent videos and building a unique set in application
memory. This is a form of **client-side aggregation** -- Cassandra does not have a built-in
`SELECT DISTINCT tags` that unnests collection elements.

```
Database: 2000 recent videos
  |
  v
Application collects all tags from all 2000 videos
  |
  v
Deduplicate into a set of unique tags
  |
  v
Filter by substring match against user query
  |
  v
Return top N matches
```

This pattern is common in Cassandra applications. The database handles storage and retrieval
efficiently; the application handles aggregation and filtering.

### Autocomplete Patterns in Distributed Databases

Autocomplete is surprisingly hard to implement well in distributed databases because it
requires prefix or substring matching across a large vocabulary. Common approaches:

| Approach               | Pros                        | Cons                                |
|------------------------|-----------------------------|-------------------------------------|
| **SAI + app filter**   | Simple, no extra tables     | Scans many rows per request         |
| **Prefix table**       | Fast prefix lookup          | Complex to maintain, no substring   |
| **Search engine**      | Rich matching, ranking      | External dependency (Elasticsearch) |
| **In-memory cache**    | Fastest reads               | Stale data, memory usage            |

KillrVideo uses the first approach: SAI for tag storage and application-level filtering for
autocomplete matching.

## Data Model

### Table: `videos` (tags column)

```cql
CREATE TABLE killrvideo.videos (
    videoid uuid PRIMARY KEY,
    name text,
    description text,
    tags set<text>,
    content_features vector<float, 384>,
    userid uuid,
    added_date timestamp,
    views int
);
```

The `tags` column is a `set<text>`, which means:
- Each video can have zero or more tags.
- Tags within a video are unique (no duplicates).
- Tags are stored sorted alphabetically within the set.

### Index: Tags SAI

```cql
CREATE CUSTOM INDEX videos_tags_idx
ON killrvideo.videos(tags)
USING 'StorageAttachedIndex';
```

This index allows `CONTAINS` queries against the set. While the suggest endpoint does not
directly use `CONTAINS` (it scans and filters in-app), the index supports other features that
query by tag.

### Example Data

```
videoid                              | tags
-------------------------------------+------------------------------------
550e8400-e29b-41d4-a716-446655440000 | {'python', 'tutorial', 'beginner'}
660f9500-f39c-52e5-b827-557766550001 | {'python', 'machine-learning'}
770a0600-a40d-63f6-c938-668877660002 | {'javascript', 'react', 'tutorial'}
880b1700-b51e-74a7-d049-779988770003 | {'cooking', 'pasta', 'italian'}
```

From these 4 videos, the unique tag set is:
`{'beginner', 'cooking', 'italian', 'javascript', 'machine-learning', 'pasta', 'python', 'react', 'tutorial'}`

A query of `"pyth"` would match: `['python']`
A query of `"tut"` would match: `['tutorial']`

## Database Queries

### Query: Fetch Tags from Recent Videos

**Service Function**: `video_service.suggest_tags()`

```python
async def suggest_tags(query: str, limit: int = 10):
    """
    Fetch tags from the most recent 2000 videos,
    collect unique tags, and filter by substring match.
    """
    videos_table = await get_table("videos")

    # Step 1: Fetch recent videos (up to 2000)
    cursor = videos_table.find(
        filter={},
        projection={"tags": 1},       # Only fetch the tags column
        sort={"added_date": -1},       # Most recent first
        limit=2000
    )
    docs = await cursor.to_list()

    # Step 2: Collect all unique tags
    all_tags = set()
    for doc in docs:
        if doc.get("tags"):
            all_tags.update(doc["tags"])

    # Step 3: Filter by substring match (case-insensitive)
    query_lower = query.lower()
    matching_tags = [
        tag for tag in sorted(all_tags)
        if query_lower in tag.lower()
    ]

    # Step 4: Return top N
    return matching_tags[:limit]
```

### Equivalent CQL (Conceptual)

There is no single CQL statement that reproduces this logic because Cassandra does not
support `SELECT DISTINCT` on collection elements or substring filtering on set members.
The closest decomposition is:

```cql
-- Step 1: Fetch tags from recent videos
-- (requires a secondary index or materialized view for ORDER BY added_date)
SELECT tags FROM killrvideo.videos LIMIT 2000;

-- Steps 2-4 happen in application code
```

**Important**: The `LIMIT 2000` scan without a partition key filter is a full-table scan in
Cassandra. In a production system with millions of videos, this would be expensive. The 2000
limit bounds the cost but also means tags from older videos may not appear in suggestions.

### Performance Characteristics

| Metric              | Value           | Notes                                    |
|---------------------|-----------------|------------------------------------------|
| Rows scanned        | Up to 2000      | Bounded by LIMIT                         |
| Data transferred    | ~40 KB          | 2000 rows x ~20 bytes of tags per row    |
| Application CPU     | ~1 ms           | Set operations + substring filter        |
| Total latency       | ~20-80 ms       | Dominated by the database scan           |
| Result set          | 0 to `limit`    | Typically 1-20 matching tags             |

### Why Scan 2000 Rows?

The number 2000 is a pragmatic choice:
- **Too few (100)**: Misses many valid tags, poor autocomplete coverage.
- **Too many (100,000)**: Slow scans, high memory usage, diminishing returns.
- **2000**: Covers the "active" catalog well while keeping latency under 100 ms.

For a production system with a large catalog, you would replace this scan with a dedicated
tag table or an in-memory cache refreshed periodically.

## Implementation Flow

```
+-------------------------------------------------------------+
| 1. Client sends GET /api/v1/search/tags/suggest?            |
|    query=pyth&limit=10                                      |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 2. Validate parameters                                      |
|    +-- query missing/empty?  --> 422 Validation Error       |
|    +-- Valid? --> Continue                                   |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 3. Fetch tags from recent 2000 videos                       |
|    SELECT tags FROM videos LIMIT 2000                       |
|    (projection: tags column only)                           |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 4. Collect unique tags into a set                           |
|    2000 videos --> ~500 unique tags (typical)               |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 5. Filter by substring match                                |
|    "pyth" matches: ["python", "python3", "pytorch"]         |
|    Case-insensitive comparison                              |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 6. Sort alphabetically, truncate to limit                   |
|    ["python", "python3", "pytorch"] (limit=10, all fit)     |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 7. Return 200 OK with suggestions                           |
|    { "data": ["python", "python3", "pytorch"] }             |
+-------------------------------------------------------------+
```

**Total database queries**: 1 (scan recent videos)
**External service calls**: 0
**Expected latency**: 20-80 ms

## Special Notes

### 1. Full Table Scan Warning

The `suggest_tags()` function performs a scan without a partition key filter. In Cassandra,
this means the coordinator must contact all nodes and collect results. The `LIMIT 2000` bounds
the work, but in a cluster with millions of videos spread across many nodes, even a bounded
scan involves coordination overhead.

**For production at scale**, consider:
- A materialized view or separate table with tags as the partition key.
- An in-memory cache (Redis) refreshed every few minutes.
- A search engine (Elasticsearch/OpenSearch) with a terms aggregation.

### 2. Substring vs Prefix Matching

The current implementation uses **substring** matching (`query_lower in tag.lower()`), which
means a query of "learn" would match both "machine-learning" and "learning". This is more
forgiving than prefix-only matching but can produce unexpected suggestions.

**Prefix matching** (`tag.lower().startswith(query_lower)`) would be more predictable for
autocomplete and could be switched with a one-line change.

### 3. No Popularity Ranking

Tags are returned in alphabetical order, not by popularity. A tag used on 500 videos and a
tag used on 1 video are treated equally. In a real application, you would want to rank by
frequency:

```python
from collections import Counter

tag_counts = Counter()
for doc in docs:
    if doc.get("tags"):
        tag_counts.update(doc["tags"])

# Sort by count descending, then alphabetically
matching = [
    tag for tag, count in tag_counts.most_common()
    if query_lower in tag.lower()
]
return matching[:limit]
```

### 4. Case Sensitivity

Tags in the `set<text>` column are case-sensitive in Cassandra. The tag "Python" and "python"
are different values. The suggest endpoint normalizes with `.lower()` during filtering, but
this means the returned suggestions preserve whatever case was used when the tag was stored.

**Best practice**: Normalize tags to lowercase at write time (during video creation) so the
autocomplete results are consistent.

### 5. Empty Tags Column

Videos with an empty or null `tags` set are skipped during aggregation. This is handled by
the `if doc.get("tags")` guard. If most videos lack tags, the suggestion quality degrades.
Consider making tags a required field during video upload.

## Developer Tips

### Common Pitfalls

1. **Not debouncing on the frontend**: Without debouncing, every keystroke fires a request.
   For a 10-character query, that is 10 API calls. Debounce with a 200-300 ms delay.

2. **Expecting instant results on first character**: A single character like "a" matches many
   tags and provides little value. Consider requiring a minimum of 2-3 characters before
   triggering autocomplete.

3. **Assuming tags are normalized**: If the backend allows mixed-case tags, "Python" and
   "python" are distinct. Check whether your tag creation logic normalizes.

4. **Hardcoding the limit**: The default limit of 10 is reasonable for a dropdown, but a tag
   management page might need more. Always pass the `limit` parameter explicitly.

5. **Not handling empty responses**: If no tags match, the response is `{"data": []}`. The
   frontend should show a "no suggestions" message or hide the dropdown.

### Best Practices

1. **Debounce and minimum length**:
   ```typescript
   // Frontend: wait 250ms and require 2+ characters
   const debouncedQuery = useDebounce(query, 250);

   useEffect(() => {
     if (debouncedQuery.length >= 2) {
       fetchSuggestions(debouncedQuery);
     }
   }, [debouncedQuery]);
   ```

2. **Cache suggestions on the client**: Tag suggestions for common prefixes change slowly.
   Use React Query's built-in caching with a stale time of 5-10 minutes.

3. **Highlight the matching portion**: When displaying suggestions, bold the substring that
   matches the user's query:
   ```
   Query: "pyth"
   Display: **pyth**on, **pyth**on3, **pyth**orch
   ```

4. **Combine with recent/popular tags**: Show the user's recently used tags alongside
   autocomplete suggestions for a better upload experience.

5. **Limit tag length**: Extremely long tags (100+ characters) degrade the UI and waste
   storage. Enforce a maximum length (e.g., 50 characters) at the API level.

### Testing Tips

```python
# Test basic autocomplete
async def test_tag_suggest():
    response = await client.get(
        "/api/v1/search/tags/suggest",
        params={"query": "pyth"}
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["data"], list)
    for tag in data["data"]:
        assert "pyth" in tag.lower()

# Test limit parameter
async def test_tag_suggest_limit():
    response = await client.get(
        "/api/v1/search/tags/suggest",
        params={"query": "t", "limit": 3}
    )

    data = response.json()
    assert len(data["data"]) <= 3

# Test no matches
async def test_tag_suggest_no_match():
    response = await client.get(
        "/api/v1/search/tags/suggest",
        params={"query": "xyzzy_nomatch"}
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) == 0

# Test empty query returns 422
async def test_tag_suggest_empty_query():
    response = await client.get(
        "/api/v1/search/tags/suggest",
        params={"query": ""}
    )
    assert response.status_code == 422

# Test case insensitivity
async def test_tag_suggest_case_insensitive():
    response_lower = await client.get(
        "/api/v1/search/tags/suggest",
        params={"query": "python"}
    )
    response_upper = await client.get(
        "/api/v1/search/tags/suggest",
        params={"query": "PYTHON"}
    )

    # Both should return the same tags
    assert response_lower.json()["data"] == response_upper.json()["data"]
```

### curl Examples

```bash
# Basic autocomplete
curl "http://localhost:8080/api/v1/search/tags/suggest?query=pyth"

# With limit
curl "http://localhost:8080/api/v1/search/tags/suggest?query=tu&limit=5"
```

## Related Endpoints

- [GET /api/v1/search/videos](./GET_search_videos.md) - Full video search (uses tags for matching)
- [POST /api/v1/videos](../video_catalog/POST_videos.md) - Video creation (where tags are set)

## Further Learning

- [SAI on Collection Types](https://docs.datastax.com/en/cql/developing/indexing/sai/sai-concepts.html)
- [Autocomplete Design Patterns](https://www.algolia.com/blog/engineering/how-does-autocomplete-work/)
- [Cassandra Data Modeling for Aggregations](https://www.datastax.com/blog/basic-rules-cassandra-data-modeling)
