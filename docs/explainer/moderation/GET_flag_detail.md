# GET /api/v1/moderation/flags/{flag_id} - Get Flag Details

## Overview

This endpoint retrieves the full details of a specific content flag by its ID. Moderators use this to drill into a flag from the inbox, seeing the complete reason, current status, and review history before deciding what action to take.

**Why it exists**: The flag list (GET /flags) shows a summary view. When a moderator clicks on a flag, they need the complete details -- the full reason text, who reviewed it, when, and what content was flagged. This endpoint provides that single-flag deep dive.

**Real-world analogy**: The flag list is like seeing email subject lines in your inbox. This endpoint is like opening a specific email to read the full message.

## HTTP Details

- **Method**: GET
- **Path**: `/api/v1/moderation/flags/{flag_id}`
- **Auth Required**: Yes (moderator role required)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/moderation.py`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `flag_id` | uuid (timeuuid) | Yes | The unique identifier of the flag |

### Request Example

```http
GET /api/v1/moderation/flags/e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd
Authorization: Bearer <moderator_jwt>
```

### Response Body

```json
{
  "flagId": "e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd",
  "contentId": "550e8400-e29b-41d4-a716-446655440000",
  "contentType": "video",
  "status": "open",
  "flaggedReason": "inappropriate: This video contains misleading medical advice",
  "reviewer": null,
  "reviewDate": null
}
```

**After moderator review**:
```json
{
  "flagId": "e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd",
  "contentId": "550e8400-e29b-41d4-a716-446655440000",
  "contentType": "video",
  "status": "approved",
  "flaggedReason": "inappropriate: This video contains misleading medical advice",
  "reviewer": "aabbccdd-1234-5678-9999-aabbccddeeff",
  "reviewDate": "2026-03-19T16:45:00Z"
}
```

### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{"detail": "Not authenticated"}` |
| 403 | User is not a moderator | `{"detail": "Moderator role required"}` |
| 404 | Flag not found | `{"detail": "Flag not found"}` |

## Cassandra Concepts Explained

### Finding a Row by Clustering Column

The `content_moderation` table has a composite primary key: `(contentid, flagid)`. To look up a flag by `flagid` alone, we face a Cassandra design challenge.

**The problem**: Cassandra is optimized for queries that include the **partition key** (`contentid`). Querying only by `flagid` (the clustering column) requires scanning all partitions.

```cql
-- Efficient: includes partition key
SELECT * FROM content_moderation
WHERE contentid = ? AND flagid = ?;

-- Inefficient: missing partition key
SELECT * FROM content_moderation
WHERE flagid = ?
ALLOW FILTERING;
```

**How the backend handles this**: The Astra Data API's `find_one` can search by any column, but without the partition key it may scan multiple partitions internally.

**Analogy**: Finding a specific folder (flagid) in a filing cabinet. If you know which drawer (contentid), you open it directly. If you only know the folder name, you check every drawer until you find it.

### Why find_one Works

The `find_one` operation returns the first matching document. Since `flagid` is a timeuuid (globally unique), there will be at most one match:

```python
doc = await moderation_table.find_one(filter={"flagid": flag_id})
```

**Under the hood**, this translates to:
```cql
SELECT * FROM content_moderation
WHERE flagid = e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd
LIMIT 1
ALLOW FILTERING;
```

**Performance trade-off**:
- Fast for small tables (acceptable for moderation)
- Would be slow for millions of rows
- A secondary index on `flagid` would help at scale

### TimeUUID as an Identifier

The `flagid` is a timeuuid, which means it encodes the creation timestamp. This gives us two things for free:

1. **Unique identification**: No two flags share the same timeuuid
2. **Timestamp extraction**: You can derive the creation time from the flagid itself

```python
from uuid import UUID
import datetime

def timeuuid_to_datetime(timeuuid: UUID) -> datetime.datetime:
    """Extract timestamp from a timeuuid (UUID v1)."""
    # UUID v1 timestamp is 100-nanosecond intervals since Oct 15, 1582
    timestamp = (timeuuid.time - 0x01b21dd213814000) / 1e7
    return datetime.datetime.fromtimestamp(timestamp, tz=datetime.timezone.utc)
```

**Example**:
```
flagid: e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd
extracted time: 2026-03-19T14:30:00.000Z
```

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

**Column Details for this Endpoint**:

| Column | State: Open | State: Reviewed |
|--------|-------------|-----------------|
| `status` | `"open"` | `"approved"` or `"rejected"` |
| `reviewer` | `null` | Moderator's userId |
| `review_date` | `null` | Timestamp of review |

## Database Queries

### 1. Lookup Flag by ID

**Service Function**: `app/services/flag_service.py` - `get_flag_by_id()`

```python
async def get_flag_by_id(flag_id: UUID) -> Optional[dict]:
    moderation_table = await get_table("content_moderation")

    try:
        doc = await moderation_table.find_one(
            filter={"flagid": str(flag_id)}
        )
    except Exception as e:
        if "COLLECTION_NOT_EXIST" in str(e):
            return None
        raise

    return doc
```

**Equivalent CQL**:
```cql
SELECT contentid, flagid, content_type, status,
       flagged_reason, reviewer, review_date
FROM killrvideo.content_moderation
WHERE flagid = e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd
LIMIT 1
ALLOW FILTERING;
```

**Performance**: **O(n)** worst case (full scan) without a secondary index on `flagid`. For a small moderation table (hundreds to low thousands of rows), this is fast in practice.

**With a secondary index** (recommended for production):
```cql
CREATE CUSTOM INDEX content_moderation_flagid_idx
ON killrvideo.content_moderation(flagid)
USING 'StorageAttachedIndex';
```
This would make the query **O(1)**.

### 2. Endpoint Handler

```python
@router.get("/moderation/flags/{flag_id}")
async def get_flag_detail(
    flag_id: UUID,
    current_user: User = Depends(require_moderator)
):
    flag = await flag_service.get_flag_by_id(flag_id)

    if not flag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flag not found"
        )

    return {
        "flagId": flag["flagid"],
        "contentId": flag["contentid"],
        "contentType": flag["content_type"],
        "status": flag["status"],
        "flaggedReason": flag["flagged_reason"],
        "reviewer": flag.get("reviewer"),
        "reviewDate": flag.get("review_date")
    }
```

**Note the `.get()` for reviewer and review_date**: These columns are null for open/unreviewed flags. Using `.get()` avoids KeyError if the column is absent from the document.

## Implementation Flow

```
┌───────────────────────────────────────────────────────────┐
│ 1. Client sends GET /api/v1/moderation/flags/{flag_id}    │
│    Authorization: Bearer <moderator_jwt>                  │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 2. Authenticate and authorize                             │
│    ├─ No token? → 401 Unauthorized                        │
│    ├─ Not moderator? → 403 Forbidden                      │
│    └─ Moderator? → Continue                               │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 3. Parse flag_id from URL path                            │
│    ├─ Not a valid UUID? → 422 Validation Error            │
│    └─ Valid UUID? → Continue                              │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 4. Query content_moderation by flagid                     │
│    find_one(filter={"flagid": flag_id})                   │
│    ├─ COLLECTION_NOT_EXIST? → Return None (→ 404)         │
│    ├─ No match? → 404 "Flag not found"                    │
│    └─ Found? → Continue                                   │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 5. Map database document to response format               │
│    {flagId, contentId, contentType, status,               │
│     flaggedReason, reviewer, reviewDate}                  │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 6. Return 200 OK with flag details                        │
└───────────────────────────────────────────────────────────┘
```

**Total Queries**: 1 (single `find_one`)

**Expected Latency**: 5-20ms (single document lookup)

## Special Notes

### 1. UUID Parsing from URL Path

The `flag_id` in the URL is a string representation of a timeuuid. FastAPI automatically parses it as a UUID type:

```python
from uuid import UUID

@router.get("/moderation/flags/{flag_id}")
async def get_flag_detail(flag_id: UUID):
    # flag_id is already a UUID object
    # Invalid UUIDs in the URL return 422 automatically
```

**Example valid URL**:
```
/api/v1/moderation/flags/e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd
```

**Example invalid URL** (returns 422):
```
/api/v1/moderation/flags/not-a-uuid
```

### 2. Null Fields for Unreviewed Flags

Open flags have null `reviewer` and `review_date` columns. In Cassandra, null values are stored as **tombstones** (markers indicating absence).

**Important Cassandra behavior**:
- Writing null is not the same as not writing the column
- Excessive nulls create tombstones that affect read performance
- For the moderation table, this is fine -- flags eventually get reviewed

**In the API response**, null values are represented as JSON `null`:
```json
{
  "reviewer": null,
  "reviewDate": null
}
```

### 3. No Caching Recommended

Flag details change state (open -> under_review -> approved/rejected), so caching this endpoint would show stale data. The moderator dashboard should always fetch fresh data.

```python
# Do NOT cache this response
# Cache-Control: no-store
```

### 4. Cross-Referencing Content

The response includes `contentId` and `contentType`, but not the actual content (video title, comment text). The frontend makes a second request to fetch the content details:

```typescript
// Frontend flow
const flag = await api.get(`/moderation/flags/${flagId}`);

// Fetch the flagged content separately
if (flag.contentType === 'video') {
  const video = await api.get(`/videos/${flag.contentId}`);
}
```

**Why not embed the content in the flag response?**
- Separation of concerns -- moderation and content are different domains
- The content might have been deleted since the flag was created
- Keeps the flag response lightweight

### 5. Audit Trail Considerations

Every time a moderator views a flag, it could be logged for audit purposes:

```python
# Not implemented, but recommended
logger.info(
    f"Flag viewed: flag_id={flag_id} moderator={current_user.userid}"
)
```

This helps answer questions like "Did the moderator actually review the flag before taking action?"

## Developer Tips

### Common Pitfalls

1. **Assuming flagid is a regular UUID**: It's a timeuuid (UUID v1), not a random UUID (v4). Some UUID libraries treat them differently.

2. **Not handling 404**: The flag might have been deleted or the ID might be wrong
   ```python
   # Always check the result
   if not flag:
       raise HTTPException(status_code=404, detail="Flag not found")
   ```

3. **Exposing reviewer identity to non-moderators**: Only moderators should see who reviewed a flag

4. **Forgetting ALLOW FILTERING implications**: Querying by `flagid` alone requires scanning. Monitor query latency.

5. **Parsing timeuuid timestamps incorrectly**: The timestamp is in 100-nanosecond intervals since 1582, not Unix epoch

### Best Practices

1. **Include content preview in the response**: Save the frontend an extra API call by embedding the video title or comment text

2. **Add a "viewed" timestamp**: Track when the moderator first saw the flag

3. **Support batch lookups**: Allow fetching multiple flags at once
   ```
   GET /api/v1/moderation/flags?ids=uuid1,uuid2,uuid3
   ```

4. **Add ETag headers**: Enable conditional requests for efficient polling

5. **Log access**: Record who viewed which flags for compliance

### Testing Tips

```python
# Test successful flag detail retrieval
async def test_get_flag_detail():
    # Create a flag first
    flag = await create_test_flag()

    response = await client.get(
        f"/api/v1/moderation/flags/{flag['flagId']}",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["flagId"] == flag["flagId"]
    assert data["status"] == "open"
    assert data["reviewer"] is None
    assert data["reviewDate"] is None

# Test flag not found
async def test_get_flag_not_found():
    fake_id = "00000000-0000-1000-8000-000000000000"
    response = await client.get(
        f"/api/v1/moderation/flags/{fake_id}",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 404

# Test non-moderator access
async def test_get_flag_forbidden():
    flag = await create_test_flag()

    response = await client.get(
        f"/api/v1/moderation/flags/{flag['flagId']}",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )

    assert response.status_code == 403

# Test invalid UUID in path
async def test_get_flag_invalid_uuid():
    response = await client.get(
        "/api/v1/moderation/flags/not-a-valid-uuid",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 422

# Test reviewed flag has reviewer and reviewDate
async def test_get_reviewed_flag():
    flag = await create_and_review_test_flag()

    response = await client.get(
        f"/api/v1/moderation/flags/{flag['flagId']}",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    data = response.json()
    assert data["status"] in ("approved", "rejected")
    assert data["reviewer"] is not None
    assert data["reviewDate"] is not None
```

## Related Endpoints

- [GET /api/v1/moderation/flags](./GET_flags.md) - List all flags (moderator inbox)
- [POST /api/v1/flags](../flags/POST_flag.md) - Create a flag (user-facing)
- [POST /api/v1/moderation/flags/{flag_id}/action](./POST_flag_action.md) - Take action on this flag

## Further Learning

- [Cassandra Composite Keys](https://docs.datastax.com/en/cql-oss/3.3/cql/cql_using/useCompoundPrimaryKeyConcept.html)
- [TimeUUID Functions in CQL](https://docs.datastax.com/en/cql-oss/3.3/cql/cql_reference/timeuuid_functions_r.html)
- [ALLOW FILTERING Explained](https://www.datastax.com/blog/allow-filtering-explained)
- [Astra Data API find_one](https://docs.datastax.com/en/astra-db-serverless/api-reference/collections.html)
