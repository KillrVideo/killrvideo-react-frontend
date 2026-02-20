# Time-Series Bucketing for Latest Videos

Cassandra models "latest videos" as a **time-series table** using date-based partitioning. Each day gets its own partition, and videos within that day are sorted by timestamp.

## The Data Model

```cql
CREATE TABLE latest_videos (
    day date,                    -- Partition key: one partition per day
    added_date timestamp,        -- Clustering column: sorts within the day
    videoid uuid,
    name text,
    preview_image_location text,
    userid uuid,
    PRIMARY KEY (day, added_date, videoid)
) WITH CLUSTERING ORDER BY (added_date DESC);
```

**Why bucket by day?**
- **Bounded partitions**: Each partition holds one day's videos, preventing unbounded growth
- **Sorted within partition**: `added_date DESC` gives newest-first ordering for free
- **Efficient pagination**: Query today's bucket, then yesterday's, etc.

## Why Not Just Use the `videos` Table?

The `videos` table uses `videoid` as partition key — great for single-video lookups but terrible for "give me the latest N videos." A full table scan would be required. The `latest_videos` table is a **denormalized copy** optimized for this specific query pattern.

**In KillrVideo**: When a video is submitted, it's written to both `videos` (for lookups) and `latest_videos` (for the feed). This dual-write is a classic Cassandra data modeling pattern.
