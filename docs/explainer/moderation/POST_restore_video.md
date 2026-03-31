# POST /api/v1/moderation/videos/{video_id}/restore - Restore Soft-Deleted Video

## Overview

This endpoint restores a video that was previously soft-deleted (hidden from public view due to moderation action). It is currently implemented as a **stub** -- the endpoint exists and validates inputs, but the full restore workflow is not yet complete. This is intentional: the endpoint establishes the API contract for frontend development while the backend implementation catches up.

**Why it exists**: When moderators approve a flag and hide a video, they sometimes need to reverse the decision. False positives happen -- a legitimate educational video might be flagged as "inappropriate," and a second moderator realizes the flag was wrong. Without a restore endpoint, hidden content is permanently lost.

**Real-world analogy**: Think of the "Recycle Bin" on your computer. When you delete a file, it goes to the trash. The restore endpoint is the "Put Back" button. The file was never truly deleted -- just hidden.

## HTTP Details

- **Method**: POST
- **Path**: `/api/v1/moderation/videos/{video_id}/restore`
- **Auth Required**: Yes (moderator role required)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/moderation.py`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `video_id` | uuid | Yes | The ID of the video to restore |

### Request Example

```http
POST /api/v1/moderation/videos/550e8400-e29b-41d4-a716-446655440000/restore
Authorization: Bearer <moderator_jwt>
```

No request body is needed.

### Response Body (Success)

```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "restored",
  "message": "Video restored successfully"
}
```

### Response Body (Video Not Found)

```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "not_found",
  "message": "Video not found or already active"
}
```

### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{"detail": "Not authenticated"}` |
| 403 | User is not a moderator | `{"detail": "Moderator role required"}` |
| 404 | Video does not exist | `{"detail": "Video not found"}` |

## Cassandra Concepts Explained

### Soft Deletes vs Hard Deletes

There are two ways to "delete" data in any database:

**Hard delete**: Remove the row entirely
```cql
DELETE FROM killrvideo.videos WHERE videoid = ?;
```
- Data is gone forever (after compaction)
- Cannot be undone
- Creates tombstones in Cassandra

**Soft delete**: Mark the row as hidden
```cql
UPDATE killrvideo.videos
SET status = 'hidden', hidden_date = toTimestamp(now())
WHERE videoid = ?;
```
- Data still exists in the database
- Can be restored by changing the status back
- No tombstones created
- Queries must filter by status

**KillrVideo uses soft deletes for moderated content** because:
1. Moderation decisions can be reversed
2. Legal holds may require preserving content
3. Analytics still need access to hidden content metadata
4. Hard deletes create Cassandra tombstones (performance impact)

### Tombstone Problem with Hard Deletes

When you DELETE a row in Cassandra, it doesn't immediately remove the data. Instead, it writes a **tombstone** -- a marker that says "this row is deleted."

```
Before DELETE:
  Row: {videoid: abc, name: "My Video", status: "active"}

After DELETE:
  Tombstone: {videoid: abc, deleted_at: T+0}
  (Original data still on disk until compaction)
```

**Why tombstones are problematic**:
- They accumulate until compaction runs
- Reads must skip over tombstones (slower reads)
- Too many tombstones can cause read timeouts
- Default tombstone TTL (gc_grace_seconds) is 10 days

**Soft deletes avoid this entirely** -- no tombstones, just an updated column.

### The Status Column Pattern

Soft deletes require a status column to distinguish active from hidden content:

```cql
CREATE TABLE killrvideo.videos (
    videoid uuid PRIMARY KEY,
    ...
    status text,      -- 'active', 'hidden', 'pending_review'
    hidden_date timestamp,
    hidden_by uuid    -- Moderator who hid the video
);
```

**Query patterns**:
```cql
-- Public API: only show active videos
SELECT * FROM videos WHERE status = 'active';

-- Moderator API: show hidden videos for restoration
SELECT * FROM videos WHERE status = 'hidden';

-- Restore: change status back to active
UPDATE videos SET status = 'active', hidden_date = null, hidden_by = null
WHERE videoid = ?;
```

**Note**: These queries require a SAI index on `status` to be efficient.

### Denormalized Data and Cascade Restores

In KillrVideo, video data exists in multiple tables:
- `videos` -- Main video table
- `latest_videos` -- Timeline of recently added videos
- `user_videos` -- Videos organized by uploader

When a video is hidden, ideally all copies should be marked. When restored, all copies should be un-marked. This is the **cascade problem** in denormalized databases.

```
Hide video:
  videos.status = 'hidden'
  latest_videos: remove entry (or mark hidden)
  user_videos: mark hidden

Restore video:
  videos.status = 'active'
  latest_videos: re-insert entry
  user_videos: mark active
```

**The current stub does not handle cascading** -- it only checks the main `videos` table.

## Data Model

### Table: `videos`

```cql
CREATE TABLE killrvideo.videos (
    videoid uuid PRIMARY KEY,
    added_date timestamp,
    description text,
    name text,
    tags set<text>,
    content_features vector<float, 4096>,
    userid uuid,
    preview_image_location text
    -- Note: a 'status' column for soft deletes is planned but not yet in schema
);
```

**Planned additions for soft delete support**:
```cql
ALTER TABLE killrvideo.videos ADD status text;
ALTER TABLE killrvideo.videos ADD hidden_date timestamp;
ALTER TABLE killrvideo.videos ADD hidden_by uuid;
ALTER TABLE killrvideo.videos ADD hidden_reason text;
```

### Related Tables (affected by restore)

```cql
-- Would need cascade restore
CREATE TABLE killrvideo.latest_videos (
    yyyymmdd text,
    added_date timestamp,
    videoid uuid,
    ...
    PRIMARY KEY (yyyymmdd, added_date, videoid)
) WITH CLUSTERING ORDER BY (added_date DESC);

CREATE TABLE killrvideo.user_videos (
    userid uuid,
    added_date timestamp,
    videoid uuid,
    ...
    PRIMARY KEY (userid, added_date, videoid)
) WITH CLUSTERING ORDER BY (added_date DESC);
```

## Database Queries

### 1. Check Video Exists (Current Stub Implementation)

**Service Function**: `app/services/video_service.py` - `restore_video()`

```python
async def restore_video(video_id: UUID) -> dict:
    videos_table = await get_table("videos")

    # Step 1: Check if the video exists
    video = await videos_table.find_one(
        filter={"videoid": str(video_id)}
    )

    if not video:
        return {
            "videoId": str(video_id),
            "status": "not_found",
            "message": "Video not found or already active"
        }

    # Step 2: Stub -- return success without actually changing anything
    return {
        "videoId": str(video_id),
        "status": "restored",
        "message": "Video restored successfully"
    }
```

**Equivalent CQL**:
```cql
SELECT * FROM killrvideo.videos
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
```

**Performance**: **O(1)** -- Direct partition key lookup

### 2. Future Implementation (Full Restore)

When soft deletes are fully implemented, the restore logic would look like:

```python
async def restore_video(video_id: UUID, moderator_id: UUID) -> dict:
    videos_table = await get_table("videos")

    # Step 1: Find the hidden video
    video = await videos_table.find_one(
        filter={"videoid": str(video_id)}
    )

    if not video:
        return {"status": "not_found", "message": "Video not found"}

    if video.get("status") != "hidden":
        return {"status": "already_active", "message": "Video is already active"}

    # Step 2: Restore the video
    await videos_table.update_one(
        filter={"videoid": str(video_id)},
        update={"$set": {
            "status": "active",
            "hidden_date": None,
            "hidden_by": None,
            "hidden_reason": None
        }}
    )

    # Step 3: Cascade restore to denormalized tables
    await _restore_in_latest_videos(video)
    await _restore_in_user_videos(video)

    # Step 4: Log the restoration
    logger.info(
        f"Video restored: video_id={video_id} "
        f"moderator={moderator_id}"
    )

    return {"status": "restored", "message": "Video restored successfully"}
```

**Equivalent CQL for the restore**:
```cql
UPDATE killrvideo.videos
SET status = 'active',
    hidden_date = null,
    hidden_by = null,
    hidden_reason = null
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
```

**Performance**: **O(1)** for main table + **O(1)** for each denormalized table

## Implementation Flow

```
┌───────────────────────────────────────────────────────────┐
│ 1. Client sends POST /moderation/videos/{video_id}/       │
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
│ 3. Parse video_id from URL path                           │
│    ├─ Invalid UUID? → 422 Validation Error                │
│    └─ Valid UUID? → Continue                              │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 4. Check video exists                                     │
│    find_one(filter={"videoid": video_id})                 │
│    ├─ Not found? → Return {status: "not_found"}           │
│    └─ Found? → Continue                                   │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 5. [STUB] Return success                                  │
│    {status: "restored", message: "Video restored..."}     │
│                                                           │
│    [FUTURE] Full implementation:                          │
│    ├─ Check video.status == "hidden"                      │
│    ├─ Update videos table (status → "active")             │
│    ├─ Cascade to latest_videos                            │
│    ├─ Cascade to user_videos                              │
│    └─ Write audit log                                     │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 6. Return 200 OK with restore result                      │
└───────────────────────────────────────────────────────────┘
```

**Current queries**: 1 (existence check only)

**Future queries**: 4+ (check + update main + cascade to denormalized tables + audit)

**Expected Latency**: 5-15ms (stub) or 30-60ms (full implementation)

## Special Notes

### 1. Stub Implementation Pattern

The endpoint is a stub that returns success without making changes. This is a common pattern in API-first development:

```python
# Stub: validates input, returns expected response shape
async def restore_video(video_id: UUID) -> dict:
    video = await videos_table.find_one(filter={"videoid": str(video_id)})
    if not video:
        return {"status": "not_found"}
    return {"status": "restored"}  # Doesn't actually restore anything
```

**Why ship stubs?**
- Frontend can build against the real API contract
- Integration tests can verify request/response shapes
- Backend can be implemented incrementally
- The API surface is locked in early

**Danger of stubs**: Frontend developers might assume it works. Document stub endpoints clearly and return a header or field indicating stub status:
```python
response.headers["X-Stub-Implementation"] = "true"
```

### 2. Cascading Across Denormalized Tables

Restoring a video in Cassandra is more complex than in a SQL database because data is denormalized:

**SQL approach** (single table):
```sql
UPDATE videos SET status = 'active' WHERE video_id = ?;
-- Done! All queries see the restored video.
```

**Cassandra approach** (multiple tables):
```python
# Must update every table that contains video data
await videos_table.update_one(...)        # Main table
await latest_videos_table.insert_one(...) # Re-add to timeline
await user_videos_table.update_one(...)   # Re-add to user's videos
# Any other denormalized tables...
```

**Risk**: If one update succeeds and another fails, the data is inconsistent across tables. This is the fundamental trade-off of denormalization.

**Mitigation strategies**:
1. Retry failed updates
2. Background reconciliation job
3. Write all updates, then verify consistency
4. Accept eventual consistency (last resort)

### 3. The "Already Active" Edge Case

What happens if a moderator tries to restore a video that isn't hidden?

```python
# Current stub: always returns "restored" if video exists
# Future: should check status first

if video.get("status") == "active":
    return {
        "status": "already_active",
        "message": "Video is not hidden, no restore needed"
    }
```

**Why handle this?**
- Prevents confusion in the UI
- Avoids unnecessary writes to the database
- Provides clear feedback to the moderator

### 4. Restore vs Re-upload

Restoring is NOT the same as re-uploading:
- **Restore**: Un-hide an existing video (same ID, same metadata, same comments/ratings)
- **Re-upload**: Create a brand new video (new ID, no history)

Restoration preserves the video's entire history -- comments, ratings, views, and flags all remain intact.

### 5. Legal and Compliance Considerations

In some jurisdictions, content that was hidden due to a legal order (copyright, DMCA, court order) should NOT be restorable through the normal moderation interface.

**Recommended**: Add a `hidden_reason` field that prevents restoration for legal holds:
```python
if video.get("hidden_reason") == "legal_hold":
    raise HTTPException(
        status_code=403,
        detail="Cannot restore: video is under legal hold"
    )
```

### 6. Notification to Content Owner

When a video is restored, the uploader should be notified:

```python
# Future: notify the video owner
await notification_service.send(
    user_id=video["userid"],
    message=f"Your video '{video['name']}' has been restored by a moderator."
)
```

## Developer Tips

### Common Pitfalls

1. **Assuming the stub actually restores**: The current implementation is a stub. Don't skip building the full logic.

2. **Forgetting denormalized tables**: Restoring in `videos` but not `latest_videos` means the video exists but doesn't appear in feeds.

3. **Not checking current status**: Restoring an active video should be a no-op, not an error.

4. **Ignoring tombstones if using hard deletes**: If videos were hard-deleted, they can't be restored (the data is gone).

5. **Missing audit trail**: Every restore should be logged with who, when, and why.

### Best Practices

1. **Always use soft deletes for user content**: Hard deletes are irreversible.

2. **Add a restore reason/notes field**:
   ```json
   POST /restore
   {"reason": "False positive flag - video is educational content"}
   ```

3. **Implement cascade updates as a background job**: Don't block the API response on updating all denormalized tables.

4. **Add a "pending_restore" status**: For complex restores, use an intermediate state.

5. **Test the full round-trip**: Hide -> verify hidden -> restore -> verify active.

### Testing Tips

```python
# Test stub returns success for existing video
async def test_restore_existing_video():
    video = await create_test_video()

    response = await client.post(
        f"/api/v1/moderation/videos/{video['videoId']}/restore",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "restored"

# Test restore non-existent video
async def test_restore_missing_video():
    fake_id = "00000000-0000-0000-0000-000000000000"

    response = await client.post(
        f"/api/v1/moderation/videos/{fake_id}/restore",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    # Could be 200 with not_found status or 404
    data = response.json()
    assert data["status"] == "not_found" or response.status_code == 404

# Test non-moderator access
async def test_restore_forbidden():
    video = await create_test_video()

    response = await client.post(
        f"/api/v1/moderation/videos/{video['videoId']}/restore",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )

    assert response.status_code == 403

# Test unauthenticated access
async def test_restore_unauthenticated():
    response = await client.post(
        "/api/v1/moderation/videos/550e8400-e29b-41d4-a716-446655440000/restore"
    )

    assert response.status_code == 401

# Future: test full restore cycle
async def test_hide_then_restore():
    video = await create_test_video()

    # Hide the video
    await hide_video(video["videoId"])

    # Verify hidden
    public_response = await client.get(f"/api/v1/videos/{video['videoId']}")
    assert public_response.status_code == 404  # Hidden from public

    # Restore
    response = await client.post(
        f"/api/v1/moderation/videos/{video['videoId']}/restore",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.json()["status"] == "restored"

    # Verify restored
    public_response = await client.get(f"/api/v1/videos/{video['videoId']}")
    assert public_response.status_code == 200  # Visible again
```

## Related Endpoints

- [POST /api/v1/moderation/flags/{flag_id}/action](./POST_flag_action.md) - Approve/reject flags (may trigger hide)
- [POST /api/v1/moderation/comments/{comment_id}/restore](./POST_restore_comment.md) - Restore hidden comments
- [GET /api/v1/videos/{videoId}](../video_catalog/GET_videos_by_id.md) - Check if video is accessible

## Further Learning

- [Soft Deletes Pattern](https://en.wiktionary.org/wiki/soft_delete)
- [Cassandra Tombstones Explained](https://thelastpickle.com/blog/2016/07/27/about-deletes-and-tombstones.html)
- [Denormalization in NoSQL](https://www.datastax.com/blog/basic-rules-cassandra-data-modeling)
- [Content Moderation Appeal Processes](https://transparency.meta.com/policies/community-standards/appeals/)
