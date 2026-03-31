# POST /api/v1/moderation/users/{user_id}/assign-moderator - Promote User to Moderator

## Overview

This endpoint promotes a user to the moderator role by appending `"moderator"` to their roles list. Only existing moderators can promote other users, creating a controlled chain of trust. The operation is idempotent -- promoting someone who is already a moderator has no adverse effect.

**Why it exists**: KillrVideo uses role-based access control (RBAC) to gate moderation features. New moderators can't self-promote; an existing moderator must grant the role. This prevents privilege escalation and ensures accountability.

**Real-world analogy**: Like making someone an admin on a Discord server. Only existing admins can promote others, and the action is logged. Promoting someone who's already an admin doesn't break anything.

## HTTP Details

- **Method**: POST
- **Path**: `/api/v1/moderation/users/{user_id}/assign-moderator`
- **Auth Required**: Yes (moderator role required)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/moderation.py`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | uuid | Yes | The user to promote |

### Request Example

```http
POST /api/v1/moderation/users/550e8400-e29b-41d4-a716-446655440000/assign-moderator
Authorization: Bearer <moderator_jwt>
```

No request body is needed -- the action is implicit in the URL.

### Response Body

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "firstname": "John",
  "lastname": "Doe",
  "email": "john.doe@example.com",
  "accountStatus": "moderator",
  "message": "Moderator role assigned successfully"
}
```

### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{"detail": "Not authenticated"}` |
| 403 | User is not a moderator | `{"detail": "Moderator role required"}` |
| 404 | Target user not found | `{"detail": "User not found"}` |

## Cassandra Concepts Explained

### Role Storage in Cassandra

User roles in KillrVideo are stored as the `account_status` field in the `users` table. This is a **single text field** that holds the user's current role:

```cql
CREATE TABLE killrvideo.users (
    userid uuid PRIMARY KEY,
    ...
    account_status text,    -- 'viewer', 'creator', 'moderator'
    ...
);
```

**Why a text field and not a list?**
- Simple: each user has one primary role
- The JWT token uses this value directly: `roles: [account_status]`
- Cassandra `text` is efficient for single-value lookups

**Alternative design** (using a Cassandra list):
```cql
roles list<text>   -- ['viewer', 'moderator']
```

The current implementation treats role assignment as **replacing** the account_status value rather than appending to a list. This means a user is one role at a time, though the JWT may encode it as a list for forward compatibility.

### The $set Operator

The `$set` operator in the Astra Data API modifies specific columns without touching others:

```python
await users_table.update_one(
    filter={"userid": str(user_id)},
    update={"$set": {"account_status": "moderator"}}
)
```

**Equivalent CQL**:
```cql
UPDATE killrvideo.users
SET account_status = 'moderator'
WHERE userid = 550e8400-e29b-41d4-a716-446655440000;
```

**What $set does NOT do**:
- Does not overwrite other columns (firstname, email, etc. are unchanged)
- Does not create a new row if the user doesn't exist (that would require `insert_one`)
- Does not validate that the new value is meaningful (application must validate)

### Idempotent Operations

This endpoint is **idempotent** -- calling it multiple times with the same input produces the same result without side effects.

```
Call 1: viewer → moderator   (role changed)
Call 2: moderator → moderator (no change, but no error)
Call 3: moderator → moderator (still no change, still no error)
```

**Why idempotency matters**:
- Network retries are safe (double-click, timeout+retry)
- API clients don't need to check current state before calling
- Simplifies error handling on both client and server

**Cassandra naturally supports this**: An UPDATE that sets the same value is a no-op in terms of data change (though it still writes a new timestamp internally).

### Last-Write-Wins and Role Changes

If two moderators simultaneously change a user's role:

```
T=0ms:  Moderator A sets account_status = 'moderator'
T=5ms:  Moderator B sets account_status = 'viewer' (demoting)
Result: 'viewer' wins (later timestamp)
```

Cassandra uses timestamp-based conflict resolution. The write with the highest timestamp wins. This is generally acceptable for role changes since:
- They're infrequent operations
- Two moderators rarely act on the same user simultaneously
- The audit log (if implemented) would show both actions

## Data Model

### Table: `users`

```cql
CREATE TABLE killrvideo.users (
    userid uuid PRIMARY KEY,
    created_date timestamp,
    email text,
    firstname text,
    lastname text,
    account_status text,        -- The role field we're updating
    last_login_date timestamp
);
```

**Before promotion**:
```json
{
  "userid": "550e8400-e29b-41d4-a716-446655440000",
  "firstname": "John",
  "lastname": "Doe",
  "email": "john.doe@example.com",
  "account_status": "viewer",
  "created_date": "2025-10-31T10:30:00Z",
  "last_login_date": "2026-03-18T09:15:00Z"
}
```

**After promotion**:
```json
{
  "userid": "550e8400-e29b-41d4-a716-446655440000",
  "firstname": "John",
  "lastname": "Doe",
  "email": "john.doe@example.com",
  "account_status": "moderator",
  "created_date": "2025-10-31T10:30:00Z",
  "last_login_date": "2026-03-18T09:15:00Z"
}
```

Only `account_status` changed. Everything else is untouched.

## Database Queries

### 1. Verify Target User Exists

**Service Function**: `app/services/user_service.py` - `assign_role_to_user()`

```python
async def assign_role_to_user(user_id: UUID, role: str = "moderator") -> Optional[dict]:
    users_table = await get_table("users")

    # Step 1: Check the user exists
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

### 2. Update account_status to "moderator"

```python
    # Step 2: Append moderator role (or set account_status)
    await users_table.update_one(
        filter={"userid": str(user_id)},
        update={"$set": {"account_status": "moderator"}}
    )
```

**Equivalent CQL**:
```cql
UPDATE killrvideo.users
SET account_status = 'moderator'
WHERE userid = 550e8400-e29b-41d4-a716-446655440000;
```

**Performance**: **O(1)** -- Single partition key update

### 3. Return Updated User

```python
    # Step 3: Fetch and return the updated user
    updated_user = await users_table.find_one(
        filter={"userid": str(user_id)}
    )

    return updated_user
```

**Why re-fetch?** The `update_one` call doesn't return the updated document. We read again to return the current state to the caller.

**Total queries**: 3 (read + update + read)

## Implementation Flow

```
┌───────────────────────────────────────────────────────────┐
│ 1. Client sends POST /moderation/users/{user_id}/         │
│    assign-moderator                                       │
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
│    └─ Found? → Continue                                   │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 5. Update account_status to "moderator"                   │
│    update_one($set: {"account_status": "moderator"})      │
│    (idempotent: safe even if already moderator)            │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 6. Re-fetch updated user profile                          │
│    find_one(filter={"userid": user_id})                   │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 7. Return 200 OK with updated user + success message      │
│    {userId, firstname, accountStatus: "moderator", ...}   │
└───────────────────────────────────────────────────────────┘
```

**Total Queries**: 3 (1 read + 1 update + 1 read)

**Expected Latency**: 15-30ms

## Special Notes

### 1. JWT Token Stale After Role Change

When a user is promoted to moderator, their **existing JWT token still contains the old role**:

```json
// Old token (still in user's localStorage)
{
  "sub": "550e8400-...",
  "roles": ["viewer"],   // Still says "viewer"!
  "exp": 1742500000
}
```

**The user must log in again** to get a new token with `"roles": ["moderator"]`.

**Frontend handling**:
```typescript
// After promoting a user, the moderator dashboard could show a note:
"User promoted to moderator. They'll need to log in again for changes to take effect."
```

**Alternative approaches** (not implemented):
1. **Token revocation list**: Invalidate the old token server-side
2. **Short-lived tokens**: 15-minute tokens + refresh tokens
3. **Real-time notification**: Push a WebSocket message telling the user to re-auth

### 2. Self-Promotion Prevention

Can a moderator promote themselves? Technically yes, but it's a no-op (they're already a moderator). More concerning: can a **non-moderator** call this endpoint?

```python
# The require_moderator dependency prevents this
@router.post("/moderation/users/{user_id}/assign-moderator")
async def assign_moderator(
    user_id: UUID,
    current_user: User = Depends(require_moderator)  # Guards the endpoint
):
```

**The chain of trust**:
1. The first moderator must be created via database admin or seed script
2. That moderator can promote others
3. Those moderators can promote more people

**Bootstrap problem**: How does the first moderator get created?

```cql
-- Manual database operation (admin only)
UPDATE killrvideo.users
SET account_status = 'moderator'
WHERE userid = <first-admin-uuid>;
```

### 3. No Confirmation Step

The current implementation promotes the user immediately with no confirmation:

```
POST /assign-moderator → Done!
```

**Recommended improvement**: Add a confirmation or approval workflow:
```
POST /assign-moderator → Request created
GET /pending-promotions → List pending
POST /pending-promotions/{id}/confirm → Actually promote
```

This prevents accidental promotions and adds accountability.

### 4. Audit Logging

Role changes should be logged for security compliance:

```python
logger.warning(
    f"Role change: user={user_id} new_role=moderator "
    f"promoted_by={current_user.userid}"
)
```

**Why `warning` level?** Role changes are security-sensitive events. Using `warning` (not `info`) ensures they appear in security monitoring dashboards.

### 5. The account_status vs roles Design

KillrVideo uses a **single `account_status` text field** for roles:

```python
account_status = "moderator"  # Replaces previous value
```

**A more flexible design would use a list**:
```python
roles = ["viewer", "moderator"]  # Accumulates roles
```

**Trade-offs**:

| Approach | Pros | Cons |
|----------|------|------|
| Single text | Simple, clear hierarchy | Can't have multiple roles |
| List of roles | Flexible, supports multiple roles | More complex queries |

**Current behavior**: Promoting to moderator **replaces** the account_status, so the user loses their previous role label (viewer/creator). However, moderators implicitly have all lower permissions.

## Developer Tips

### Common Pitfalls

1. **Forgetting token staleness**: The user's JWT doesn't update until they re-login
   ```typescript
   // Frontend should warn the user
   toast.success("Role updated. User must log in again for changes to take effect.");
   ```

2. **Not verifying the target user exists**: Always check before updating
   ```python
   # BAD: Update blindly (creates a partial row if user doesn't exist!)
   await users_table.update_one(
       filter={"userid": user_id},
       update={"$set": {"account_status": "moderator"}}
   )

   # GOOD: Check first
   user = await users_table.find_one(filter={"userid": user_id})
   if not user:
       raise HTTPException(status_code=404)
   ```

3. **Promoting a deactivated account**: Check `account_status` isn't `"deactivated"` before promoting

4. **No rate limiting**: A moderator could rapidly promote thousands of users

5. **Missing audit trail**: Always log who promoted whom

### Best Practices

1. **Log all role changes**: Security teams need to track privilege escalation

2. **Notify the promoted user**: Send an email or in-app notification

3. **Add a reason field**: Track why the promotion happened
   ```json
   POST /assign-moderator
   {"reason": "Promoted for community volunteer moderation program"}
   ```

4. **Implement role caps**: Limit the number of moderators to prevent abuse

5. **Add revocation endpoint**: Always pair "grant" with "revoke" (see POST_revoke_moderator.md)

### Testing Tips

```python
# Test successful promotion
async def test_assign_moderator():
    # Create a regular user
    user = await create_test_user(role="viewer")

    response = await client.post(
        f"/api/v1/moderation/users/{user['userId']}/assign-moderator",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["accountStatus"] == "moderator"

# Test idempotent promotion
async def test_assign_moderator_idempotent():
    user = await create_test_user(role="moderator")

    response = await client.post(
        f"/api/v1/moderation/users/{user['userId']}/assign-moderator",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 200
    assert response.json()["accountStatus"] == "moderator"

# Test promoting non-existent user
async def test_assign_moderator_user_not_found():
    fake_id = "00000000-0000-0000-0000-000000000000"

    response = await client.post(
        f"/api/v1/moderation/users/{fake_id}/assign-moderator",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 404

# Test non-moderator cannot promote
async def test_assign_moderator_forbidden():
    user = await create_test_user(role="viewer")

    response = await client.post(
        f"/api/v1/moderation/users/{user['userId']}/assign-moderator",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )

    assert response.status_code == 403

# Test promotion changes are persisted
async def test_assign_moderator_persisted():
    user = await create_test_user(role="viewer")

    await client.post(
        f"/api/v1/moderation/users/{user['userId']}/assign-moderator",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    # Verify by fetching user directly
    response = await client.get(
        f"/api/v1/users/{user['userId']}",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.json()["accountStatus"] == "moderator"
```

## Related Endpoints

- [GET /api/v1/moderation/users](./GET_users.md) - Search for users to promote
- [POST /api/v1/moderation/users/{user_id}/revoke-moderator](./POST_revoke_moderator.md) - Remove moderator role
- [GET /api/v1/users/me](../account_management/GET_users_me.md) - Check own role after promotion

## Further Learning

- [Role-Based Access Control (RBAC)](https://auth0.com/docs/manage-users/access-control/rbac)
- [Principle of Least Privilege](https://en.wikipedia.org/wiki/Principle_of_least_privilege)
- [JWT Token Refresh Patterns](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/)
- [Cassandra UPDATE Semantics](https://docs.datastax.com/en/cql-oss/3.3/cql/cql_reference/cqlUpdate.html)
