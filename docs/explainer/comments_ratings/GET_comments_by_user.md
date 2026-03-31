# GET /api/v1/users/{user_id}/comments -- List Comments by User

## 1. Overview

This endpoint retrieves a paginated list of all comments posted by a specific user,
sorted newest-first. It powers the "comments" tab on user profile pages, letting
visitors (or the users themselves) see their full comment history across all videos.

This endpoint is the companion to `GET /api/v1/videos/{video_id}/comments`. Both
return the same comment data, but they query **different tables** -- this is the core
of Cassandra's denormalization pattern. While the video-comments endpoint reads from
the `comments` table (partitioned by `videoid`), this user-comments endpoint reads
from the `comments_by_user` table (partitioned by `userid`).

The key Cassandra concept here is that **the same data is stored twice, organized
differently, to support two different query patterns efficiently**.

---

## 2. HTTP Details

### Request

```
GET /api/v1/users/{user_id}/comments?page=1&pageSize=10
```

| Detail            | Value                                    |
|-------------------|------------------------------------------|
| **Method**        | GET                                      |
| **Path**          | `/api/v1/users/{user_id}/comments`       |
| **Authentication**| Not required (public)                    |

#### Path Parameters

| Parameter  | Type   | Required | Description                |
|------------|--------|----------|----------------------------|
| `user_id`  | UUID   | Yes      | The UUID of the user       |

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
      "commentid": "b3901230-d2a5-11ef-8f5b-4b7a1e4c8d92",
      "videoid": "99887766-5544-3322-1100-aabbccddeeff",
      "userid": "f9e8d7c6-b5a4-3210-9876-543210fedcba",
      "comment": "Could you cover SAI indexes next?",
      "sentiment_score": 0.70,
      "firstName": "Jane",
      "lastName": "Doe"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 10,
    "totalItems": 23,
    "totalPages": 3
  }
}
```

#### `CommentResponse` Fields

| Field             | Type        | Nullable | Description                                |
|-------------------|-------------|----------|--------------------------------------------|
| `commentid`       | UUID string | No       | TimeUUID of the comment                    |
| `videoid`         | UUID string | No       | The video the comment was posted on        |
| `userid`          | UUID string | No       | The user who wrote the comment             |
| `comment`         | string      | No       | The comment text                           |
| `sentiment_score` | number      | Yes      | Sentiment analysis score (0.0 to 1.0)      |
| `firstName`       | string      | Yes      | Author's first name                        |
| `lastName`        | string      | Yes      | Author's last name                         |

### Error Responses

| Status | Meaning          | When                                    |
|--------|------------------|-----------------------------------------|
| 422    | Validation Error | Invalid UUID format or page parameters  |

---

## 3. Cassandra Concepts Explained

### Denormalization: Why Two Tables for the Same Data?

This is one of the most important concepts in Cassandra data modeling, and this endpoint
is the perfect place to understand it.

In a traditional relational database, you would have a single `comments` table and write
two different queries:

```sql
-- Relational approach (single table, two queries)
SELECT * FROM comments WHERE video_id = ? ORDER BY created_at DESC;  -- for video page
SELECT * FROM comments WHERE user_id = ? ORDER BY created_at DESC;   -- for profile page
```

The relational database handles this with indexes. But Cassandra does not support
arbitrary secondary lookups efficiently at scale. Instead, Cassandra's philosophy is:

> **"Model your tables around your queries."**

So KillrVideo maintains two tables with identical data but different primary keys:

```
+---------------------------------------+    +---------------------------------------+
|          comments                      |    |       comments_by_user                |
| Partition key: videoid                 |    | Partition key: userid                 |
| Clustering key: commentid DESC         |    | Clustering key: commentid DESC        |
|                                        |    |                                       |
| "Show me all comments on this video"   |    | "Show me all comments by this user"   |
+---------------------------------------+    +---------------------------------------+
```

**The write path pays the cost** (every comment is written twice), so that **the read
path is always fast** (each query hits exactly one partition, with data pre-sorted).

**Analogy:** Imagine a public library that organizes books two ways:

- One set of shelves arranged by **subject** (science, history, fiction...)
- Another set of shelves arranged by **author's last name** (Adams, Bauer, Clarke...)

Every book appears on both sets of shelves. This takes twice the shelf space (write
cost), but patrons can quickly find books whether they are looking for "all science
books" or "all books by Adams" (fast reads).

### Same Comment, Same TimeUUID

When the `POST /comments` endpoint writes a new comment, it generates **one** TimeUUID
and writes it to both tables. This means the `commentid` value is identical in both
`comments` and `comments_by_user`. If you fetch a comment from one table and look it
up in the other, you will find the same row.

This shared identifier is important for:
- **Consistency verification** -- you can cross-check the two tables
- **Deletion** -- if you need to delete a comment, you must remove it from both tables
  using the same `commentid`

### Partition Key Determines Access Pattern

The fundamental rule: **you can only efficiently query Cassandra by partition key.**

| If you need...                   | You query...       | Because partition key is... |
|----------------------------------|--------------------|-----------------------------|
| Comments on a specific video     | `comments`         | `videoid`                   |
| Comments by a specific user      | `comments_by_user` | `userid`                    |

Querying the `comments` table by `userid` would require a full table scan (extremely
slow and operationally dangerous). That is why the `comments_by_user` table exists.

---

## 4. Data Model

### Table: `comments_by_user`

```sql
CREATE TABLE killrvideo.comments_by_user (
    userid          uuid,
    commentid       timeuuid,
    comment         text,
    videoid         uuid,
    sentiment_score float,
    PRIMARY KEY (userid, commentid)
) WITH CLUSTERING ORDER BY (commentid DESC);
```

### Comparison with `comments` Table

```sql
-- comments: partitioned by VIDEO
CREATE TABLE killrvideo.comments (
    videoid         uuid,           -- <-- partition key
    commentid       timeuuid,
    comment         text,
    userid          uuid,
    sentiment_score float,
    PRIMARY KEY (videoid, commentid)
) WITH CLUSTERING ORDER BY (commentid DESC);

-- comments_by_user: partitioned by USER
CREATE TABLE killrvideo.comments_by_user (
    userid          uuid,           -- <-- partition key
    commentid       timeuuid,
    comment         text,
    videoid         uuid,
    sentiment_score float,
    PRIMARY KEY (userid, commentid)
) WITH CLUSTERING ORDER BY (commentid DESC);
```

Notice:
- **Same columns** in both tables
- **Same clustering column** (`commentid DESC`) in both tables
- **Different partition key** -- this is the only structural difference, and it
  completely changes which queries each table can answer efficiently

### Physical Layout of `comments_by_user`

```
Partition: userid = f9e8d7c6-...  (Jane Doe)
  |--> commentid = e4b1c550-...  | videoid = a1b2...  | comment = "Great!"
  |--> commentid = b3901230-...  | videoid = 9988...  | comment = "SAI indexes?"
  |--> commentid = 71602120-...  | videoid = a1b2...  | comment = "First comment"

Partition: userid = 11223344-...  (John Smith)
  |--> commentid = d5c4b3a2-...  | videoid = a1b2...  | comment = "Nice video"
```

All of Jane's comments are together in one partition, sorted newest-first. All of
John's comments are in a separate partition. Each user's comment history is an
independent, self-contained unit of data.

---

## 5. Database Queries

### Backend: `comment_service.list_comments_by_user()`

```python
# Pseudocode based on the backend implementation
async def list_comments_by_user(
    user_id: UUID,
    page: int = 1,
    page_size: int = 10
):
    # Step 1: Query the comments_by_user table
    result = await comments_by_user_collection.find(
        filter={"userid": user_id},
        sort={"commentid": -1},     # Descending (newest first)
        skip=(page - 1) * page_size,
        limit=page_size,
    )

    comments = result.documents

    # Step 2: Enrich with user names
    # For this endpoint, all comments belong to the same user,
    # but the enrichment pattern still applies
    user_ids = list(set(c["userid"] for c in comments))
    users = await user_service.get_users_by_ids(user_ids)
    user_map = {u["userid"]: u for u in users}

    for comment in comments:
        user = user_map.get(comment["userid"])
        if user:
            comment["firstName"] = user.get("firstname")
            comment["lastName"] = user.get("lastname")

    # Step 3: Build pagination
    total_count = await comments_by_user_collection.count(
        filter={"userid": user_id}
    )

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

### Equivalent CQL

```sql
-- Read a page of comments for a specific user (newest first)
SELECT userid, commentid, comment, videoid, sentiment_score
FROM killrvideo.comments_by_user
WHERE userid = f9e8d7c6-b5a4-3210-9876-543210fedcba
ORDER BY commentid DESC
LIMIT 10;
```

**Note:** This is a single-partition query. The `WHERE` clause specifies the full
partition key (`userid`), and the results are pre-sorted by the clustering column
(`commentid DESC`). This is the ideal Cassandra query pattern.

### Performance Characteristics

| Metric                     | Value                                                 |
|----------------------------|-------------------------------------------------------|
| Main query type            | Single-partition range scan                           |
| Consistency level          | LOCAL_QUORUM (typical)                                |
| Sort cost                  | Zero -- pre-sorted by clustering order                |
| Enrichment queries         | 1 lookup (usually just 1 user since all comments are by the same person) |
| Expected latency           | Low single-digit milliseconds                         |

---

## 6. Implementation Flow

```
Client (Browser)                    Backend API                     Cassandra
      |                                  |                              |
      |  GET /users/{id}/comments        |                              |
      |  ?page=1&pageSize=10             |                              |
      |--------------------------------->|                              |
      |                                  |                              |
      |                          [Parse & validate params]              |
      |                                  |                              |
      |                                  |  SELECT * FROM               |
      |                                  |  comments_by_user            |
      |                                  |  WHERE userid = ?            |
      |                                  |  ORDER BY commentid DESC     |
      |                                  |  LIMIT 10                    |
      |                                  |----------------------------->|
      |                                  |    [10 comment rows]         |
      |                                  |<-----------------------------|
      |                                  |                              |
      |                          [Extract unique userids]               |
      |                          [Typically just 1 user]                |
      |                                  |                              |
      |                                  |  SELECT firstname, lastname  |
      |                                  |  FROM users                  |
      |                                  |  WHERE userid = ?            |
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

- **Identical query pattern, different collection.** In the Data API, the `comments`
  and `comments_by_user` tables are accessed as separate "collections." The query
  code for listing by user is nearly identical to listing by video -- only the
  collection name and filter field change.

- **Count performance.** The `count()` call for pagination metadata scans the user's
  partition. For users with a moderate number of comments (under a few thousand), this
  is fine. Prolific commenters with tens of thousands of comments may see slower count
  queries.

### Denormalization Consistency

Since the same comment is written to two tables independently (no transactional batch),
there is a small window where one table has the comment and the other does not. In
practice, this inconsistency is:

- **Very short-lived** -- both writes happen within milliseconds
- **Self-healing** -- once both writes complete, the tables are consistent
- **Low impact** -- a comment appearing on the video page but not yet on the user's
  profile (or vice versa) for a fraction of a second is not noticeable

If a write to one table succeeds but the other fails entirely (e.g., due to a timeout),
the backend would ideally retry or a background reconciliation process would detect and
fix the inconsistency.

### When to Use This Endpoint

Typical use cases:
- **User profile page:** Show a user's comment history
- **Moderation dashboard:** Review all comments by a flagged user
- **User data export:** Collect all comments for GDPR data portability requests

---

## 8. Developer Tips

### Common Pitfalls

1. **Querying the wrong table.** If you accidentally query the `comments` table with
   a `userid` filter, Cassandra will either reject the query (if `ALLOW FILTERING` is
   not specified) or perform a catastrophically slow full-table scan. Always query
   `comments_by_user` when filtering by `userid`.

2. **Assuming the tables are always in sync.** In normal operation, both tables contain
   the same data. But if you manually delete a row from one table and not the other,
   you will see inconsistencies. Always update or delete from both tables.

3. **Enrichment redundancy for single-user queries.** Since all comments returned by
   this endpoint belong to the same user, the enrichment step always fetches one user
   record. This is a minor inefficiency that simplifies the code -- the same enrichment
   function works for both the video-comments and user-comments endpoints.

### Frontend Integration

The React frontend fetches user comments via the API client in `src/lib/api.ts`:

```typescript
async getUserComments(userId: string, page = 1, pageSize = 10) {
  return this.request(
    `/users/${userId}/comments?page=${page}&pageSize=${pageSize}`
  );
}
```

### Testing with cURL

```bash
# Get first page of comments by a user
curl http://localhost:8080/api/v1/users/USER_UUID/comments

# Get second page with custom page size
curl "http://localhost:8080/api/v1/users/USER_UUID/comments?page=2&pageSize=5"
```

### Verifying Denormalization

A useful test is to post a comment and then verify it appears from both angles:

```bash
# 1. Post a comment
curl -X POST http://localhost:8080/api/v1/videos/VIDEO_UUID/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{"text": "Denormalization test"}'

# 2. Verify it appears on the video's comment list
curl http://localhost:8080/api/v1/videos/VIDEO_UUID/comments

# 3. Verify it also appears on the user's comment list
curl http://localhost:8080/api/v1/users/YOUR_USER_UUID/comments
```

Both responses should contain the same comment with the same `commentid`.

### Best Practices

- **Use consistent page sizes.** If the frontend shows 10 comments per page on the
  video page, use the same page size on the user profile page for a consistent
  experience.

- **Display the video context.** Since user comments span multiple videos, the
  frontend should display which video each comment was posted on. Use the `videoid`
  field to link back to the video or fetch video titles for display.

- **Consider a "delete all my comments" feature.** For user account deletion or
  privacy compliance, you may need to delete all rows from a user's partition in
  `comments_by_user` AND the corresponding rows from the `comments` table. The
  `videoid` stored in `comments_by_user` tells you which partitions in `comments`
  need to be updated.
