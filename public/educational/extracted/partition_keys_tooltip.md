# Partition Keys in Cassandra

The **partition key** determines which node in the cluster stores your data. It's the first part of the PRIMARY KEY definition.

## Why It Matters

When you query by partition key, Cassandra can find your data instantly (**O(1) lookup**) because it knows exactly which node to check.

**Think of it like this**:
- **Partition Key = Street Address**: Tells you exactly which house (node) to go to
- **Without Partition Key = House Number Only**: You'd have to search every street in the city

## Example

```cql
CREATE TABLE videos (
    videoid uuid PRIMARY KEY,  -- videoid is the partition key
    name text,
    userid uuid
);

-- Fast O(1) lookup:
SELECT * FROM videos WHERE videoid = 550e8400-...;

-- Slow (requires SAI index or ALLOW FILTERING):
SELECT * FROM videos WHERE name = 'Tutorial';
```

**In KillrVideo**: Videos use `videoid` as partition key for fast single-video lookups. User profiles use `userid` as partition key for instant profile retrieval.
