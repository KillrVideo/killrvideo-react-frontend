# GET /api/v1/users/me - Get Current User Profile

## Overview

This endpoint returns the profile of the currently authenticated user. It demonstrates JWT-based authentication and how to extract user context from tokens without database lookups on every request.

**Why it exists**: Allows clients to fetch the current user's profile, verify authentication status, and retrieve role information for client-side authorization decisions.

## HTTP Details

- **Method**: GET
- **Path**: `/api/v1/users/me`
- **Auth Required**: Yes (requires `viewer` role minimum)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/account_management.py:61`

### Request Headers

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Response Body

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "firstname": "John",
  "lastname": "Doe",
  "email": "john.doe@example.com",
  "account_status": "viewer",
  "created_date": "2025-10-31T10:30:00Z",
  "last_login_date": "2025-10-31T14:22:15Z"
}
```

## Cassandra Concepts Explained

### Dependency Injection for Authentication

This endpoint uses FastAPI's dependency injection system:

```python
@router.get("/me")
async def read_users_me(current_user: Annotated[User, Depends(get_current_viewer)]):
    return current_user
```

**What happens:**
1. FastAPI sees `Depends(get_current_viewer)`
2. Calls `get_current_viewer()` before the endpoint function
3. `get_current_viewer()` extracts JWT, validates it, fetches user from database
4. User object is injected as `current_user` parameter
5. Endpoint simply returns it (no additional logic needed)

**Benefits**:
- **Reusability**: Same dependency used across all authenticated endpoints
- **Separation of concerns**: Auth logic separate from business logic
- **Type safety**: `current_user` is typed as `User` (Pydantic model)

### Caching Opportunity

**Current behavior**: Every request fetches user from database

**What the JWT contains**:
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "roles": ["viewer"],
  "exp": 1730383335
}
```

**Observation**: JWT already has userid and roles, but we still query the database.

**Why?** User data might have changed since token was issued:
- Email updated
- Account locked/suspended
- Role changed (promoted to creator/moderator)

**Optimization options**:
1. **Trust the JWT** - Return user data from token (fast, but stale)
2. **Add caching** - Redis/Memcached with 1-minute TTL
3. **Add version to JWT** - Only refetch if version changed

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

### 1. Extract User ID from JWT

**Dependency Function**: `app/api/v1/dependencies.py:20`

```python
from jose import jwt, JWTError
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def get_current_viewer(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    token = credentials.credentials

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_id = UUID(user_id_str)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

**What it does**:
- Extracts `Authorization: Bearer <token>` header
- Decodes JWT and verifies signature
- Extracts user ID from `sub` claim
- Validates token expiration automatically (JWT library does this)

### 2. Fetch User Profile from Database

**Dependency Function**: `app/api/v1/dependencies.py:38`

```python
user = await user_service.get_user_by_id_from_table(user_id=user_id)

if user is None:
    raise HTTPException(status_code=404, detail="User not found")

# Verify user has required role
if "viewer" not in user.roles and user.account_status not in ["viewer", "creator", "moderator"]:
    raise HTTPException(status_code=403, detail="Insufficient permissions")

return user
```

**Service Function**: `app/services/user_service.py:176`

**Performance**: **O(1)** - Direct partition key lookup (~5-10ms)

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
│ 1. Client sends GET /api/v1/users/me                     │
│    Header: Authorization: Bearer <JWT>                   │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ 2. FastAPI calls get_current_viewer dependency           │
│    (before endpoint function executes)                   │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ 3. Extract and validate JWT token                        │
│    ├─ Missing/invalid? → 401 Unauthorized                │
│    ├─ Expired? → 401 Unauthorized                        │
│    └─ Valid? → Extract user_id from payload             │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ 4. Query users table by userid                           │
│    SELECT * WHERE userid = jwt_payload.sub               │
│    ├─ Not found? → 404 User not found                    │
│    └─ Found? → Continue                                  │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ 5. Verify user has 'viewer' role                         │
│    ├─ No viewer role? → 403 Forbidden                    │
│    └─ Has role? → Return user object                     │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ 6. Endpoint receives injected user object                │
│    async def read_users_me(current_user: User):          │
│        return current_user  # Already populated!         │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ 7. Return 200 OK with user profile                       │
└──────────────────────────────────────────────────────────┘
```

**Total Queries**: 1 SELECT from users table

**Expected Latency**: 5-15ms (mostly database lookup)

## Special Notes

### 1. JWT Signature Verification

**How it works** (`app/core/security.py:30`):

```python
# Token was created with this secret
SECRET_KEY = settings.SECRET_KEY  # From environment variable

# When decoding, JWT library verifies signature matches
payload = jwt.decode(
    token,
    SECRET_KEY,
    algorithms=["HS256"]  # HMAC SHA-256
)
```

**Security properties**:
- If token is modified (even 1 bit), signature verification fails
- Only servers with SECRET_KEY can create valid tokens
- Clients cannot forge tokens (they don't have SECRET_KEY)

**Warning**: SECRET_KEY must be:
- At least 32 characters (256 bits)
- Truly random (not "mysecret123")
- Never committed to version control
- Rotated periodically

### 2. Token Expiration

The JWT library automatically checks expiration:

```python
payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
# Raises jwt.ExpiredSignatureError if exp < now()
```

**Current TTL**: 24 hours (set during token creation)

**Best practice**: Shorter tokens (1 hour) + refresh token mechanism

### 3. The 404 vs 401 Decision

**Scenario**: JWT is valid, but user no longer exists in database

**Current behavior**: Returns 404 "User not found"

**Alternative**: Return 401 "Invalid token"

**Trade-off**:
- **404**: More accurate (user really doesn't exist)
- **401**: More secure (doesn't leak information about deleted users)

**Recommendation**: Use 401 for consistency

### 4. Role Checking Pattern

The dependency checks if user has the `viewer` role:

```python
if "viewer" not in user.roles and user.account_status not in ["viewer", "creator", "moderator"]:
    raise HTTPException(status_code=403, detail="Insufficient permissions")
```

**Issue**: This checks two different fields for roles:
- `user.roles` (list field)
- `user.account_status` (string field)

**Reason**: The codebase is migrating from `account_status` to `roles` list

**Better approach** (once migration complete):
```python
required_roles = {"viewer", "creator", "moderator"}
if not any(role in required_roles for role in user.roles):
    raise HTTPException(status_code=403)
```

### 5. No Database Write

This endpoint is **read-only**:
- No UPDATE operations
- No INSERT operations
- Safe to cache aggressively
- Can be served from read replicas

**Optimization opportunity**: Add HTTP caching headers:
```python
from fastapi import Response

@router.get("/me")
async def read_users_me(
    current_user: Annotated[User, Depends(get_current_viewer)],
    response: Response
):
    response.headers["Cache-Control"] = "private, max-age=60"
    return current_user
```

## Developer Tips

### Common Pitfalls

1. **Not handling token expiration gracefully**:
   ```javascript
   // Client should refresh token before expiration
   if (tokenExpiresIn < 5_minutes) {
       await refreshToken()
   }
   ```

2. **Storing SECRET_KEY in code**: Use environment variables

3. **Using weak secrets**: Generate with `openssl rand -hex 32`

4. **Not validating algorithm**: Specify `algorithms=["HS256"]` to prevent "none" attack

5. **Trusting client-side role checks**: Always verify on server

### Best Practices

1. **Use HTTP-only cookies** (more secure than localStorage):
   ```python
   response.set_cookie(
       key="access_token",
       value=token,
       httponly=True,
       secure=True,  # HTTPS only
       samesite="strict"
   )
   ```

2. **Implement token refresh**: Short-lived access tokens + refresh tokens

3. **Add token revocation**: Maintain blacklist in Redis for emergency revocation

4. **Log authentication failures**: Monitor for brute force attacks

5. **Rate limit this endpoint**: Prevent token validation DoS

### Performance Expectations

| Operation | Latency | Why |
|-----------|---------|-----|
| JWT decode | < 1ms | CPU-only operation |
| Database lookup | 5-10ms | Partition key query |
| **Total** | **< 15ms** | Very fast |

**Scalability**: This scales linearly with database capacity. Add more Cassandra nodes for more throughput.

### Testing Tips

```python
# Test successful authentication
async def test_get_current_user():
    # Login to get token
    login_response = await client.post("/api/v1/users/login", json={
        "email": "test@example.com",
        "password": "ValidPass123!"
    })
    token = login_response.json()["token"]

    # Use token to get profile
    response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    user = response.json()
    assert user["email"] == "test@example.com"

# Test missing token
async def test_missing_token():
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 403  # FastAPI returns 403 for missing auth

# Test invalid token
async def test_invalid_token():
    response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": "Bearer invalid_token_here"}
    )
    assert response.status_code == 401

# Test expired token
async def test_expired_token():
    from jose import jwt
    from datetime import datetime, timezone, timedelta

    # Create token that expired 1 hour ago
    payload = {
        "sub": str(user_id),
        "roles": ["viewer"],
        "exp": datetime.now(timezone.utc) - timedelta(hours=1)
    }
    expired_token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")

    response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {expired_token}"}
    )
    assert response.status_code == 401
```

## Related Endpoints

- [POST /api/v1/users/login](./POST_users_login.md) - Get JWT token first
- [PUT /api/v1/users/me](./PUT_users_me.md) - Update your profile
- [GET /api/v1/users/{user_id}](./GET_users_by_id.md) - Get other users' public profiles

## Further Learning

- [FastAPI Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/)
- [JWT Security Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [OAuth 2.0 vs JWT](https://stackoverflow.com/questions/39909419/oauth-vs-jwt)
- [HTTP Bearer Authentication](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication)
