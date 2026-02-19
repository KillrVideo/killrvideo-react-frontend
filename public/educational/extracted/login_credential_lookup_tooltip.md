# Credential Lookup & Login Counters

Login is a **partition key lookup** on the `user_credentials` table — Cassandra's fastest operation.

## How Login Works in the DB

```cql
-- Step 1: Find credentials by email (O(1) partition key lookup)
SELECT * FROM user_credentials WHERE email = 'user@example.com';

-- Step 2: On failure, increment the counter
UPDATE login_attempts
SET failed_attempts = failed_attempts + 1
WHERE email = 'user@example.com';
```

## Why a Separate Counter Table?

Cassandra requires **counter columns in their own dedicated table** — you cannot mix counters with regular columns. That's why `login_attempts` exists separately from `user_credentials`:

```cql
CREATE TABLE login_attempts (
    email text PRIMARY KEY,
    failed_attempts counter    -- Must be in a counter-only table
);
```

**Key constraint**: Counter tables can only contain the primary key columns and counter columns. No regular text, boolean, or timestamp columns allowed.

**In KillrVideo**: Login performs an O(1) lookup by email, verifies the bcrypt hash in the application layer, and tracks failed attempts in a dedicated counter table for account lockout.
