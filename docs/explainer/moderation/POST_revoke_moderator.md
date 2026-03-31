# POST /api/v1/moderation/users/{user_id}/revoke-moderator - Revoke Moderator Role

## Overview

This endpoint removes the moderator role from a user, demoting them back to their base role (typically `"viewer"`). It is the inverse of the assign-moderator endpoint and completes the role lifecycle. Only existing moderators can revoke the role from other moderators.

**Why it exists**: Roles should be revocable. Moderators may abuse their privileges, leave the team, or the role may have been assigned by mistake. Without a revocation endpoint, you would need direct database access to fix role problems.

**Real-world analogy**: Like revoking admin access from a team member who's leaving the organization. Their account still exists, but they lose elevated privileges.

## HTTP Details

- **Method**: POST
- **Path**: `/api/v1/moderation/users/{user_id}/revoke-moderator`
- **Auth Required**: Yes (moderator role required)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/moderation.py`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | uuid | Yes | The user whose moderator role will be revoked |

### Request Example

```http
POST /api/v1/moderation/users/550e8400-e29b-41d4-a716-446655440000/revoke-moderator
Authorization: Bearer <moderator_jwt>
```

No request body is needed.

### Response Body

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "firstname": "John",
  "lastname": "Doe",
  "email": "john.doe@example.com",
  "accountStatus": "viewer",
  "message": "Moderator role revoked successfully"
}
```

### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{"detail": "Not authenticated"}` |
| 403 | User is not a moderator | `{"detail": "Moderator role required"}` |
| 404 | Target user not found | `{"detail": "User not found"}` |

## Cassandra Concepts Explained

### Updating a Single Column

Revoking the moderator role is a single-column update operation. Cassandra's UPDATE is efficient for this:

```cql
UPDATE killrvideo.users
SET account_status = 'viewer'
WHERE userid = 550e8400-e29b-41d4-a716-446655440000;
```

**What happens at the storage level**:
1. Cassandra writes a new cell for `account_status` with the current timestamp
2. The old value (`"moderator"`) is not immediately deleted
3. On next read, the newest timestamp wins and returns `"viewer"`
4. Compaction eventually removes the old value

**Analogy**: It's like writing a correction in pen over the original text. Both exist on the page, but the reader only sees the latest one. Eventually, someone rewrites the page clean (compaction).

### Idempotent Demotion

Like the assign endpoint, revocation is idempotent:

```
Call 1: moderator → viewer  (role changed)
Call 2: viewer → viewer     (no-op, but no error)
```

**Why is this safe?**
- Setting `account_status = 'viewer'` when it's already `"viewer"` creates a new cell at the current timestamp with the same value
- Functionally identical to doing nothing
- No error, no side effects

### The Roles List Pattern (Alternative Design)

If roles were stored as a list instead of a single field, revocation would use a different pattern:

```python
# If using a list<text> column:
current_roles = user["roles"]  # ["viewer", "moderator"]
updated_roles = [r for r in current_roles if r != "moderator"]  # ["viewer"]

await users_table.update_one(
    filter={"userid": str(user_id)},
    update={"$set": {"roles": updated_roles}}
)
```

**In the current design** (single `account_status` field), revocation simply replaces the value:

```python
await users_table.update_one(
    filter={"userid": str(user_id)},
    update={"$set": {"account_status": "viewer"}}
)
```

**The service code filters out "moderator"** even though the current implementation only stores one role. This future-proofs the logic for when multi-role support might be added.

## Data Model

### Table: `users`

```cql
CREATE TABLE killrvideo.users (
    userid uuid PRIMARY KEY,
    created_date timestamp,
    email text,
    firstname text,
    lastname text,
    account_status text,        -- Updated from 'moderator' to 'viewer'
    last_login_date timestamp
);
```

**State transition for revocation**:

| Field | Before | After |
|-------|--------|-------|
| `account_status` | `"moderator"` | `"viewer"` |
| All other fields | (unchanged) | (unchanged) |

## Database Queries

### 1. Fetch User and Current Roles

**Service Function**: `app/services/user_service.py` - `revoke_role_from_user()`

```python
async def revoke_role_from_user(user_id: UUID, role: str = "moderator") -> Optional[dict]:
    users_table = await get_table("users")

    # Step 1: Fetch the user
    user = await users_table.find_one(
        filter={"userid": str(user_id)}
    )

    if not user:
        return None  # User not found
```

**Equivalent CQL**:
```cql
SELECT * FROM killrvideo.users
WHERE userid = 550e8400-e29b-41d4-a716-446655440000;
```

**Performance**: **O(1)** -- Direct partition key lookup

### 2. Filter Out Moderator Role and Update

```python
    # Step 2: Remove the moderator role
    # Current implementation: if account_status is "moderator",
    # revert to "viewer"
    current_status = user.get("account_status", "viewer")

    if current_status == role:
        # Demote to viewer (base role)
        new_status = "viewer"
    else:
        # Already not a moderator, keep current status
        new_status = current_status

    # Step 3: Update the user
    await users_table.update_one(
        filter={"userid": str(user_id)},
        update={"$set": {"account_status": new_status}}
    )
```

**Equivalent CQL**:
```cql
UPDATE killrvideo.users
SET account_status = 'viewer'
WHERE userid = 550e8400-e29b-41d4-a716-446655440000;
```

**Performance**: **O(1)** -- Single partition key update

### 3. Return Updated User

```python
    # Step 4: Fetch and return updated user
    updated_user = await users_table.find_one(
        filter={"userid": str(user_id)}
    )

    return updated_user
```

**Total queries**: 3 (read + update + read)

## Implementation Flow

```
┌───────────────────────────────────────────────────────────┐
│ 1. Client sends POST /moderation/users/{user_id}/         │
│    revoke-moderator                                       │
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
│ 3. Parse user_id from URL path                            │
│    ├─ Invalid UUID? → 422 Validation Error                │
│    └─ Valid UUID? → Continue                              │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 4. Look up target user                                    │
│    find_one(filter={"userid": user_id})                   │
│    ├─ Not found? → 404 "User not found"                   │
│    └─ Found? → Check current account_status               │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 5. Determine new status                                   │
│    account_status == "moderator"?                         │
│    ├─ Yes → new_status = "viewer"                         │
│    └─ No → new_status = current status (no change)        │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 6. Update account_status                                  │
│    update_one($set: {"account_status": new_status})       │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 7. Re-fetch updated user profile                          │
│    find_one(filter={"userid": user_id})                   │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 8. Return 200 OK with updated user + success message      │
│    {userId, accountStatus: "viewer", ...}                 │
└───────────────────────────────────────────────────────────┘
```

**Total Queries**: 3 (1 read + 1 update + 1 read)

**Expected Latency**: 15-30ms

## Special Notes

### 1. Self-Revocation Problem

Can a moderator revoke their own moderator role? The current implementation allows it:

```
Moderator A calls: POST /moderation/users/{moderator_A_id}/revoke-moderator
Result: Moderator A is now a viewer
```

**Consequences**:
- The moderator can't undo this (they're no longer a moderator)
- If they're the last moderator, no one can promote new moderators
- Recovery requires direct database access

**Recommended prevention**:
```python
if str(user_id) == str(current_user.userid):
    raise HTTPException(
        status_code=400,
        detail="Cannot revoke your own moderator role"
    )
```

**Last moderator protection**:
```python
# Count remaining moderators
all_users = await users_table.find(
    filter={"account_status": "moderator"}
)
moderator_count = len(await all_users.to_list())

if moderator_count <= 1 and str(user_id) == str(target_user["userid"]):
    raise HTTPException(
        status_code=409,
        detail="Cannot revoke the last moderator"
    )
```

### 2. Token Invalidation (Same as Assign)

After revocation, the user's JWT still contains `"roles": ["moderator"]` until it expires or they log in again:

```json
// Token still says moderator for up to 24 hours
{
  "sub": "550e8400-...",
  "roles": ["moderator"],
  "exp": 1742500000
}
```

**Security concern**: The revoked moderator can still access moderation endpoints until their token expires.

**Mitigations**:
1. **Short-lived tokens** (15 minutes) with refresh tokens
2. **Token blacklist**: Store revoked tokens in Redis
3. **Database role check**: On every request, verify the role against the database (expensive)

**Current state**: KillrVideo uses 24-hour tokens with no revocation mechanism. This is a known trade-off for simplicity.

### 3. Demotion Target Role

The current implementation always demotes to `"viewer"`. But what if the user was a `"creator"` before becoming a moderator?

```
Timeline:
1. User registers as "viewer"
2. User becomes "creator" (uploads videos)
3. Moderator promotes them to "moderator"
4. Moderator revokes moderator role
5. User becomes "viewer" (lost their "creator" status!)
```

**Better approach** (not implemented): Track the previous role
```python
# Store previous role before promoting
await users_table.update_one(
    filter={"userid": str(user_id)},
    update={"$set": {
        "account_status": "moderator",
        "previous_status": current_status  # Remember "creator"
    }}
)

# On revocation, restore previous role
previous = user.get("previous_status", "viewer")
await users_table.update_one(
    filter={"userid": str(user_id)},
    update={"$set": {"account_status": previous}}
)
```

### 4. No Notification System

The revoked user is not notified that their role changed. They discover it when:
- Moderation features disappear from the UI (after re-login)
- API calls start returning 403 Forbidden (after token refresh)

**Recommended**: Send a notification or email explaining the change.

### 5. Audit Trail for Revocations

Role revocations are even more important to log than promotions:

```python
logger.warning(
    f"Role revocation: user={user_id} role_removed=moderator "
    f"revoked_by={current_user.userid} "
    f"previous_status={user.get('account_status')}"
)
```

**Why this matters**:
- Detects abuse (one moderator systematically demoting others)
- Provides evidence if the revocation is disputed
- Required for compliance in some industries

## Developer Tips

### Common Pitfalls

1. **Not preventing self-revocation**: A moderator can accidentally lock themselves out

2. **Not checking if user is actually a moderator**: Revoking from a non-moderator is a no-op but may confuse the UI
   ```python
   if user["account_status"] != "moderator":
       return {"message": "User is not a moderator", "accountStatus": user["account_status"]}
   ```

3. **Assuming immediate effect**: The user's JWT doesn't change until re-login

4. **Not logging the action**: Role changes must be auditable

5. **Revoking the last moderator**: This can leave the system with no administrators

### Best Practices

1. **Add a reason field**: Track why the role was revoked
   ```json
   POST /revoke-moderator
   {"reason": "Moderator left the volunteer team"}
   ```

2. **Implement a grace period**: Don't immediately revoke; set an expiration date
   ```json
   {"revokeAt": "2026-04-01T00:00:00Z"}  // Effective in 2 weeks
   ```

3. **Pair with token invalidation**: Revoke the role AND invalidate existing tokens

4. **Add confirmation on the frontend**: "Are you sure you want to revoke moderator access from John Doe?"

5. **Maintain role history**: Store all role changes in an audit table

### Testing Tips

```python
# Test successful revocation
async def test_revoke_moderator():
    user = await create_test_user(role="moderator")

    response = await client.post(
        f"/api/v1/moderation/users/{user['userId']}/revoke-moderator",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["accountStatus"] == "viewer"

# Test revoking from non-moderator (idempotent)
async def test_revoke_from_viewer():
    user = await create_test_user(role="viewer")

    response = await client.post(
        f"/api/v1/moderation/users/{user['userId']}/revoke-moderator",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    # Should succeed (idempotent) but status stays "viewer"
    assert response.status_code == 200
    assert response.json()["accountStatus"] == "viewer"

# Test non-moderator cannot revoke
async def test_revoke_forbidden():
    user = await create_test_user(role="moderator")

    response = await client.post(
        f"/api/v1/moderation/users/{user['userId']}/revoke-moderator",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )

    assert response.status_code == 403

# Test revoking non-existent user
async def test_revoke_user_not_found():
    fake_id = "00000000-0000-0000-0000-000000000000"

    response = await client.post(
        f"/api/v1/moderation/users/{fake_id}/revoke-moderator",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 404

# Test assign then revoke cycle
async def test_assign_revoke_cycle():
    user = await create_test_user(role="viewer")

    # Promote
    await client.post(
        f"/api/v1/moderation/users/{user['userId']}/assign-moderator",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    # Verify promoted
    check = await client.get(
        f"/api/v1/users/{user['userId']}",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )
    assert check.json()["accountStatus"] == "moderator"

    # Revoke
    response = await client.post(
        f"/api/v1/moderation/users/{user['userId']}/revoke-moderator",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.json()["accountStatus"] == "viewer"
```

## Related Endpoints

- [POST /api/v1/moderation/users/{user_id}/assign-moderator](./POST_assign_moderator.md) - The inverse operation
- [GET /api/v1/moderation/users](./GET_users.md) - Search for users
- [GET /api/v1/users/me](../account_management/GET_users_me.md) - Check own role after revocation

## Further Learning

- [Principle of Least Privilege](https://en.wikipedia.org/wiki/Principle_of_least_privilege)
- [Token Revocation Strategies](https://auth0.com/blog/denylist-json-web-token-api-keys/)
- [Cassandra UPDATE vs INSERT](https://docs.datastax.com/en/cql-oss/3.3/cql/cql_reference/cqlUpdate.html)
- [RBAC Best Practices](https://csrc.nist.gov/publications/detail/sp/800-162/final)
