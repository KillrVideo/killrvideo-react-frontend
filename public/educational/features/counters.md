# Distributed Counter Columns

Counter columns in Cassandra are specialized columns designed for tracking metrics that increment or decrement across a distributed database. Unlike regular columns, counters allow multiple nodes to update the same value concurrently without conflicts, making them perfect for tracking video views, ratings, and engagement metrics that update frequently from different locations.

## How Counters Work

In traditional databases, incrementing a counter requires reading the value, incrementing it, and writing it back (read-modify-write cycle). In a distributed system, this creates race conditions. Cassandra's counter columns solve this by storing increments separately on each replica and merging them during reads, guaranteeing eventual consistency without locks.

```cql
-- Create a counter table
CREATE TABLE IF NOT EXISTS video_playback_stats (
    videoid uuid PRIMARY KEY,
    views counter,
    total_play_time counter,
    complete_views counter
);

-- Increment a counter (no read required!)
UPDATE video_playback_stats
SET views = views + 1
WHERE videoid = ?;
```

**Key Benefits**:
- **No read-before-write**: Increments are atomic operations
- **Distributed safety**: Updates from different nodes are automatically reconciled
- **High throughput**: No coordination required between replicas
- **Eventually consistent**: All replicas converge to the correct total

**In KillrVideo**: Counter columns track video views (`views`), watch time (`total_play_time`), and complete views (`complete_views`) across the distributed Astra DB cluster, allowing millions of concurrent viewers to increment counters without coordination overhead.
