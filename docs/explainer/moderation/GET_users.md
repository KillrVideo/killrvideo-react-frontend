# GET /api/v1/moderation/users - Search Users (Moderator Tool)

## Overview

This endpoint allows moderators to search for users by name or email. It powers the user management section of the moderator dashboard, enabling moderators to find specific users when assigning roles, investigating flagged content, or handling account issues.

**Why it exists**: Moderators need to look up users for various administrative tasks -- promoting someone to moderator, checking who uploaded a flagged video, or finding a user who was reported. A search interface is more practical than scrolling through thousands of user records.

**Real-world analogy**: Think of it like the "Search users" box in any admin panel. You type a name or email fragment, and it shows matching accounts.

## HTTP Details

- **Method**: GET
- **Path**: `/api/v1/moderation/users`
- **Auth Required**: Yes (moderator role required)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/moderation.py`

### Request Parameters

```http
GET /api/v1/moderation/users?q=john&page=1&pageSize=20
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search text (matches against firstname, lastname, or email) |
| `page` | integer | No | 1 | Page number (>=1) |
| `pageSize` | integer | No | 20 | Results per page (1-100) |

### Response Body

```json
{
  "data": [
    {
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "firstname": "John",
      "lastname": "Doe",
      "email": "john.doe@example.com",
      "accountStatus": "viewer",
      "createdDate": "2025-10-31T10:30:00Z",
      "lastLoginDate": "2026-03-18T09:15:00Z"
    },
    {
      "userId": "661f9500-f39c-52e5-b827-557766551111",
      "firstname": "Johnny",
      "lastname": "Smith",
      "email": "jsmith@example.com",
      "accountStatus": "creator",
      "createdDate": "2025-11-15T14:00:00Z",
      "lastLoginDate": "2026-03-17T22:00:00Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 20,
    "totalItems": 2,
    "totalPages": 1
  }
}
```

### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{"detail": "Not authenticated"}` |
| 403 | User is not a moderator | `{"detail": "Moderator role required"}` |
| 422 | Missing q parameter | `{"detail": "Search query required"}` |

## Cassandra Concepts Explained

### The Search Problem in Cassandra

Cassandra is designed for fast lookups by **primary key**, not for free-text search. The `users` table has `userid` as its primary key, which means:

```cql
-- Fast: lookup by primary key
SELECT * FROM users WHERE userid = ?;          -- O(1) ✓

-- Impossible without SAI: search by name
SELECT * FROM users WHERE firstname LIKE '%john%';  -- Requires index or ALLOW FILTERING
```

**The challenge**: Moderators want to search by name or email, but these are not the partition key.

### Storage-Attached Indexes (SAI)

SAI is Cassandra's answer to secondary indexing. It creates an inverted index alongside the data:

```cql
CREATE CUSTOM INDEX users_firstname_idx
ON killrvideo.users(firstname)
USING 'StorageAttachedIndex';

CREATE CUSTOM INDEX users_email_idx
ON killrvideo.users(email)
USING 'StorageAttachedIndex';
```

**With SAI**, the `$regex` filter becomes efficient:
```python
cursor = users_table.find(
    filter={"firstname": {"$regex": "john", "$options": "i"}}
)
```

**Without SAI**, this query would require `ALLOW FILTERING` and scan every row.

### SAI Limitations

SAI is powerful but has boundaries. Not all query patterns are supported:

1. **$regex support varies**: Some Astra environments support regex on SAI-indexed text columns, others don't
2. **No cross-column OR**: You can't search `firstname OR lastname OR email` in a single SAI query
3. **Case sensitivity**: SAI text matching is case-sensitive by default; `$options: "i"` adds overhead

**Result**: The backend implements a **graceful degradation** strategy -- try SAI first, fall back to client-side filtering if the operation is unsupported.

### Graceful Degradation Pattern

This is one of the most important patterns in the codebase. When SAI doesn't support the query, the backend doesn't crash -- it falls back to a less efficient but correct approach:

```
Strategy 1: Use $regex with SAI          (fast, ~20ms)
    ↓ (if UNSUPPORTED_FILTER_OPERATION)
Strategy 2: Fetch all, filter in Python   (slow, ~200ms)
```

**Analogy**: Like a GPS app that tries satellite navigation first, then falls back to cell tower triangulation. Less precise but still gets you there.

## Data Model

### Table: `users`

```cql
CREATE TABLE killrvideo.users (
    userid uuid PRIMARY KEY,
    created_date timestamp,
    email text,
    firstname text,
    lastname text,
    account_status text,        -- 'viewer', 'creator', 'moderator'
    last_login_date timestamp
);
```

**Indexes for search** (if available):

```cql
CREATE CUSTOM INDEX users_firstname_idx
ON killrvideo.users(firstname)
USING 'StorageAttachedIndex';

CREATE CUSTOM INDEX users_lastname_idx
ON killrvideo.users(lastname)
USING 'StorageAttachedIndex';

CREATE CUSTOM INDEX users_email_idx
ON killrvideo.users(email)
USING 'StorageAttachedIndex';
```

## Database Queries

### 1. Primary Strategy: Regex Search with SAI

**Service Function**: `app/services/user_service.py` - `search_users()`

```python
async def search_users(
    query: str,
    page: int = 1,
    page_size: int = 20
) -> Tuple[List[dict], int]:
    users_table = await get_table("users")

    try:
        # Try regex search (requires SAI index)
        cursor = users_table.find(
            filter={
                "$or": [
                    {"firstname": {"$regex": query, "$options": "i"}},
                    {"lastname": {"$regex": query, "$options": "i"}},
                    {"email": {"$regex": query, "$options": "i"}}
                ]
            },
            limit=page_size,
            skip=(page - 1) * page_size
        )

        docs = await cursor.to_list()
        return docs, len(docs)

    except Exception as e:
        if "UNSUPPORTED_FILTER_OPERATION" in str(e):
            # Fall back to client-side filtering
            return await _search_users_fallback(users_table, query, page, page_size)
        raise
```

**Equivalent CQL** (conceptual -- CQL doesn't support OR directly):
```cql
-- This is what SAI enables (conceptual, not real CQL syntax)
SELECT * FROM killrvideo.users
WHERE firstname LIKE '%john%'
   OR lastname LIKE '%john%'
   OR email LIKE '%john%'
LIMIT 20;
```

**Performance**: **~20-50ms** with SAI indexes

### 2. Fallback Strategy: Client-Side Filtering

When SAI doesn't support `$regex` or `$or`, the backend fetches all users and filters in Python:

```python
async def _search_users_fallback(
    users_table,
    query: str,
    page: int,
    page_size: int
) -> Tuple[List[dict], int]:
    # Fetch all users (expensive!)
    cursor = users_table.find(
        filter={},
        limit=1000  # Safety cap
    )
    all_docs = await cursor.to_list()

    # Client-side substring match (case-insensitive)
    query_lower = query.lower()
    matched = [
        doc for doc in all_docs
        if query_lower in doc.get("firstname", "").lower()
        or query_lower in doc.get("lastname", "").lower()
        or query_lower in doc.get("email", "").lower()
    ]

    # Paginate client-side
    start = (page - 1) * page_size
    end = start + page_size
    page_docs = matched[start:end]

    return page_docs, len(matched)
```

**Equivalent CQL**:
```cql
-- Fetch everything, filter in application
SELECT * FROM killrvideo.users LIMIT 1000;
```

**Performance**: **~100-500ms** depending on table size (fetches up to 1000 rows)

### 3. The $or Operator

The `$or` operator in the Astra Data API combines multiple conditions:

```python
filter={
    "$or": [
        {"firstname": {"$regex": "john", "$options": "i"}},
        {"lastname": {"$regex": "john", "$options": "i"}},
        {"email": {"$regex": "john", "$options": "i"}}
    ]
}
```

**Translation**: "Find users where firstname contains 'john' OR lastname contains 'john' OR email contains 'john'"

**CQL doesn't have OR**: In native CQL, you would need multiple queries and merge results client-side. The Data API abstracts this complexity.

### 4. The UNSUPPORTED_FILTER_OPERATION Error

When the Astra backend can't execute a filter (missing index, unsupported operator), it returns this specific error code:

```json
{
  "errors": [{
    "errorCode": "UNSUPPORTED_FILTER_OPERATION",
    "message": "$regex is not supported on column 'firstname' without an index"
  }]
}
```

The Python driver raises this as an exception, which the service catches:

```python
except Exception as e:
    if "UNSUPPORTED_FILTER_OPERATION" in str(e):
        # Graceful fallback
        return await _search_users_fallback(...)
    raise  # Unknown error, let it propagate
```

## Implementation Flow

```
┌───────────────────────────────────────────────────────────┐
│ 1. Client sends GET /api/v1/moderation/users?q=john       │
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
│ 3. Validate query parameter                               │
│    ├─ q missing or empty? → 422 Validation Error          │
│    └─ q provided? → Continue                              │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 4. Try Strategy 1: $regex with SAI                        │
│    find(filter={$or: [                                    │
│      {firstname: {$regex: "john"}},                       │
│      {lastname: {$regex: "john"}},                        │
│      {email: {$regex: "john"}}                            │
│    ]})                                                    │
│    ├─ Success? → Use results                              │
│    └─ UNSUPPORTED_FILTER_OPERATION? → Go to Step 5        │
└──────────┬─────────────────────────┬──────────────────────┘
           │                         │
           ▼                         ▼
┌──────────────────┐  ┌────────────────────────────────────┐
│ Return results   │  │ 5. Fallback: fetch all + filter    │
│ from SAI query   │  │    find(filter={}, limit=1000)     │
│                  │  │    Python substring match on        │
│                  │  │    firstname, lastname, email       │
└──────────────────┘  └──────────┬─────────────────────────┘
           │                     │
           └──────────┬──────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│ 6. Paginate results                                       │
│    slice matched[start:end]                               │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│ 7. Return 200 OK with {data: [...], pagination: {...}}    │
└───────────────────────────────────────────────────────────┘
```

**Happy path queries**: 1 (SAI regex)

**Fallback path queries**: 1 (full scan + client filter)

**Expected Latency**: 20-50ms (SAI) or 100-500ms (fallback)

## Special Notes

### 1. Security: Exposing User Data to Moderators

This endpoint exposes user emails and account details. Only moderators should have access. The frontend should:
- Never call this endpoint from non-moderator pages
- Never cache the results in localStorage
- Clear results when the moderator navigates away

```typescript
// Frontend: only render if user is moderator
{currentUser.roles.includes('moderator') && (
  <UserSearchPanel />
)}
```

### 2. The 1000-Row Safety Cap

The fallback strategy limits the scan to 1000 users:

```python
cursor = users_table.find(filter={}, limit=1000)
```

**Why 1000?**
- Prevents accidentally loading millions of rows into memory
- Covers the expected user base for KillrVideo (demo app)
- For production apps with millions of users, the fallback would be inadequate

**What happens if there are more than 1000 users?**
- The search may miss users beyond the first 1000 loaded
- The moderator would need to refine their search query
- A production system should require SAI indexes and never use the fallback

### 3. Case-Insensitive Search

Both strategies use case-insensitive matching:

**SAI strategy**: `{"$options": "i"}` tells the regex to ignore case
```python
{"firstname": {"$regex": "john", "$options": "i"}}
# Matches: "John", "JOHN", "john", "Johnny"
```

**Fallback strategy**: `.lower()` converts both sides to lowercase
```python
query_lower = query.lower()
if query_lower in doc.get("firstname", "").lower():
    # Matches same as above
```

### 4. Partial Matching

The `$regex` operator matches **substrings**, not just prefixes:

```
Query: "doe"
Matches: "John Doe", "Jane Doe-Smith", "Doering"  (all contain "doe")
```

This is intentional -- moderators often only know part of a name. But it means short queries like "a" would match almost everyone.

**Recommended minimum query length** (not enforced, but the frontend could warn):
```typescript
if (searchQuery.length < 2) {
  setWarning("Enter at least 2 characters for better results");
}
```

### 5. No Search History Logging

Currently, moderator searches are not logged. For compliance purposes, you might want to track what moderators search for:

```python
logger.info(f"User search: moderator={current_user.userid} query='{query}'")
```

**Why log?**
- Detect misuse (moderator searching for ex-partner, etc.)
- Compliance with data access regulations (GDPR requires logging who accessed personal data)

### 6. Performance Comparison

| Strategy | Latency | Accuracy | Scalability |
|----------|---------|----------|-------------|
| SAI $regex | 20-50ms | High | Good (indexed) |
| Client-side filter | 100-500ms | High (within 1000-row cap) | Poor |
| Full CQL LIKE | N/A (not available via Data API) | High | Moderate |

The SAI strategy is clearly preferred. The fallback exists only as a safety net.

## Developer Tips

### Common Pitfalls

1. **Not handling the fallback**: If SAI indexes aren't created, every search hits the slow path
   ```python
   # Always implement the fallback -- you can't guarantee SAI exists
   ```

2. **Short search queries**: "a" matches almost every user. Consider a minimum length.

3. **Searching by userid**: This endpoint searches by name/email. To look up by userId, use `GET /api/v1/users/{userId}` instead.

4. **Memory pressure from fallback**: Loading 1000 user documents into memory can use significant RAM. Monitor memory usage.

5. **Not escaping regex special characters**: If the user searches for "john+doe", the `+` is a regex operator
   ```python
   import re
   safe_query = re.escape(query)  # "john\+doe"
   ```

### Best Practices

1. **Require SAI indexes in production**: The fallback is a development convenience, not a production strategy

2. **Add debouncing on the frontend**: Don't search on every keystroke
   ```typescript
   const debouncedSearch = useDebouncedCallback(
     (query: string) => searchUsers(query),
     300  // Wait 300ms after last keystroke
   );
   ```

3. **Show search strategy in dev mode**: Help developers know which path was used
   ```python
   response_headers["X-Search-Strategy"] = "sai" or "fallback"
   ```

4. **Implement autocomplete**: Return suggestions as the moderator types

5. **Cache recent searches**: Moderators often search for the same users

### Testing Tips

```python
# Test successful user search
async def test_search_users():
    response = await client.get(
        "/api/v1/moderation/users?q=john",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    for user in data["data"]:
        # At least one field should contain "john" (case-insensitive)
        name_match = (
            "john" in user.get("firstname", "").lower()
            or "john" in user.get("lastname", "").lower()
            or "john" in user.get("email", "").lower()
        )
        assert name_match

# Test non-moderator access
async def test_search_users_forbidden():
    response = await client.get(
        "/api/v1/moderation/users?q=john",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )

    assert response.status_code == 403

# Test missing query parameter
async def test_search_users_missing_query():
    response = await client.get(
        "/api/v1/moderation/users",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    assert response.status_code == 422

# Test empty results
async def test_search_users_no_results():
    response = await client.get(
        "/api/v1/moderation/users?q=zzzznonexistentuser",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    data = response.json()
    assert len(data["data"]) == 0

# Test pagination
async def test_search_users_pagination():
    response = await client.get(
        "/api/v1/moderation/users?q=a&page=1&pageSize=5",
        headers={"Authorization": f"Bearer {moderator_token}"}
    )

    data = response.json()
    assert data["pagination"]["pageSize"] == 5
    assert len(data["data"]) <= 5
```

## Related Endpoints

- [POST /api/v1/moderation/users/{user_id}/assign-moderator](./POST_assign_moderator.md) - Promote a found user
- [POST /api/v1/moderation/users/{user_id}/revoke-moderator](./POST_revoke_moderator.md) - Demote a found user
- [GET /api/v1/users/{userId}](../account_management/GET_users_by_id.md) - Look up a specific user by ID

## Further Learning

- [Storage-Attached Indexes (SAI)](https://docs.datastax.com/en/astra-db-serverless/databases/sai.html)
- [Astra Data API Filtering](https://docs.datastax.com/en/astra-db-serverless/api-reference/collections.html#filter-operators)
- [Regex Performance in Databases](https://use-the-index-luke.com/sql/where-clause/searching-for-ranges/like-performance-tuning)
- [GDPR Data Access Logging](https://gdpr-info.eu/art-30-gdpr/)
