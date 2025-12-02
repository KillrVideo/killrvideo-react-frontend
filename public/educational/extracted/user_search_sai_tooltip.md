# User Search with SAI Indexes

SAI (Storage-Attached Indexes) enable fast user lookups by email or name without creating separate lookup tables.

## How It Works

**Traditional Cassandra**: Users are partitioned by `userid` (UUID). To find a user by email, you'd need a separate `users_by_email` table.

**With SAI**:
```cql
CREATE INDEX users_email_idx ON users(email)
USING 'StorageAttachedIndex';

-- Now query directly by email:
SELECT * FROM users WHERE email = 'user@example.com';
```

**Benefits**:
- Single `users` table serves all lookup patterns
- No data duplication between tables
- Indexes stay automatically in sync
- Combine multiple filters: `WHERE email LIKE '%@company.com' AND account_status = 'active'`

**In KillrVideo**: Admin user search queries the `users` table using SAI indexes on `email` and `name` fields.
