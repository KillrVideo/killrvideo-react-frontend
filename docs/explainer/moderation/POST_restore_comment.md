# POST /api/v1/moderation/comments/{comment_id}/restore - Restore Soft-Deleted Comment

## Overview

This endpoint restores a comment that was previously soft-deleted due to moderation action. Like the video restore endpoint, this is currently a **stub** -- it validates that the comment exists and returns a success/failure response, but does not yet perform the full restore workflow.

**Why it exists**: Comments are frequently flagged for harassment, spam, or other violations. When a moderator hides a comment and later determines it was a false positive, they need a way to bring it back. Without this, legitimate discussion gets permanently silenced by mistake.

**Real-world analogy**: Think of a chat moderator who times out the wrong person. The "unban" button lets them fix the mistake. This endpoint is the "unban" for comments.

## HTTP Details

- **Method**: POST
- **Path**: `/api/v1/moderation/comments/{comment_id}/restore`
- **Auth Required**: Yes (moderator role required)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/moderation.py`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `comment_id` | uuid (timeuuid) | Yes | The ID of the comment to restore |

### Request Example

```http
POST /api/v1/moderation/comments/d4d5e6f0-5678-11f0-cccc-ddddeeeeaaaa/restore
Authorization: Bearer <moderator_jwt>
```

No request body is needed.

### Response Body (Success)

```json
{
  "commentId": "d4d5e6f0-5678-11f0-cccc-ddddeeeeaaaa",
  "status": "restored",
  "message": "Comment restored successfully"
}
```

### Response Body (Not Found)

```json
{
  "commentId": "d4d5e6f0-5678-11f0-cccc-ddddeeeeaaaa",
  "status": "not_found",
  "message": "Comment not found"
}
```

### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{"detail": "Not authenticated"}` |
| 403 | User is not a moderator | `{"detail": "Moderator role required"}` |
| 404 | Comment does not exist | `{"detail": "Comment not found"}` |

## Cassandra Concepts Explained

### Denormalized Comments: The Multi-Table Challenge

Comments in KillrVideo are stored in **multiple tables** to support different query patterns. This is a core Cassandra principle: duplicate data to avoid joins and enable fast reads.

**Table 1: `comments_by_video`** -- "Show all comments on this video"
```cql
CREATE TABLE killrvideo.comments_by_video (
    videoid uuid,
    commentid timeuuid,
    userid uuid,
    comment text,
    PRIMARY KEY (videoid, commentid)
) WITH CLUSTERING ORDER BY (commentid DESC);
```

**Table 2: `comments_by_user`** -- "Show all comments by this user"
```cql
CREATE TABLE killrvideo.comments_by_user (
    userid uuid,
    commentid timeuuid,
    videoid uuid,
    comment text,
    PRIMARY KEY (userid, commentid)
) WITH CLUSTERING ORDER BY (commentid DESC);
```

**The same comment exists in both tables**. When you hide or restore a comment, you must update **both**. Miss one, and you get data inconsistency:

```
Scenario: Hide comment in comments_by_video but not comments_by_user
Result: Comment disappears from the video page but still shows on the user's profile
```

### The Cascade Problem

Restoring a comment requires updating every table that stores it:

```
┌────────────────────────┐
│ Restore comment abc    │
├────────────────────────┤
│ 1. comments_by_video   │ → Update status = 'active'
│ 2. comments_by_user    │ → Update status = 'active'
│ 3. video_comment_count │ → Increment count (if tracked)
└────────────────────────┘
```

**In SQL**, you would update one table and a view or join handles the rest:
```sql
UPDATE comments SET status = 'active' WHERE comment_id = ?;
-- Views automatically reflect the change
```

**In Cassandra**, each table is independent. There are no views that auto-update. The application must update each table explicitly.

**Analogy**: Imagine you have the same document filed in three different filing cabinets (by date, by author, by topic). To update the document, you need to visit all three cabinets and swap out the old version.

### Soft Deletes in Comment Tables

For soft deletes, each comment table needs a `status` column:

```cql
-- Planned schema addition
ALTER TABLE killrvideo.comments_by_video ADD status text;
ALTER TABLE killrvideo.comments_by_user ADD status text;
```

**Query impact**: Every query that reads comments must filter by status:

```python
# Before soft deletes (simple)
cursor = comments_by_video_table.find(
    filter={"videoid": str(video_id)}
)

# After soft deletes (must filter)
cursor = comments_by_video_table.find(
    filter={"videoid": str(video_id), "status": "active"}
)
```

This is a fundamental trade-off of soft deletes: **every read query becomes slightly more complex**, but you gain the ability to restore data.

### TimeUUID Comment IDs

Comments use `timeuuid` for their IDs, just like flags. This means:
- Comments are naturally ordered by creation time
- The comment ID encodes when it was posted
- No separate `created_at` column is needed (though one may exist for convenience)

```
commentid: d4d5e6f0-5678-11f0-cccc-ddddeeeeaaaa
embedded timestamp: 2026-03-19T12:30:00Z
```

## Data Model

### Table: `comments_by_video`

```cql
CREATE TABLE killrvideo.comments_by_video (
    videoid uuid,
    commentid timeuuid,
    userid uuid,
    comment text,
    -- Planned for soft deletes:
    -- status text,          -- 'active', 'hidden'
    -- hidden_date timestamp,
    -- hidden_by uuid,
    PRIMARY KEY (videoid, commentid)
) WITH CLUSTERING ORDER BY (commentid DESC);
```

**Partition key**: `videoid` -- Groups all comments for one video together
**Clustering column**: `commentid` -- Orders comments by time within a video

### Table: `comments_by_user`

```cql
CREATE TABLE killrvideo.comments_by_user (
    userid uuid,
    commentid timeuuid,
    videoid uuid,
    comment text,
    -- Planned for soft deletes:
    -- status text,
    -- hidden_date timestamp,
    -- hidden_by uuid,
    PRIMARY KEY (userid, commentid)
) WITH CLUSTERING ORDER BY (commentid DESC);
```

**Partition key**: `userid` -- Groups all comments by one user together
**Clustering column**: `commentid` -- Orders comments by time within a user's history

### The Denormalization Map

```
Comment "abc" by User "john" on Video "xyz":

comments_by_video:
  Partition: xyz (video)
    Row: {commentid: abc, userid: john, comment: "Great video!"}

comments_by_user:
  Partition: john (user)
    Row: {commentid: abc, videoid: xyz, comment: "Great video!"}
```

Both rows represent the same logical comment. Both must be updated during hide/restore.

## Database Queries

### 1. Check Comment Exists (Current Stub)

**Service Function**: `app/services/comment_service.py` - `restore_comment()`

```python
async def restore_comment(comment_id: UUID) -> dict:
    comments_table = await get_table("comments_by_video")

    # Step 1: Search for the comment across all video partitions
    comment = await comments_table.find_one(
        filter={"commentid": str(comment_id)}
    )

    if not comment:
        return {
            "commentId": str(comment_id),
            "status": "not_found",
            "message": "Comment not found"
        }

    # Step 2: Stub -- return success
    return {
        "commentId": str(comment_id),
        "status": "restored",
        "message": "Comment restored successfully"
    }
```

**Equivalent CQL**:
```cql
SELECT * FROM killrvideo.comments_by_video
WHERE commentid = d4d5e6f0-5678-11f0-cccc-ddddeeeeaaaa
LIMIT 1
ALLOW FILTERING;
```

**Performance**: **O(n)** without a secondary index on `commentid` (scans partitions). For small datasets this is acceptable; for production, add a SAI index.

### 2. Future Implementation (Full Restore)

```python
async def restore_comment(comment_id: UUID, moderator_id: UUID) -> dict:
    comments_by_video = await get_table("comments_by_video")
    comments_by_user = await get_table("comments_by_user")

    # Step 1: Find the comment
    comment = await comments_by_video.find_one(
        filter={"commentid": str(comment_id)}
    )

    if not comment:
        return {"status": "not_found"}

    if comment.get("status") != "hidden":
        return {"status": "already_active"}

    # Step 2: Restore in comments_by_video
    await comments_by_video.update_one(
        filter={
            "videoid": comment["videoid"],
            "commentid": str(comment_id)
        },
        update={"$set": {
            "status": "active",
            "hidden_date": None,
            "hidden_by": None
        }}
    )

    # Step 3: Restore in comments_by_user (cascade)
    await comments_by_user.update_one(
        filter={
            "userid": comment["userid"],
            "commentid": str(comment_id)
        },
        update={"$set": {
            "status": "active",
            "hidden_date": None,
            "hidden_by": None
        }}
    )

    # Step 4: Log the restoration
    logger.info(
        f"Comment restored: comment_id={comment_id} "
        f"video_id={comment['videoid']} "
        f"moderator={moderator_id}"
    )

    return {"status": "restored"}
```

**Equivalent CQL for the cascade restore**:
```cql
-- Update in comments_by_video
UPDATE killrvideo.comments_by_video
SET status = 'active', hidden_date = null, hidden_by = null
WHERE videoid = <video_uuid>
  AND commentid = d4d5e6f0-5678-11f0-cccc-ddddeeeeaaaa;

-- Update in comments_by_user
UPDATE killrvideo.comments_by_user
SET status = 'active', hidden_date = null, hidden_by = null
WHERE userid = <user_uuid>
  AND commentid = d4d5e6f0-5678-11f0-cccc-ddddeeeeaaaa;
```

**Performance**: **O(1)** per table (both use full primary key in the filter)

## Implementation Flow

```
┌───────────────────────────────────────────────────────────┐
│ 1. Client sends POST /moderation/comments/{comment_id}/   │
│    restore                                                │
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
│ 3. Parse comment_id from URL path                         │
│    ├─ Invalid UUID? → 422 Validation Error                │
│    └─ Valid UUID? → Continue                              │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 4. Look up comment in comments_by_video                   │
│    find_one(filter={"commentid": comment_id})             │
│    ├─ Not found? → Return {status: "not_found"}           │
│    └─ Found? → Continue                                   │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 5. [STUB] Return success                                  │
│    {status: "restored", message: "Comment restored..."}   │
│                                                           │
│    [FUTURE] Full implementation:                          │
│    ├─ Check comment.status == "hidden"                    │
│    ├─ Update comments_by_video (status → "active")        │
│    ├─ Update comments_by_user (status → "active")         │
│    └─ Write audit log                                     │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 6. Return 200 OK with restore result                      │
└───────────────────────────────────────────────────────────┘
```

**Current queries**: 1 (existence check)

**Future queries**: 3 (find + update comments_by_video + update comments_by_user)

**Expected Latency**: 5-15ms (stub) or 20-40ms (full implementation)

## Special Notes

### 1. Finding a Comment Without the Partition Key

The `comments_by_video` table is partitioned by `videoid`, but the restore endpoint only has the `commentid`. To find the comment efficiently, we have two options:

**Option A: Scan with ALLOW FILTERING** (current approach)
```python
comment = await comments_table.find_one(
    filter={"commentid": str(comment_id)}
)
```
This scans all partitions. Acceptable for small tables, slow for millions of comments.

**Option B: Add a lookup table**
```cql
CREATE TABLE killrvideo.comments_by_id (
    commentid timeuuid PRIMARY KEY,
    videoid uuid,
    userid uuid
);
```
This enables O(1) lookup, then use the `videoid` and `userid` to update the other tables.

**Option C: SAI index on commentid**
```cql
CREATE CUSTOM INDEX comments_commentid_idx
ON killrvideo.comments_by_video(commentid)
USING 'StorageAttachedIndex';
```

**Recommended for production**: Option B (lookup table) or Option C (SAI index).

### 2. Partial Restore Failure

What if the restore succeeds in `comments_by_video` but fails in `comments_by_user`?

```
Update comments_by_video → Success ✓
Update comments_by_user → Network error ✗
```

**Result**: The comment appears on the video page but is still hidden on the user's profile. This is **data inconsistency**.

**Mitigation strategies**:

1. **Retry with exponential backoff**:
   ```python
   for attempt in range(3):
       try:
           await comments_by_user.update_one(...)
           break
       except Exception:
           await asyncio.sleep(2 ** attempt)
   ```

2. **Background reconciliation job**: Periodically compare `comments_by_video` and `comments_by_user` for status mismatches.

3. **Accept eventual consistency**: Document that the second table may be briefly inconsistent.

4. **Saga pattern**: Record the restore intent, execute both updates, confirm completion. If one fails, compensate.

### 3. Comment Text Preservation

When a comment is hidden, the text should be preserved (not deleted) so it can be shown again upon restoration:

```
Hidden comment:
{
  commentid: "abc",
  comment: "Great video!",     ← Text preserved
  status: "hidden",
  hidden_date: "2026-03-19T14:00:00Z",
  hidden_by: "moderator-uuid"
}

After restore:
{
  commentid: "abc",
  comment: "Great video!",     ← Text still there
  status: "active",
  hidden_date: null,
  hidden_by: null
}
```

If the text were deleted during hiding, restoration would be impossible. This is why soft deletes are essential.

### 4. Impact on Comment Counts

Videos track comment counts (possibly via a counter table or computed field). Hiding a comment should decrement the count; restoring should increment it:

```python
# Future: update comment count on restore
await video_stats_table.update_one(
    filter={"videoid": comment["videoid"]},
    update={"$inc": {"comment_count": 1}}
)
```

**Current stub**: Does not adjust counts.

### 5. Notification Considerations

Several parties might need to be notified when a comment is restored:

- **Comment author**: "Your comment has been restored"
- **Video owner**: "A previously hidden comment on your video has been restored"
- **Original flagger**: "The comment you reported has been reinstated"

**None of these are implemented** in the current stub, but they're important for a complete moderation workflow.

### 6. Timestamps and Ordering

When a comment is restored, should it appear at its **original position** (by creation time) or at the **top** (as if just posted)?

**Original position** (recommended):
- The `commentid` timeuuid preserves the original timestamp
- Restoring doesn't change the commentid
- The comment slots back into its chronological position

**This happens naturally** in Cassandra because the clustering column (`commentid`) determines sort order, and the commentid doesn't change during restore.

## Developer Tips

### Common Pitfalls

1. **Updating only one table**: Always update both `comments_by_video` and `comments_by_user`

2. **Not handling the scan performance**: `find_one` by `commentid` without `videoid` is a full scan. Plan for this.

3. **Ignoring comment counts**: If you track comment counts, restore must increment them.

4. **Assuming the comment text is still there**: If someone hard-deleted the comment, there's nothing to restore.

5. **Not logging the restoration**: Every moderation action should be auditable.

### Best Practices

1. **Build the lookup table early**: `comments_by_id` will save significant pain later
   ```cql
   CREATE TABLE killrvideo.comments_by_id (
       commentid timeuuid PRIMARY KEY,
       videoid uuid,
       userid uuid
   );
   ```

2. **Test the cascade**: Always verify both tables are updated after a restore

3. **Add a restore reason**:
   ```json
   POST /restore
   {"reason": "False positive - comment was constructive criticism"}
   ```

4. **Implement batch operations**: Let moderators restore multiple comments at once

5. **Keep the stub interface stable**: Even though this is a stub, don't change the response format when implementing the full version

### Testing Tips

```python
# Test stub returns success for existing comment
async def test_restore_existing_comment():
    comment = await create_test_comment()

    response = await client.post(
        f"/api/v1/moderation/comments/{comment['commentId']}/restore",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "restored"

# Test restore non-existent comment
async def test_restore_missing_comment():
    fake_id = "00000000-0000-1000-8000-000000000000"

    response = await client.post(
        f"/api/v1/moderation/comments/{fake_id}/restore",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    data = response.json()
    assert data["status"] == "not_found" or response.status_code == 404

# Test non-moderator access
async def test_restore_comment_forbidden():
    comment = await create_test_comment()

    response = await client.post(
        f"/api/v1/moderation/comments/{comment['commentId']}/restore",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )

    assert response.status_code == 403

# Test unauthenticated access
async def test_restore_comment_unauthenticated():
    response = await client.post(
        "/api/v1/moderation/comments/d4d5e6f0-5678-11f0-cccc-ddddeeeeaaaa/restore"
    )

    assert response.status_code == 401

# Future: test full restore with cascade
async def test_restore_cascade():
    comment = await create_test_comment(video_id=test_video_id)

    # Hide the comment
    await hide_comment(comment["commentId"])

    # Verify hidden in both tables
    by_video = await get_comments_for_video(test_video_id)
    assert comment["commentId"] not in [c["commentId"] for c in by_video]

    # Restore
    response = await client.post(
        f"/api/v1/moderation/comments/{comment['commentId']}/restore",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.json()["status"] == "restored"

    # Verify restored in both tables
    by_video = await get_comments_for_video(test_video_id)
    assert comment["commentId"] in [c["commentId"] for c in by_video]

    by_user = await get_comments_for_user(comment["userId"])
    assert comment["commentId"] in [c["commentId"] for c in by_user]
```

## Related Endpoints

- [POST /api/v1/moderation/flags/{flag_id}/action](./POST_flag_action.md) - Approve/reject flags that may hide comments
- [POST /api/v1/moderation/videos/{video_id}/restore](./POST_restore_video.md) - Restore hidden videos
- [GET /api/v1/videos/{videoId}/comments](../comments_ratings/GET_comments.md) - View comments on a video

## Further Learning

- [Denormalization in Cassandra](https://www.datastax.com/blog/basic-rules-cassandra-data-modeling)
- [Saga Pattern for Distributed Transactions](https://microservices.io/patterns/data/saga.html)
- [Soft Delete Patterns](https://www.baeldung.com/spring-jpa-soft-delete)
- [Cassandra Data Modeling Best Practices](https://docs.datastax.com/en/dse/6.8/cql/cql/ddl/dataModelingCQLTOC.html)
