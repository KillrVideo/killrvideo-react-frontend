# POST /api/v1/flags - Flag Content for Moderation

## Overview

This endpoint allows authenticated viewers to flag content (videos or comments) for moderator review. When a user sees something that violates community guidelines, they submit a flag with a reason code and optional description. The system records this in the `content_moderation` table for moderators to review.

**Why it exists**: Community-driven moderation scales better than hiring a team to watch every video. Users are the first line of defense, and flags create a prioritized queue for moderators. This is the same pattern used by YouTube, Reddit, and every major content platform.

**Real-world analogy**: Think of it like a "report" button. Pressing it doesn't remove the content immediately -- it drops a ticket into a moderation inbox so a human can make the final call.

## HTTP Details

- **Method**: POST
- **Path**: `/api/v1/flags`
- **Auth Required**: Yes (any authenticated user -- viewer, creator, or moderator)
- **Success Status**: 201 Created
- **Handler**: `app/api/v1/endpoints/flags.py`

### Request Body

```json
{
  "contentId": "550e8400-e29b-41d4-a716-446655440000",
  "contentType": "video",
  "reasonCode": "inappropriate",
  "reasonText": "This video contains misleading medical advice"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contentId` | uuid | Yes | The ID of the video or comment being flagged |
| `contentType` | string | Yes | Either `"video"` or `"comment"` |
| `reasonCode` | string | Yes | Category: `"inappropriate"`, `"spam"`, `"harassment"`, `"copyright"`, `"other"` |
| `reasonText` | string | No | Free-text explanation from the user |

### Response Body

```json
{
  "flagId": "e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd",
  "contentId": "550e8400-e29b-41d4-a716-446655440000",
  "contentType": "video",
  "status": "open",
  "flaggedReason": "inappropriate: This video contains misleading medical advice",
  "createdAt": "2026-03-19T14:30:00Z"
}
```

### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{"detail": "Not authenticated"}` |
| 404 | Content not found | `{"detail": "Video not found"}` or `{"detail": "Comment not found"}` |
| 422 | Invalid contentType | `{"detail": "contentType must be 'video' or 'comment'"}` |

## Cassandra Concepts Explained

### Composite Primary Key

The `content_moderation` table uses a **composite primary key**: `(contentid, flagid)`.

**Think of it like a filing cabinet**:
- `contentid` is the **drawer** (partition key) -- all flags for one video/comment go in the same drawer
- `flagid` is the **folder within that drawer** (clustering column) -- each flag gets its own folder

```
content_moderation table:
  Drawer: video-abc
    ├── Flag: 2026-03-19T14:30 (spam report)
    ├── Flag: 2026-03-19T15:00 (harassment report)
    └── Flag: 2026-03-20T09:00 (copyright claim)
  Drawer: comment-xyz
    └── Flag: 2026-03-19T16:45 (inappropriate)
```

**Why this design?**
- Fetching all flags for a specific piece of content is O(1) -- just open the right drawer
- Each flag is uniquely identified by the combination of `contentid` + `flagid`
- Multiple users can flag the same content, creating separate flag records

### TimeUUID for Ordering

The `flagid` column uses the `timeuuid` type instead of a regular `uuid`.

**What makes timeuuid special?**
- It embeds a **timestamp** inside the UUID itself
- UUIDs generated later are always **greater** than earlier ones
- This means flags are automatically sorted by creation time within each partition

```
Regular UUID:  550e8400-e29b-41d4-a716-446655440000  (random, no ordering)
TimeUUID:      e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd  (encodes: 2026-03-19T14:30:00Z)
```

**Analogy**: A timeuuid is like a timestamp that also happens to be unique. Two flags created at the exact same millisecond still get different IDs, but they sort in creation order.

### Content Type Enum

The `content_type` column stores `"video"` or `"comment"` as plain text rather than using a Cassandra enum or custom type.

**Why text instead of a native enum?**
- Cassandra doesn't have a built-in ENUM type
- Text is flexible -- adding new content types (e.g., `"playlist"`) requires no schema migration
- Validation happens in application code, not at the database level
- Trade-off: the database won't reject invalid values, so the API must validate

### Graceful Error Handling

The backend handles two specific Astra Data API errors gracefully:

1. **COLLECTION_NOT_EXIST**: The `content_moderation` table hasn't been created yet
2. **UNKNOWN_TABLE_COLUMNS**: A column referenced in the query doesn't exist in the schema

```python
# Instead of crashing, the service returns a clean error
try:
    result = await moderation_table.insert_one(flag_data)
except CollectionNotFoundException:
    # Table doesn't exist yet -- return empty/error gracefully
    raise HTTPException(status_code=503, detail="Moderation system not configured")
```

**Why handle these?** In a microservices world, the moderation table might not exist in every environment (dev, staging). Graceful degradation is better than a 500 error.

## Data Model

### Table: `content_moderation`

```cql
CREATE TABLE killrvideo.content_moderation (
    contentid uuid,              -- ID of the flagged video or comment
    flagid timeuuid,             -- Unique flag ID (time-ordered)
    content_type text,           -- 'video' or 'comment'
    status text,                 -- 'open', 'under_review', 'approved', 'rejected'
    flagged_reason text,         -- Combined: "reasonCode: reasonText"
    reviewer uuid,               -- Moderator who reviewed (null until reviewed)
    review_date timestamp,       -- When moderator took action (null until reviewed)
    PRIMARY KEY (contentid, flagid)
) WITH CLUSTERING ORDER BY (flagid DESC);
```

**Schema Notes**:
- **Partition key** (`contentid`): Groups all flags for one piece of content together
- **Clustering column** (`flagid`): Orders flags within a partition by time (newest first)
- **`flagged_reason`**: Concatenation of `reasonCode` + `reasonText` from the request
- **`status`**: Starts as `"open"`, transitions to `"under_review"`, then `"approved"` or `"rejected"`
- **`reviewer`** and **`review_date`**: NULL until a moderator takes action

### Why Combine reasonCode and reasonText?

The API accepts separate `reasonCode` and `reasonText` fields, but the database stores them as a single `flagged_reason` column:

```python
flagged_reason = f"{reason_code}: {reason_text}" if reason_text else reason_code
# Example: "inappropriate: This video contains misleading medical advice"
# Example: "spam" (no additional text)
```

**Trade-offs**:
- Simpler schema (one column instead of two)
- Still searchable by reason code prefix
- Slightly harder to filter by reason code alone (need string parsing)

## Database Queries

### 1. Validate Content Exists

Before creating a flag, the backend verifies that the target content actually exists.

**Service Function**: `app/services/flag_service.py` - `create_flag()`

```python
async def create_flag(flag_data: FlagCreate, user_id: UUID):
    # Step 1: Validate the content exists
    if flag_data.content_type == "video":
        videos_table = await get_table("videos")
        content = await videos_table.find_one(
            filter={"videoid": flag_data.content_id}
        )
    elif flag_data.content_type == "comment":
        comments_table = await get_table("comments_by_video")
        content = await comments_table.find_one(
            filter={"commentid": flag_data.content_id}
        )

    if not content:
        raise HTTPException(
            status_code=404,
            detail=f"{flag_data.content_type.capitalize()} not found"
        )
```

**Equivalent CQL** (for video):
```cql
SELECT videoid FROM killrvideo.videos
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
```

**Performance**: **O(1)** -- Direct partition key lookup

### 2. Generate TimeUUID and Insert Flag

```python
    # Step 2: Generate timeuuid for the flag
    from uuid import uuid1
    flag_id = uuid1()  # TimeUUID (time-based UUID v1)

    # Step 3: Combine reason fields
    flagged_reason = flag_data.reason_code
    if flag_data.reason_text:
        flagged_reason = f"{flag_data.reason_code}: {flag_data.reason_text}"

    # Step 4: Insert into content_moderation
    moderation_table = await get_table("content_moderation")
    await moderation_table.insert_one({
        "contentid": str(flag_data.content_id),
        "flagid": str(flag_id),
        "content_type": flag_data.content_type,
        "status": "open",
        "flagged_reason": flagged_reason,
        "reviewer": None,
        "review_date": None
    })
```

**Equivalent CQL**:
```cql
INSERT INTO killrvideo.content_moderation (
    contentid, flagid, content_type, status, flagged_reason
) VALUES (
    550e8400-e29b-41d4-a716-446655440000,
    now(),         -- Cassandra's built-in timeuuid generator
    'video',
    'open',
    'inappropriate: This video contains misleading medical advice'
);
```

**Performance**: **O(1)** -- Single partition write

**Note**: In CQL you can use `now()` to generate a server-side timeuuid. The Python backend uses `uuid1()` which generates a client-side timeuuid. Both produce time-ordered UUIDs.

### 3. Error Handling for Missing Table

```python
    try:
        await moderation_table.insert_one(flag_data_dict)
    except Exception as e:
        error_str = str(e)
        if "COLLECTION_NOT_EXIST" in error_str:
            raise HTTPException(
                status_code=503,
                detail="Moderation system not available"
            )
        if "UNKNOWN_TABLE_COLUMNS" in error_str:
            raise HTTPException(
                status_code=503,
                detail="Moderation schema mismatch"
            )
        raise  # Re-raise unexpected errors
```

**Why catch these specifically?**
- `COLLECTION_NOT_EXIST`: The table hasn't been provisioned in this environment
- `UNKNOWN_TABLE_COLUMNS`: Schema was updated but the code references old/new columns
- Both are infrastructure issues, not user errors, so they return 503 (Service Unavailable)

## Implementation Flow

```
┌───────────────────────────────────────────────────────────┐
│ 1. Client sends POST /api/v1/flags                        │
│    {contentId, contentType, reasonCode, reasonText}       │
│    Authorization: Bearer <jwt_token>                      │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 2. Authenticate user from JWT                             │
│    ├─ No token? → 401 Unauthorized                        │
│    └─ Valid token? → Extract userId, continue             │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 3. Validate request body                                  │
│    ├─ contentType not "video" or "comment"? → 422         │
│    ├─ reasonCode missing? → 422                           │
│    └─ Valid? → Continue                                   │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 4. Verify content exists                                  │
│    contentType == "video"?                                │
│      → SELECT FROM videos WHERE videoid = ?               │
│    contentType == "comment"?                              │
│      → SELECT FROM comments_by_video WHERE commentid = ?  │
│    ├─ Not found? → 404 "Video/Comment not found"          │
│    └─ Found? → Continue                                   │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 5. Generate timeuuid flagId                               │
│    flagId = uuid1()  (embeds current timestamp)           │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 6. Combine reason fields                                  │
│    flagged_reason = "inappropriate: user's description"   │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 7. INSERT INTO content_moderation                         │
│    (contentid, flagid, content_type, status,              │
│     flagged_reason, reviewer=NULL, review_date=NULL)      │
│    ├─ COLLECTION_NOT_EXIST? → 503                         │
│    ├─ UNKNOWN_TABLE_COLUMNS? → 503                        │
│    └─ Success? → Continue                                 │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 8. Return 201 Created with flag details                   │
│    {flagId, contentId, contentType, status, ...}          │
└───────────────────────────────────────────────────────────┘
```

**Total Queries**: 2 (1 SELECT to validate content, 1 INSERT to create flag)

**Expected Latency**: 15-30ms

## Special Notes

### 1. Idempotency and Duplicate Flags

The current design allows the **same user to flag the same content multiple times**. Each flag gets a unique `flagid` (timeuuid), so duplicates create separate rows.

**Is this a problem?**
- Moderators may see 10 flags from the same user on one video
- Could be used to "spam" the moderation queue

**Potential fix** (not implemented):
```python
# Check for existing flag from this user on this content
existing = await moderation_table.find_one(filter={
    "contentid": str(content_id),
    "flagged_by": str(user_id)  # Would need a new column
})
if existing:
    return existing  # Return the existing flag, don't create a new one
```

**Trade-off**: Adding a `flagged_by` column and uniqueness check adds complexity. For KillrVideo's scale, duplicate flags are acceptable.

### 2. No Rate Limiting on Flags

Currently, there is no rate limit on flag creation. A malicious user could:
- Flag every video on the platform
- Create thousands of flags per minute

**Recommended mitigation**:
```python
# Redis-based rate limit (not implemented)
key = f"flags:{user_id}:{datetime.now().strftime('%Y-%m-%d')}"
count = await redis.incr(key)
await redis.expire(key, 86400)  # 24-hour window

if count > 50:  # Max 50 flags per day
    raise HTTPException(status_code=429, detail="Flag limit exceeded")
```

### 3. The flagged_reason Concatenation Pattern

The API accepts structured data (`reasonCode` + `reasonText`) but stores it as a single string. This is a deliberate simplification.

**Structured approach** (alternative):
```cql
CREATE TABLE content_moderation (
    ...
    reason_code text,     -- 'inappropriate', 'spam', etc.
    reason_text text,     -- Free-form user description
    ...
);
```

**Current approach**:
```cql
CREATE TABLE content_moderation (
    ...
    flagged_reason text,  -- 'inappropriate: user description here'
    ...
);
```

**Why one column?**
- Fewer columns = simpler schema
- The reason code is always the prefix, so it's extractable
- Most moderator UIs display the full reason as one field anyway

### 4. Astra Data API vs Native CQL

The backend uses the Astra Data API (HTTP/JSON) rather than native CQL:

```python
# Data API (what the backend uses)
await moderation_table.insert_one({
    "contentid": str(content_id),
    "flagid": str(flag_id),
    ...
})

# Native CQL equivalent
# session.execute(
#     "INSERT INTO content_moderation (contentid, flagid, ...) VALUES (?, ?, ...)",
#     [content_id, flag_id, ...]
# )
```

**Why Data API?**
- HTTP-based (works through firewalls, load balancers)
- JSON format (easier to work with in Python)
- Built-in connection pooling and retry logic
- No need to manage CQL driver connections

### 5. Content Validation is Eventual

The content existence check (`find_one` on videos/comments) only verifies the content exists **at the time of flagging**. If the content is deleted between the check and the flag insertion, the flag still gets created for a now-deleted piece of content.

**This is acceptable because**:
- The window is milliseconds (negligible risk)
- Moderators can handle "flag for deleted content" gracefully
- Adding distributed transactions would be extreme overkill

## Developer Tips

### Common Pitfalls

1. **Forgetting to validate contentType**: Always check it's `"video"` or `"comment"` before querying
   ```python
   # BAD: Trusts user input
   table = await get_table(f"{content_type}s")

   # GOOD: Explicit validation
   if content_type not in ("video", "comment"):
       raise HTTPException(status_code=422, detail="Invalid content type")
   ```

2. **Using uuid4 instead of uuid1**: Regular UUIDs don't embed timestamps
   ```python
   # BAD: Random UUID, no time ordering
   flag_id = uuid4()

   # GOOD: TimeUUID, ordered by creation time
   flag_id = uuid1()
   ```

3. **Not handling the 503 case**: If the moderation table doesn't exist, the frontend should show a graceful error, not a blank screen

4. **Storing user-provided HTML in reasonText**: Always sanitize free-text input
   ```python
   # Sanitize to prevent XSS if displayed in moderator UI
   import bleach
   reason_text = bleach.clean(flag_data.reason_text)
   ```

5. **Assuming flags are unique per user**: The same user can flag the same content multiple times

### Best Practices

1. **Log all flag creation**: Flags are security-relevant events
   ```python
   logger.info(f"Flag created: user={user_id} content={content_id} reason={reason_code}")
   ```

2. **Include the flagger's userId**: Consider adding a `flagged_by` column for audit trails

3. **Validate reason codes server-side**: Don't trust client-side validation alone

4. **Consider flag aggregation**: If 10 users flag the same video, auto-escalate priority

5. **Test with missing tables**: Ensure the 503 path works correctly

### Testing Tips

```python
# Test successful flag creation
async def test_create_flag():
    response = await client.post(
        "/api/v1/flags",
        json={
            "contentId": "550e8400-e29b-41d4-a716-446655440000",
            "contentType": "video",
            "reasonCode": "spam",
            "reasonText": "This is a spam video"
        },
        headers={"Authorization": f"Bearer {viewer_token}"}
    )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "open"
    assert "flagId" in data
    assert "spam" in data["flaggedReason"]

# Test flagging non-existent content
async def test_flag_missing_content():
    response = await client.post(
        "/api/v1/flags",
        json={
            "contentId": "00000000-0000-0000-0000-000000000000",
            "contentType": "video",
            "reasonCode": "spam"
        },
        headers={"Authorization": f"Bearer {viewer_token}"}
    )

    assert response.status_code == 404

# Test unauthenticated flag attempt
async def test_flag_unauthenticated():
    response = await client.post(
        "/api/v1/flags",
        json={
            "contentId": "550e8400-e29b-41d4-a716-446655440000",
            "contentType": "video",
            "reasonCode": "spam"
        }
    )

    assert response.status_code == 401

# Test invalid content type
async def test_flag_invalid_content_type():
    response = await client.post(
        "/api/v1/flags",
        json={
            "contentId": "550e8400-e29b-41d4-a716-446655440000",
            "contentType": "playlist",
            "reasonCode": "spam"
        },
        headers={"Authorization": f"Bearer {viewer_token}"}
    )

    assert response.status_code == 422
```

## Related Endpoints

- [GET /api/v1/moderation/flags](../moderation/GET_flags.md) - Moderators view the flag queue
- [GET /api/v1/moderation/flags/{flag_id}](../moderation/GET_flag_detail.md) - View flag details
- [POST /api/v1/moderation/flags/{flag_id}/action](../moderation/POST_flag_action.md) - Take action on a flag

## Further Learning

- [Cassandra Composite Primary Keys](https://docs.datastax.com/en/cql-oss/3.3/cql/cql_using/useCompoundPrimaryKeyConcept.html)
- [TimeUUID in Cassandra](https://docs.datastax.com/en/cql-oss/3.3/cql/cql_reference/timeuuid_functions_r.html)
- [Content Moderation Best Practices](https://www.twitch.tv/p/en/legal/community-guidelines/)
- [Astra Data API Documentation](https://docs.datastax.com/en/astra-db-serverless/api-reference/overview.html)
