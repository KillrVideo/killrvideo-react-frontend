# POST /api/v1/moderation/flags/{flag_id}/action - Take Action on a Flag

## Overview

This endpoint allows moderators to take action on a content flag -- either starting a review, approving the flag (confirming the content violates guidelines), or rejecting it (determining the content is fine). It manages the **state machine** that drives the entire moderation workflow.

**Why it exists**: Flags without actions are just noise. This endpoint closes the loop: a user reports content, a moderator investigates, and the system records the outcome. The state transition creates an audit trail showing who reviewed what and when.

**Real-world analogy**: Think of a support ticket system. A ticket starts as "New", gets moved to "In Progress" when someone picks it up, and ends as "Resolved" or "Won't Fix". This endpoint is the "change status" button.

## HTTP Details

- **Method**: POST
- **Path**: `/api/v1/moderation/flags/{flag_id}/action`
- **Auth Required**: Yes (moderator role required)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/moderation.py`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `flag_id` | uuid (timeuuid) | Yes | The flag to act on |

### Request Body

```json
{
  "action": "approve"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | One of: `"review"`, `"approve"`, `"reject"` |

**Action meanings**:
- `"review"`: Moderator is starting to investigate (open -> under_review)
- `"approve"`: Flag is valid, content violates guidelines (open/under_review -> approved)
- `"reject"`: Flag is invalid, content is fine (open/under_review -> rejected)

### Response Body

```json
{
  "flagId": "e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd",
  "contentId": "550e8400-e29b-41d4-a716-446655440000",
  "contentType": "video",
  "status": "approved",
  "flaggedReason": "inappropriate: Contains misleading medical advice",
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
| 409 | Invalid state transition | `{"detail": "Cannot approve a flag that is already rejected"}` |
| 422 | Invalid action value | `{"detail": "Action must be 'review', 'approve', or 'reject'"}` |

## Cassandra Concepts Explained

### State Machine Pattern in Cassandra

This endpoint implements a **state machine** -- a pattern where a record transitions through defined states. Cassandra doesn't have built-in state machine support, so the application enforces the rules.

**The states**:
```
                    ┌──────────┐
                    │   open   │  (initial state, just flagged)
                    └────┬─────┘
                         │
                   action: "review"
                         │
                         ▼
                ┌────────────────┐
                │  under_review  │  (moderator investigating)
                └───┬────────┬───┘
                    │        │
         action: "approve"   action: "reject"
                    │        │
                    ▼        ▼
            ┌──────────┐  ┌──────────┐
            │ approved  │  │ rejected │  (terminal states)
            └──────────┘  └──────────┘
```

**Valid transitions**:
| Current State | Allowed Actions | New State |
|---------------|----------------|-----------|
| `open` | `review` | `under_review` |
| `open` | `approve` | `approved` |
| `open` | `reject` | `rejected` |
| `under_review` | `approve` | `approved` |
| `under_review` | `reject` | `rejected` |
| `approved` | (none) | -- |
| `rejected` | (none) | -- |

**Why enforce transitions?**
- Prevents illogical states (e.g., re-opening a rejected flag)
- Creates a meaningful audit trail
- Ensures terminal states are truly terminal

**Analogy**: Like a shipping package -- it goes from "Processing" to "Shipped" to "Delivered". You can't move it back to "Processing" once it's delivered.

### Audit Trail with UPDATE

When a moderator takes action, the backend updates three fields atomically:

```python
update={"$set": {
    "status": new_status,
    "reviewer": str(moderator_id),
    "review_date": datetime.now(timezone.utc).isoformat()
}}
```

**In Cassandra, this is a single mutation**:
```cql
UPDATE content_moderation
SET status = 'approved',
    reviewer = aabbccdd-1234-5678-9999-aabbccddeeff,
    review_date = '2026-03-19T16:45:00Z'
WHERE contentid = 550e8400-e29b-41d4-a716-446655440000
  AND flagid = e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd;
```

**Important**: Cassandra doesn't support transactions in the traditional SQL sense. This UPDATE is atomic for a single row (all columns are written together), but there's no way to atomically update multiple rows across partitions.

### Last-Write-Wins Conflict

What if two moderators act on the same flag simultaneously?

```
Moderator A: approve flag at T=100ms
Moderator B: reject flag at T=105ms
Result: "rejected" wins (last write wins)
```

**Cassandra's conflict resolution** uses timestamps. The write with the later timestamp wins. This means:
- No locking, no deadlocks
- But also no "optimistic locking" by default
- The last moderator to click wins

**Mitigation options** (not implemented):
1. Check status before updating (read-then-write, has a race window)
2. Use Lightweight Transactions (LWT) -- `IF status = 'open'`
3. Accept last-write-wins (simplest, usually fine for moderation)

## Data Model

### Table: `content_moderation`

```cql
CREATE TABLE killrvideo.content_moderation (
    contentid uuid,
    flagid timeuuid,
    content_type text,
    status text,                 -- State machine field
    flagged_reason text,
    reviewer uuid,               -- Set when moderator acts
    review_date timestamp,       -- Set when moderator acts
    PRIMARY KEY (contentid, flagid)
) WITH CLUSTERING ORDER BY (flagid DESC);
```

### Table: `moderation_audit` (optional logging)

```cql
CREATE TABLE killrvideo.moderation_audit (
    videoid uuid,
    flagid timeuuid,
    action text,                 -- 'review', 'approve', 'reject'
    actor uuid,                  -- Moderator who acted
    ts timestamp,                -- When the action happened
    details text,                -- Additional context
    PRIMARY KEY ((videoid), ts, flagid)
) WITH CLUSTERING ORDER BY (ts DESC);
```

**Purpose**: Provides a complete history of all actions taken on flags for a given video, sorted by time (newest first). Even if a flag's status is overwritten, the audit table preserves every state change.

## Database Queries

### 1. Fetch Current Flag State

**Service Function**: `app/services/flag_service.py` - `action_on_flag()`

```python
async def action_on_flag(
    flag_id: UUID,
    action: str,
    moderator_id: UUID
) -> Optional[dict]:
    moderation_table = await get_table("content_moderation")

    # Step 1: Fetch the flag to check current status
    flag = await moderation_table.find_one(
        filter={"flagid": str(flag_id)}
    )

    if not flag:
        return None  # Flag not found
```

**Equivalent CQL**:
```cql
SELECT * FROM killrvideo.content_moderation
WHERE flagid = e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd
LIMIT 1
ALLOW FILTERING;
```

**Performance**: **O(1)** with SAI index on `flagid`, otherwise O(n) scan

### 2. Validate State Transition

```python
    # Step 2: Validate the state transition
    current_status = flag["status"]

    # Terminal states cannot be changed
    if current_status in ("approved", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot {action} a flag that is already {current_status}"
        )

    # Map action to new status
    status_map = {
        "review": "under_review",
        "approve": "approved",
        "reject": "rejected"
    }
    new_status = status_map.get(action)

    if not new_status:
        raise HTTPException(
            status_code=422,
            detail="Action must be 'review', 'approve', or 'reject'"
        )
```

**State validation rules**:
- `approved` and `rejected` are **terminal** -- no further actions allowed
- `open` and `under_review` accept any valid action
- This is application-level enforcement (Cassandra doesn't validate)

### 3. Update Flag with Reviewer Info

```python
    # Step 3: Update the flag
    await moderation_table.update_one(
        filter={"flagid": str(flag_id)},
        update={"$set": {
            "status": new_status,
            "reviewer": str(moderator_id),
            "review_date": datetime.now(timezone.utc).isoformat()
        }}
    )
```

**Equivalent CQL**:
```cql
UPDATE killrvideo.content_moderation
SET status = 'approved',
    reviewer = aabbccdd-1234-5678-9999-aabbccddeeff,
    review_date = '2026-03-19T16:45:00Z'
WHERE contentid = 550e8400-e29b-41d4-a716-446655440000
  AND flagid = e5e6f7a0-1234-11f0-aaaa-bbbbccccdddd;
```

**Performance**: **O(1)** -- Direct partition + clustering key update

**Note**: The `update_one` filter uses `flagid`, but the actual CQL update needs both `contentid` AND `flagid` (the full primary key). The Data API resolves this by first finding the row, then updating it.

### 4. Return Updated Flag

```python
    # Step 4: Fetch and return the updated flag
    updated_flag = await moderation_table.find_one(
        filter={"flagid": str(flag_id)}
    )

    return updated_flag
```

**Why re-fetch?** The `update_one` operation doesn't return the updated document. We need a second read to get the current state.

**Total queries for this endpoint**: 3 (read, update, read)

## Implementation Flow

```
┌───────────────────────────────────────────────────────────┐
│ 1. Client sends POST /moderation/flags/{flag_id}/action   │
│    {"action": "approve"}                                  │
│    Authorization: Bearer <moderator_jwt>                  │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 2. Authenticate and authorize                             │
│    ├─ No token? → 401 Unauthorized                        │
│    ├─ Not moderator? → 403 Forbidden                      │
│    └─ Moderator? → Extract moderator_id, continue         │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 3. Fetch flag by flagid                                   │
│    find_one(filter={"flagid": flag_id})                   │
│    ├─ Not found? → 404 "Flag not found"                   │
│    └─ Found? → Continue with current status               │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 4. Validate state transition                              │
│    current_status in ("approved", "rejected")?            │
│    ├─ Yes → 409 "Cannot change terminal state"            │
│    └─ No → Map action to new_status                       │
│                                                           │
│    "review"  → "under_review"                             │
│    "approve" → "approved"                                 │
│    "reject"  → "rejected"                                 │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 5. Update flag in content_moderation                      │
│    $set: {status, reviewer, review_date}                  │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 6. Re-fetch updated flag                                  │
│    find_one(filter={"flagid": flag_id})                   │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 7. Return 200 OK with updated flag details                │
│    {flagId, status: "approved", reviewer: ...,            │
│     reviewDate: "2026-03-19T16:45:00Z"}                   │
└───────────────────────────────────────────────────────────┘
```

**Total Queries**: 3 (1 read + 1 update + 1 read)

**Expected Latency**: 20-50ms

## Special Notes

### 1. Race Condition Between Read and Write

The endpoint reads the current status, validates the transition, then writes the new status. There's a time window between the read and write where another moderator could act:

```
T=0ms:   Moderator A reads flag (status: "open")
T=5ms:   Moderator B reads flag (status: "open")
T=10ms:  Moderator A approves (status: "open" → "approved")
T=15ms:  Moderator B rejects (status: "open" → "rejected")  ← Overwrites!
```

**Cassandra Lightweight Transactions (LWT)** can prevent this:

```cql
UPDATE content_moderation
SET status = 'approved', reviewer = ?, review_date = ?
WHERE contentid = ? AND flagid = ?
IF status IN ('open', 'under_review');
```

**LWT trade-offs**:
- Guarantees the update only applies if the condition is true
- ~4-10x slower than regular writes (requires consensus)
- Creates contention under high throughput

**Current approach**: Last-write-wins is acceptable for KillrVideo's scale. Two moderators rarely review the same flag simultaneously.

### 2. The review_date Timestamp

The `review_date` is set by the application server's clock, not the database:

```python
"review_date": datetime.now(timezone.utc).isoformat()
```

**Potential issue**: If the application server's clock is skewed, the timestamp might be wrong.

**Alternative**: Use Cassandra's `toTimestamp(now())` function (only available in CQL, not Data API):

```cql
UPDATE content_moderation
SET review_date = toTimestamp(now())  -- Database server's clock
WHERE contentid = ? AND flagid = ?;
```

### 3. Overwriting the Reviewer Field

Each action overwrites the `reviewer` field. If Moderator A starts a review and Moderator B approves it, only Moderator B's ID is recorded:

```
Step 1: Moderator A reviews → reviewer = A
Step 2: Moderator B approves → reviewer = B (overwrites A)
```

The `moderation_audit` table preserves the complete history:

```cql
-- Audit trail shows both actions
SELECT * FROM moderation_audit WHERE videoid = ? ORDER BY ts DESC;

-- Returns:
-- ts: 16:45, action: approve, actor: B
-- ts: 16:30, action: review,  actor: A
```

### 4. No Content Action (Yet)

Approving a flag currently updates the flag's status but does **not** take action on the content itself (e.g., hiding a video, deleting a comment). That would require additional endpoints:

```python
# Future: auto-hide content when flag is approved
if new_status == "approved":
    if flag["content_type"] == "video":
        await video_service.hide_video(flag["contentid"])
    elif flag["content_type"] == "comment":
        await comment_service.hide_comment(flag["contentid"])
```

**Current state**: The flag is marked as approved, but the content remains visible. A separate moderation action (manual) would be needed to remove it.

### 5. HTTP 409 Conflict for Invalid Transitions

The endpoint returns `409 Conflict` when a moderator tries to act on an already-resolved flag:

```python
if current_status in ("approved", "rejected"):
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"Cannot {action} a flag that is already {current_status}"
    )
```

**Why 409 and not 400?**
- `400 Bad Request`: The request itself is malformed
- `409 Conflict`: The request is valid, but conflicts with the current resource state
- This distinction helps the frontend handle the error appropriately (e.g., refresh the flag status)

## Developer Tips

### Common Pitfalls

1. **Not checking terminal states**: Always validate the current status before updating
   ```python
   # BAD: Blindly update
   await table.update_one(filter={"flagid": id}, update={"$set": {"status": "approved"}})

   # GOOD: Check first
   flag = await table.find_one(filter={"flagid": id})
   if flag["status"] in ("approved", "rejected"):
       raise HTTPException(status_code=409, ...)
   ```

2. **Forgetting to set reviewer and review_date**: These create the audit trail

3. **Using the wrong timezone**: Always use UTC for timestamps
   ```python
   # BAD: Local time
   review_date = datetime.now()

   # GOOD: UTC
   review_date = datetime.now(timezone.utc)
   ```

4. **Not re-fetching after update**: The update response doesn't include the full document

5. **Allowing "review" on already-under-review flags**: Decide whether re-review is allowed

### Best Practices

1. **Add a reason/notes field**: Let moderators explain their decision
   ```json
   {
     "action": "approve",
     "notes": "Confirmed: video promotes dangerous health practices"
   }
   ```

2. **Send notifications**: Notify the original flagger that their report was reviewed

3. **Implement undo**: Allow reversing a decision within a grace period

4. **Log every action**: Write to the `moderation_audit` table for compliance

5. **Rate-limit actions**: Prevent accidental mass-approve/reject

### Testing Tips

```python
# Test approve flow
async def test_approve_flag():
    flag = await create_test_flag()

    response = await client.post(
        f"/api/v1/moderation/flags/{flag['flagId']}/action",
        json={"action": "approve"},
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "approved"
    assert data["reviewer"] is not None
    assert data["reviewDate"] is not None

# Test reject flow
async def test_reject_flag():
    flag = await create_test_flag()

    response = await client.post(
        f"/api/v1/moderation/flags/{flag['flagId']}/action",
        json={"action": "reject"},
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"

# Test review then approve
async def test_review_then_approve():
    flag = await create_test_flag()

    # Step 1: Review
    await client.post(
        f"/api/v1/moderation/flags/{flag['flagId']}/action",
        json={"action": "review"},
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    # Step 2: Approve
    response = await client.post(
        f"/api/v1/moderation/flags/{flag['flagId']}/action",
        json={"action": "approve"},
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "approved"

# Test cannot act on terminal state
async def test_cannot_re_approve():
    flag = await create_and_approve_test_flag()

    response = await client.post(
        f"/api/v1/moderation/flags/{flag['flagId']}/action",
        json={"action": "reject"},
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 409

# Test non-moderator cannot act
async def test_action_forbidden_for_viewer():
    flag = await create_test_flag()

    response = await client.post(
        f"/api/v1/moderation/flags/{flag['flagId']}/action",
        json={"action": "approve"},
        headers={"Authorization": f"Bearer {viewer_token}"}
    )

    assert response.status_code == 403
```

## Related Endpoints

- [GET /api/v1/moderation/flags](./GET_flags.md) - View the flag inbox
- [GET /api/v1/moderation/flags/{flag_id}](./GET_flag_detail.md) - View flag details before acting
- [POST /api/v1/flags](../flags/POST_flag.md) - How flags get created
- [POST /api/v1/moderation/videos/{video_id}/restore](./POST_restore_video.md) - Restore content after false positive

## Further Learning

- [State Machine Patterns](https://en.wikipedia.org/wiki/Finite-state_machine)
- [Cassandra Lightweight Transactions](https://docs.datastax.com/en/cql-oss/3.3/cql/cql_using/useInsertLWT.html)
- [HTTP 409 Conflict](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/409)
- [Content Moderation Workflows](https://www.twitch.tv/p/en/legal/community-guidelines/)
