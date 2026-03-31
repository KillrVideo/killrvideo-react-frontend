# GET /api/v1/moderation/flags - List All Flags (Moderator Inbox)

## Overview

This endpoint returns a paginated list of content flags for moderator review. It serves as the **moderator inbox** -- the primary tool moderators use to see what content has been reported by the community. Flags can be filtered by status (open, under_review, approved, rejected) to focus on actionable items.

**Why it exists**: Moderators need a centralized view of all reported content. Without this, they would need to check each piece of content individually. The status filter lets moderators focus on unresolved flags while preserving resolved ones for audit purposes.

**Real-world analogy**: Think of it like an email inbox with folders. The "open" filter shows unread reports, "under_review" shows reports someone is working on, and "approved"/"rejected" shows the resolved archive.

## HTTP Details

- **Method**: GET
- **Path**: `/api/v1/moderation/flags`
- **Auth Required**: Yes (moderator role required)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/moderation.py`

### Request Parameters

```http
GET /api/v1/moderation/flags?status=open&page=1&pageSize=20
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | string | No | (all) | Filter: `"open"`, `"under_review"`, `"approved"`, `"rejected"` |
| `page` | integer | No | 1 | Page number (>=1) |
| `pageSize` | integer | No | 20 | Results per page (1-100) |

### Response Body

```json
{
  "data": [
    {
      "flagId": "e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd",
      "contentId": "550e8400-e29b-41d4-a716-446655440000",
      "contentType": "video",
      "status": "open",
      "flaggedReason": "inappropriate: Contains misleading medical advice",
      "reviewer": null,
      "reviewDate": null
    },
    {
      "flagId": "d4d5e6f0-5678-11f0-cccc-ddddeeeeaaaa",
      "contentId": "660f9500-f39c-52e5-b827-557766551111",
      "contentType": "comment",
      "status": "open",
      "flaggedReason": "harassment",
      "reviewer": null,
      "reviewDate": null
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 20,
    "totalItems": 47,
    "totalPages": 3
  }
}
```

### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{"detail": "Not authenticated"}` |
| 403 | User is not a moderator | `{"detail": "Moderator role required"}` |
| 422 | Invalid status value | `{"detail": "Invalid status filter"}` |

## Cassandra Concepts Explained

### Full Table Scan vs Partition Query

This endpoint presents an interesting Cassandra challenge. The `content_moderation` table is partitioned by `contentid`, but moderators need to query **across all content** -- they want all flags regardless of which video or comment was flagged.

**The problem**:
```cql
-- This is a FULL TABLE SCAN (bad in Cassandra!)
SELECT * FROM content_moderation WHERE status = 'open';
```

In Cassandra, querying without a partition key means scanning every node in the cluster. For a small moderation table this is acceptable, but for millions of flags it would be slow.

**Why it works here**:
- The `content_moderation` table is relatively small (thousands of rows, not millions)
- Moderation queries are low-frequency (moderators, not all users)
- The Astra Data API handles pagination internally with cursors

**Analogy**: Imagine a library where books are organized by author (partition key). If you want "all mystery novels" (status = open), you have to check every shelf. This is fine for a small library, but terrible for the Library of Congress.

### Pagination with the Data API

Cassandra doesn't have native `OFFSET` like SQL databases. Instead, it uses **cursor-based pagination**:

```
Page 1: Start from beginning, return 20 rows, save cursor position
Page 2: Resume from cursor, return next 20 rows
Page 3: Resume from cursor, return next 20 rows
```

The Astra Data API abstracts this:
```python
cursor = table.find(filter={...}, limit=20, skip=0)   # Page 1
cursor = table.find(filter={...}, limit=20, skip=20)   # Page 2
```

**Under the hood**, skip + limit is translated to Cassandra paging state tokens. This is efficient for small skip values but degrades for large offsets (e.g., page 1000).

### Optional Filtering

When no `status` filter is provided, the query returns **all flags** regardless of status. When a filter is provided, it narrows results to a specific status.

```python
# No filter: return everything
filter_dict = {}

# With status filter: narrow results
if status:
    filter_dict = {"status": status}
```

In Cassandra terms, filtering on a non-partition-key column requires either:
1. A secondary index (SAI) on the `status` column
2. `ALLOW FILTERING` (scans all rows, filters in memory)
3. Client-side filtering (fetch all, filter in Python)

The Data API handles this transparently -- it uses SAI if available, falls back to server-side filtering otherwise.

## Data Model

### Table: `content_moderation`

```cql
CREATE TABLE killrvideo.content_moderation (
    contentid uuid,              -- ID of the flagged video or comment
    flagid timeuuid,             -- Unique flag ID (time-ordered)
    content_type text,           -- 'video' or 'comment'
    status text,                 -- 'open', 'under_review', 'approved', 'rejected'
    flagged_reason text,         -- Combined reason code and description
    reviewer uuid,               -- Moderator who reviewed (null until reviewed)
    review_date timestamp,       -- When moderator took action (null until reviewed)
    PRIMARY KEY (contentid, flagid)
) WITH CLUSTERING ORDER BY (flagid DESC);
```

**For efficient status filtering**, a SAI index would be beneficial:

```cql
CREATE CUSTOM INDEX content_moderation_status_idx
ON killrvideo.content_moderation(status)
USING 'StorageAttachedIndex';
```

This index allows `WHERE status = 'open'` to be efficient without `ALLOW FILTERING`.

## Database Queries

### 1. List Flags with Optional Status Filter

**Service Function**: `app/services/flag_service.py` - `list_flags()`

```python
async def list_flags(
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
) -> Tuple[List[dict], int]:
    moderation_table = await get_table("content_moderation")

    # Build filter
    filter_dict = {}
    if status:
        filter_dict["status"] = status

    # Execute paginated query
    try:
        cursor = moderation_table.find(
            filter=filter_dict,
            limit=page_size,
            skip=(page - 1) * page_size
        )
        docs = await cursor.to_list()
    except Exception as e:
        if "COLLECTION_NOT_EXIST" in str(e):
            return [], 0  # Table doesn't exist yet, return empty
        raise

    return docs, len(docs)
```

**Equivalent CQL** (with status filter):
```cql
SELECT contentid, flagid, content_type, status, flagged_reason,
       reviewer, review_date
FROM killrvideo.content_moderation
WHERE status = 'open'
LIMIT 20;
```

**Equivalent CQL** (no filter):
```cql
SELECT contentid, flagid, content_type, status, flagged_reason,
       reviewer, review_date
FROM killrvideo.content_moderation
LIMIT 20;
```

**Performance**:
- With SAI index on `status`: **O(n)** where n = matching rows (efficient)
- Without index: **Full table scan** (acceptable for small moderation tables)

### 2. Count Total Items for Pagination

```python
    # Get total count for pagination metadata
    count_cursor = moderation_table.find(
        filter=filter_dict
    )
    total_docs = await count_cursor.to_list()
    total_items = len(total_docs)
```

**Note**: This fetches all matching documents to count them, which is inefficient for large datasets. A dedicated count query would be better:

```python
    # More efficient (if supported)
    total_items = await moderation_table.count_documents(
        filter=filter_dict,
        upper_bound=10000  # Safety limit
    )
```

### 3. Graceful Handling of Missing Collection

```python
    except Exception as e:
        if "COLLECTION_NOT_EXIST" in str(e):
            return [], 0  # Return empty list, not an error
        raise
```

**Why not raise an error?**
- The moderation table might not exist in new environments
- Returning an empty list is a better UX than a 500 error
- The moderator dashboard simply shows "No flags to review"

## Implementation Flow

```
┌───────────────────────────────────────────────────────────┐
│ 1. Client sends GET /api/v1/moderation/flags?status=open  │
│    Authorization: Bearer <moderator_jwt>                  │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 2. Authenticate and authorize                             │
│    ├─ No token? → 401 Unauthorized                        │
│    ├─ Token valid but not moderator? → 403 Forbidden      │
│    └─ Moderator? → Continue                               │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 3. Parse query parameters                                 │
│    ├─ status: "open" (optional filter)                    │
│    ├─ page: 1 (default)                                   │
│    └─ pageSize: 20 (default)                              │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 4. Build filter dictionary                                │
│    status provided?                                       │
│    ├─ Yes → filter = {"status": "open"}                   │
│    └─ No → filter = {} (no filter)                        │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 5. Query content_moderation table                         │
│    find(filter=filter_dict, limit=20, skip=0)             │
│    ├─ COLLECTION_NOT_EXIST? → Return empty list           │
│    └─ Success? → Continue with results                    │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 6. Build pagination metadata                              │
│    {currentPage: 1, pageSize: 20,                         │
│     totalItems: 47, totalPages: 3}                        │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 7. Return 200 OK with {data: [...], pagination: {...}}    │
└───────────────────────────────────────────────────────────┘
```

**Total Queries**: 1-2 (1 for data, optionally 1 for count)

**Expected Latency**: 20-100ms (depends on table size and filter)

## Special Notes

### 1. Role-Based Access Control

This endpoint requires the **moderator** role. The backend checks the JWT token's `roles` claim:

```python
# Dependency injection for moderator-only endpoints
async def require_moderator(current_user: User = Depends(get_current_user)):
    if "moderator" not in current_user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Moderator role required"
        )
    return current_user
```

**Role hierarchy in KillrVideo**:
- `viewer` -- Can flag content (POST /api/v1/flags)
- `creator` -- Can upload + viewer permissions
- `moderator` -- Can review flags + all permissions

### 2. Ordering Considerations

Flags are returned in the order Cassandra stores them. Since the `content_moderation` table clusters by `flagid DESC`, flags within a partition are sorted newest-first.

**However**, when querying across all partitions (no `contentid` filter), the order depends on Cassandra's token ring -- which appears random from the application's perspective.

**For a true "newest flags first" view across all content**, you would need a separate table:

```cql
CREATE TABLE killrvideo.flags_by_date (
    status text,
    flagid timeuuid,
    contentid uuid,
    content_type text,
    flagged_reason text,
    PRIMARY KEY (status, flagid)
) WITH CLUSTERING ORDER BY (flagid DESC);
```

This is a classic Cassandra denormalization pattern -- duplicate data to support a different query pattern.

### 3. The Status Filter and SAI

Without a SAI index on `status`, filtering requires `ALLOW FILTERING`:

```cql
-- Without SAI (slow, scans all rows)
SELECT * FROM content_moderation
WHERE status = 'open'
ALLOW FILTERING;

-- With SAI (efficient, uses index)
SELECT * FROM content_moderation
WHERE status = 'open';
```

The Astra Data API automatically adds `ALLOW FILTERING` when needed, which is convenient but can be a performance trap for large tables.

### 4. Empty State Handling

When the `content_moderation` table doesn't exist yet (fresh deployment), the service returns an empty list instead of an error:

```python
return [], 0  # No flags, no error
```

The frontend handles this gracefully:
```tsx
{flags.length === 0 && (
  <div className="text-center text-muted-foreground py-12">
    No flags to review. The community is behaving!
  </div>
)}
```

### 5. Security: No Data Leakage

The response includes `reviewer` (the moderator's userId) which is appropriate for the moderation dashboard but should never be exposed to regular users. The frontend only calls this endpoint from the moderator panel.

## Developer Tips

### Common Pitfalls

1. **Not checking moderator role**: Every moderation endpoint must verify the role
   ```python
   # BAD: Any authenticated user can see flags
   @router.get("/moderation/flags")
   async def list_flags(user = Depends(get_current_user)):
       ...

   # GOOD: Only moderators
   @router.get("/moderation/flags")
   async def list_flags(user = Depends(require_moderator)):
       ...
   ```

2. **Assuming ordered results across partitions**: Cross-partition queries don't guarantee time ordering

3. **Large page sizes**: Setting `pageSize=1000` forces a large read. Keep it under 100.

4. **Not handling the empty collection case**: Always catch `COLLECTION_NOT_EXIST`

5. **Exposing internal IDs**: Don't include database-internal fields in the response

### Best Practices

1. **Default to open flags**: The moderator dashboard should default `status=open` to show actionable items first

2. **Add sorting options**: Let moderators sort by date, content type, or reason code

3. **Include content preview**: Fetch the video title or comment text alongside the flag to avoid an extra click

4. **Real-time updates**: Consider WebSocket/SSE for new flag notifications

5. **Batch actions**: Allow moderators to approve/reject multiple flags at once

### Testing Tips

```python
# Test listing flags as moderator
async def test_list_flags_moderator():
    response = await client.get(
        "/api/v1/moderation/flags",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "pagination" in data

# Test status filter
async def test_list_flags_with_status_filter():
    response = await client.get(
        "/api/v1/moderation/flags?status=open",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    data = response.json()
    for flag in data["data"]:
        assert flag["status"] == "open"

# Test forbidden for non-moderator
async def test_list_flags_forbidden():
    response = await client.get(
        "/api/v1/moderation/flags",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )

    assert response.status_code == 403

# Test pagination
async def test_list_flags_pagination():
    response = await client.get(
        "/api/v1/moderation/flags?page=2&pageSize=5",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    data = response.json()
    assert data["pagination"]["currentPage"] == 2
    assert data["pagination"]["pageSize"] == 5
    assert len(data["data"]) <= 5

# Test empty state (no flags)
async def test_list_flags_empty():
    response = await client.get(
        "/api/v1/moderation/flags?status=rejected",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    data = response.json()
    assert len(data["data"]) >= 0  # Could be empty
```

## Related Endpoints

- [POST /api/v1/flags](../flags/POST_flag.md) - Users create flags (feeds this inbox)
- [GET /api/v1/moderation/flags/{flag_id}](./GET_flag_detail.md) - View a specific flag's details
- [POST /api/v1/moderation/flags/{flag_id}/action](./POST_flag_action.md) - Take action on a flag

## Further Learning

- [Cassandra Secondary Indexes (SAI)](https://docs.datastax.com/en/cql-oss/3.3/cql/cql_using/useSecondaryIndex.html)
- [Pagination in Cassandra](https://docs.datastax.com/en/developer/java-driver/4.17/manual/core/paging/)
- [Role-Based Access Control Patterns](https://auth0.com/docs/manage-users/access-control/rbac)
- [Content Moderation at Scale](https://transparency.meta.com/policies/community-standards/)
