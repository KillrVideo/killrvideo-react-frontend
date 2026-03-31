# GET /api/v1/users/{user_id} - Get Public User Profile

## Overview

This endpoint retrieves public profile information for any user by their UUID. Unlike `/users/me`, this endpoint is **unauthenticated** and returns only public information (no sensitive data).

**Why it exists**: Allows displaying user information on video listings, comments, and other public-facing features without requiring authentication.

## HTTP Details

- **Method**: GET
- **Path**: `/api/v1/users/{user_id}`
- **Auth Required**: No (public endpoint)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/account_management.py:88`

### Request

```http
GET /api/v1/users/550e8400-e29b-41d4-a716-446655440000
```

### Response Body

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "firstname": "John",
  "lastname": "Doe",
  "email": "john.doe@example.com",
  "account_status": "creator",
  "created_date": "2025-10-31T10:30:00Z",
  "last_login_date": "2025-10-31T14:22:15Z"
}
```

**Note**: While this returns the same fields as `/users/me`, in a production app you might want to hide sensitive fields like `email` or `last_login_date`.

## Cassandra Concepts Explained

### UUID as Partition Key

This endpoint demonstrates the ideal Cassandra query pattern:

```python
await table.find_one(filter={"userid": user_id})
```

**Why this is fast**:
- `userid` is the partition key
- Cassandra uses consistent hashing to map UUID → node
- Single node lookup, no coordination needed
- O(1) time complexity

### UUID Format Validation

FastAPI validates the UUID format automatically:

```python
@router.get("/{user_id_path:uuid}")
async def get_user_by_id(user_id_path: UUID):
    ...
```

**Invalid UUID examples** (return 422 Validation Error):
- `not-a-uuid`
- `123`
- `550e8400-e29b-41d4-a716` (too short)

**Valid UUID examples**:
- `550e8400-e29b-41d4-a716-446655440000` (standard format)
- `550E8400-E29B-41D4-A716-446655440000` (case insensitive)

**Code Location**: `app/api/v1/endpoints/account_management.py:89`

### Public vs Private Endpoints

**Public endpoint** (`/users/{user_id}`):
- No authentication required
- No dependency injection
- Direct service call
- Fast, cacheable

**Private endpoint** (`/users/me`):
- Requires JWT token
- Dependency injection (`get_current_viewer`)
- Additional auth checks
- Slightly slower

**Code comparison**:
```python
# Public
async def get_user_by_id(user_id_path: UUID):
    return await user_service.get_user_by_id_from_table(user_id_path)

# Private
async def read_users_me(current_user: Annotated[User, Depends(get_current_viewer)]):
    return current_user  # Already fetched by dependency
```

## Data Model

### Table: `users`

```cql
CREATE TABLE killrvideo.users (
    userid uuid PRIMARY KEY,
    created_date timestamp,
    email text,
    firstname text,
    lastname text,
    account_status text,
    last_login_date timestamp
);
```

**Schema Location**: `docs/schema-astra.cql:25-33`

## Database Queries

### Single Query: Fetch User by ID

**Service Function**: `app/services/user_service.py:176`

**Performance**: **O(1)** - Direct partition key lookup (~5ms)

**Result**:
```json
{
  "userid": "550e8400-e29b-41d4-a716-446655440000",
  "firstname": "John",
  "lastname": "Doe",
  "email": "john.doe@example.com",
  "account_status": "creator",
  "created_date": "2025-10-31T10:30:00.000Z",
  "last_login_date": "2025-10-31T14:22:15.000Z"
}
```

#### CQL

```cql
SELECT *
FROM killrvideo.users
WHERE userid = ?;
```

#### Data API (astrapy Collection)

```python
result = await collection.find_one(
    filter={"userid": "550e8400-e29b-41d4-a716-446655440000"}
)
```

#### Table API (astrapy Table)

```python
result = await table.find_one(
    filter={"userid": "550e8400-e29b-41d4-a716-446655440000"}
)
```

#### Driver Examples

<details>
<summary>Python (cassandra-driver)</summary>

```python
from cassandra.cluster import Cluster
from uuid import UUID

cluster = Cluster(["127.0.0.1"])
session = cluster.connect("killrvideo")

prepared = session.prepare("SELECT * FROM users WHERE userid = ?")
result = session.execute(prepared, [UUID("550e8400-e29b-41d4-a716-446655440000")])
row = result.one()
```

</details>

<details>
<summary>Python (astrapy 2.x - Data API)</summary>

```python
from astrapy import DataAPIClient

client = DataAPIClient(token)
db = client.get_database_by_api_endpoint(endpoint)
collection = db.get_collection("users")

result = await collection.find_one(
    filter={"userid": "550e8400-e29b-41d4-a716-446655440000"}
)
```

</details>

<details>
<summary>Python (astrapy 2.x - Table API)</summary>

```python
from astrapy import DataAPIClient

client = DataAPIClient(token)
db = client.get_database_by_api_endpoint(endpoint)
table = db.get_table("users")

result = await table.find_one(
    filter={"userid": "550e8400-e29b-41d4-a716-446655440000"}
)
```

</details>

<details>
<summary>Node.js (cassandra-driver)</summary>

```javascript
const cassandra = require("cassandra-driver");

const client = new cassandra.Client({
  contactPoints: ["127.0.0.1"],
  localDataCenter: "datacenter1",
  keyspace: "killrvideo",
});

const query = "SELECT * FROM users WHERE userid = ?";
const result = await client.execute(
  query,
  [cassandra.types.Uuid.fromString("550e8400-e29b-41d4-a716-446655440000")],
  { prepare: true }
);
const row = result.first();
```

</details>

<details>
<summary>Node.js (@datastax/astra-db-ts 2.x - Data API)</summary>

```typescript
import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(token);
const db = client.db(endpoint);
const collection = db.collection("users");

const result = await collection.findOne({
  userid: "550e8400-e29b-41d4-a716-446655440000",
});
```

</details>

<details>
<summary>Node.js (@datastax/astra-db-ts 2.x - Table API)</summary>

```typescript
import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(token);
const db = client.db(endpoint);
const table = db.table("users");

const result = await table.findOne({
  userid: "550e8400-e29b-41d4-a716-446655440000",
});
```

</details>

<details>
<summary>Java (java-driver-core 4.x)</summary>

```java
import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.cql.*;
import java.util.UUID;

CqlSession session = CqlSession.builder()
    .withKeyspace("killrvideo")
    .build();

PreparedStatement prepared = session.prepare(
    "SELECT * FROM users WHERE userid = ?"
);
BoundStatement bound = prepared.bind(
    UUID.fromString("550e8400-e29b-41d4-a716-446655440000")
);
Row row = session.execute(bound).one();
```

</details>

<details>
<summary>Java (astra-db-java 2.x - Data API)</summary>

```java
import com.datastax.astra.client.DataAPIClient;
import com.datastax.astra.client.Collection;

DataAPIClient client = new DataAPIClient(token);
var db = client.getDatabase(endpoint);
Collection<Document> collection = db.getCollection("users");

Optional<Document> result = collection.findOne(
    eq("userid", "550e8400-e29b-41d4-a716-446655440000")
);
```

</details>

<details>
<summary>Java (astra-db-java 2.x - Table API)</summary>

```java
import com.datastax.astra.client.DataAPIClient;
import com.datastax.astra.client.tables.Table;

DataAPIClient client = new DataAPIClient(token);
var db = client.getDatabase(endpoint);
Table<Row> table = db.getTable("users");

Optional<Row> result = table.findOne(
    eq("userid", "550e8400-e29b-41d4-a716-446655440000")
);
```

</details>

<details>
<summary>C# (CassandraCSharpDriver 3.x)</summary>

```csharp
using Cassandra;
using System;

var cluster = Cluster.Builder()
    .AddContactPoint("127.0.0.1")
    .Build();
var session = cluster.Connect("killrvideo");

var prepared = session.Prepare("SELECT * FROM users WHERE userid = ?");
var bound = prepared.Bind(Guid.Parse("550e8400-e29b-41d4-a716-446655440000"));
var row = session.Execute(bound).FirstOrDefault();
```

> **Note**: C# does not have a Data API or Table API client. Use CQL for direct access, or call the Data API via REST/HTTP.

</details>

<details>
<summary>Go (gocql v2)</summary>

```go
package main

import (
    "github.com/gocql/gocql"
    "time"
)

cluster := gocql.NewCluster("127.0.0.1")
cluster.Keyspace = "killrvideo"
session, _ := cluster.CreateSession()
defer session.Close()

userId, _ := gocql.ParseUUID("550e8400-e29b-41d4-a716-446655440000")

var firstname, lastname, email, accountStatus string
var createdDate, lastLoginDate time.Time

err := session.Query(
    "SELECT * FROM users WHERE userid = ?", userId,
).Scan(&userId, &createdDate, &email, &firstname, &lastname,
       &accountStatus, &lastLoginDate)
```

> **Note**: Go does not have a Data API or Table API client. Use CQL for direct access, or call the Data API via REST/HTTP.

</details>

## Implementation Flow

```
┌──────────────────────────────────────────────────────────┐
│ 1. Client sends GET /api/v1/users/{user_id}              │
│    No authentication required                            │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ 2. FastAPI validates UUID format                         │
│    ├─ Invalid format? → 422 Validation Error             │
│    └─ Valid UUID? → Continue                             │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ 3. Query users table by userid                           │
│    SELECT * FROM users WHERE userid = ?                  │
│    ├─ Not found? → 404 User not found                    │
│    └─ Found? → Continue                                  │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ 4. Map database document to User model                   │
│    User.model_validate(user_data_dict)                   │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ 5. Return 200 OK with user profile                       │
└──────────────────────────────────────────────────────────┘
```

**Total Queries**: 1 SELECT

**Expected Latency**: 5-10ms

## Special Notes

### 1. Privacy Considerations

**Current behavior**: Returns ALL user fields including email and last_login_date

**Production recommendation**: Create a separate `PublicUserProfile` model:

```python
class PublicUserProfile(BaseModel):
    userId: UUID
    firstname: str
    lastname: str
    account_status: str
    created_date: datetime
    # Omit: email, last_login_date

@router.get("/{user_id_path:uuid}", response_model=PublicUserProfile)
async def get_user_by_id(user_id_path: UUID):
    user = await user_service.get_user_by_id_from_table(user_id_path)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user  # Pydantic filters to only public fields
```

**Why?**
- Email is PII (Personal Identifiable Information)
- Last login date reveals activity patterns
- Principle of least privilege: only expose what's needed

### 2. Caching Opportunity

**This endpoint is a perfect caching candidate**:

```python
from fastapi import Response

@router.get("/{user_id_path:uuid}")
async def get_user_by_id(user_id_path: UUID, response: Response):
    user_obj = await user_service.get_user_by_id_from_table(user_id=user_id_path)

    if user_obj is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Cache for 5 minutes
    response.headers["Cache-Control"] = "public, max-age=300"

    return user_obj
```

**Benefits**:
- CDN/browser can cache responses
- Reduces database load for popular profiles
- Stale data risk is low (profiles change infrequently)

**Even better**: Add Redis/Memcached layer:
```python
# Check cache first
cached_user = await redis.get(f"user:{user_id}")
if cached_user:
    return json.loads(cached_user)

# Cache miss, fetch from database
user = await get_user_by_id_from_table(user_id)
await redis.setex(f"user:{user_id}", 300, json.dumps(user.dict()))
return user
```

### 3. Bulk Lookup Pattern

**Scenario**: Display 100 video thumbnails, each needs uploader name

**Naive approach** (N+1 query problem):
```python
for video in videos:
    uploader = await get_user_by_id(video.userid)
    video.uploader_name = uploader.firstname
# 100 database queries!
```

**Better approach**: Bulk fetch (see `app/services/user_service.py:332`)
```python
user_ids = [video.userid for video in videos]
users_map = await get_users_by_ids(user_ids)  # 1 query with $in

for video in videos:
    uploader = users_map.get(video.userid)
    video.uploader_name = uploader.firstname if uploader else "Unknown"
# 1 database query!
```

**Service function**:
```python
async def get_users_by_ids(user_ids: List[UUID]) -> Dict[UUID, User]:
    table = await get_table("users")

    try:
        cursor = table.find(
            filter={"userid": {"$in": [str(uid) for uid in user_ids]}},
            limit=len(user_ids)
        )
        docs = await cursor.to_list()
    except DataAPIResponseException:
        # Fallback: Individual queries
        docs = await asyncio.gather(*[
            table.find_one(filter={"userid": str(uid)})
            for uid in user_ids
        ])

    return {UUID(d["userid"]): User.model_validate(d) for d in docs}
```

**Code Location**: `app/services/user_service.py:332-372`

### 4. 404 vs 200 with null

**Question**: Should non-existent users return 404 or 200 with null?

**Current behavior**: 404 "User not found"
```python
if user_obj is None:
    raise HTTPException(status_code=404, detail="User not found")
```

**Alternative**: 200 with null body
```python
if user_obj is None:
    return None  # Or JSONResponse(content=None)
```

**Trade-offs**:
| Approach | Pros | Cons |
|----------|------|------|
| **404** | Clear error signal, semantic correctness | Clients must handle errors |
| **200 + null** | Easier client code | Ambiguous (null could mean loading) |

**Recommendation**: Stick with 404 (REST best practice)

### 5. User Deletion Handling

**What if a user is deleted?**

```python
# User uploads video
video.userid = user.userId

# Later, user deletes account (soft delete)
await users_table.update_one(
    filter={"userid": user_id},
    update={"$set": {"deleted": True}}
)

# Video still references deleted user!
GET /api/v1/users/{deleted_user_id}
# Returns 404 or special "Deleted User" response?
```

**Better schema**:
```python
class User(BaseModel):
    userId: UUID
    firstname: str
    deleted: bool = False  # Add deleted flag

# In endpoint:
if user.deleted:
    return PublicUserProfile(
        userId=user.userId,
        firstname="[Deleted User]",
        lastname="",
        ...
    )
```

**Not implemented** in current codebase.

## Developer Tips

### Common Pitfalls

1. **Exposing sensitive data**: Filter PII in public endpoints

2. **N+1 queries**: Use bulk fetch for lists

3. **No caching**: Public data should be cached aggressively

4. **Not validating UUID**: Let FastAPI's path parameter do it

5. **Inconsistent 404 handling**: Decide on a pattern and stick to it

### Best Practices

1. **Use separate response models for public vs private**:
   ```python
   PublicUserProfile  # Subset of fields
   User               # All fields
   ```

2. **Add HTTP caching headers**: `Cache-Control`, `ETag`

3. **Implement bulk fetch helpers**: Avoid N+1 query anti-pattern

4. **Log 404s separately**: Distinguish real errors from user not found

5. **Consider soft deletes**: Keep data for referential integrity

### Performance Expectations

| Scenario | Latency | Notes |
|----------|---------|-------|
| Cache hit (Redis) | < 1ms | Ideal for hot profiles |
| Cache miss | 5-10ms | Single Cassandra query |
| Bulk fetch (10 users) | 10-15ms | One query with $in |
| N+1 pattern (10 users) | 50-100ms | **Avoid this!** |

**Scalability**: Horizontal - add Cassandra nodes and Redis instances as needed

### Testing Tips

```python
# Test successful lookup
async def test_get_user_by_id():
    response = await client.get(f"/api/v1/users/{test_user_id}")

    assert response.status_code == 200
    user = response.json()
    assert user["userId"] == str(test_user_id)

# Test non-existent user
async def test_user_not_found():
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"/api/v1/users/{fake_id}")

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

# Test invalid UUID format
async def test_invalid_uuid():
    response = await client.get("/api/v1/users/not-a-uuid")

    assert response.status_code == 422  # Validation error

# Test bulk fetch helper
async def test_bulk_user_fetch():
    from app.services.user_service import get_users_by_ids

    user_ids = [user1_id, user2_id, user3_id]
    users_map = await get_users_by_ids(user_ids)

    assert len(users_map) == 3
    assert user1_id in users_map
    assert users_map[user1_id].firstname == "User1"

# Test caching (if implemented)
async def test_cache_headers():
    response = await client.get(f"/api/v1/users/{test_user_id}")

    assert "Cache-Control" in response.headers
    assert "max-age" in response.headers["Cache-Control"]
```

## Related Endpoints

- [GET /api/v1/users/me](./GET_users_me.md) - Get your own profile (authenticated)
- [GET /api/v1/videos/by-uploader/{user_id}](../video_catalog/GET_videos_by_uploader.md) - Videos by this user
- [GET /api/v1/users/{user_id}/comments](../comments_ratings/GET_users_comments.md) - Comments by this user

## Further Learning

- [REST API Best Practices](https://restfulapi.net/http-status-codes/)
- [HTTP Caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [N+1 Query Problem](https://stackoverflow.com/questions/97197/what-is-the-n1-selects-problem-in-orm-object-relational-mapping)
- [UUIDs in Cassandra](https://docs.datastax.com/en/cql-oss/3.x/cql/cql_reference/uuid_type_r.html)
