# Dual-Table Writes for User Registration

When you register, Cassandra writes to **two separate tables** — because Cassandra has no JOINs, each query pattern needs its own table.

## The Two Tables

```cql
-- Table 1: Profile lookups by user ID
CREATE TABLE users (
    userid uuid PRIMARY KEY,
    email text,
    firstname text,
    lastname text,
    account_status text
);

-- Table 2: Credential lookups by email
CREATE TABLE user_credentials (
    email text PRIMARY KEY,   -- Partition key is email for login lookups
    password text,
    userid uuid,
    account_locked boolean
);
```

**Why separate?**
- **Different partition keys**: `users` is keyed by `userid`, `user_credentials` by `email`
- **Security**: Credentials are isolated from frequently-accessed profile data
- **Performance**: Login checks only read the small credentials row

## No Multi-Table Transactions

Cassandra doesn't support cross-table transactions. Both INSERTs happen independently — if one fails, you get an orphaned record. Production systems handle this with idempotent retries or background reconciliation.

**In KillrVideo**: Registration writes to `users` + `user_credentials` in sequence, and SAI indexes on `users.email` enable flexible lookups without yet another table.
