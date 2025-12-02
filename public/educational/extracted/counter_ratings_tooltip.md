# Rating Aggregation with Counters

Counter columns enable **distributed, atomic rating aggregation** without coordination overhead. When users rate videos, Cassandra increments counters across nodes instantly—no read-modify-write cycles or race conditions.

## How It Works

**Traditional Approach (Slow)**:
1. Read current total + count
2. Add new rating
3. Write back (race condition risk)

**Counter Columns (Fast)**:
```cql
CREATE TABLE video_ratings (
    videoid uuid PRIMARY KEY,
    rating_counter counter,    -- Count of ratings
    rating_total counter        -- Sum of all ratings
);

-- Atomic increment across distributed nodes:
UPDATE video_ratings
SET rating_counter = rating_counter + 1,
    rating_total = rating_total + 5
WHERE videoid = 550e8400-...;

-- Calculate average:
SELECT videoid,
       round(rating_total / rating_counter, 1) as avg_rating
FROM video_ratings WHERE videoid = ?;
```

**Benefits**:
- ✅ **Atomic**: No race conditions or lost updates
- ✅ **Distributed**: Increments happen locally on any node
- ✅ **Fast**: No read-before-write overhead
- ✅ **Reliable**: Eventually consistent with conflict-free semantics

**In KillrVideo**: Video ratings use separate `rating_counter` (number of votes) and `rating_total` (sum of star values) counters. The average is calculated on read by dividing total by count.
