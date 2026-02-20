# Time-Series Data for Trending

Trending videos are computed from the `video_activity` table — a time-series that records every view, partitioned by day.

## The Data Model

```cql
CREATE TABLE video_activity (
    videoid uuid,
    day date,                -- Partition key: one partition per day
    watch_time timeuuid,     -- Clustering column: time-ordered
    PRIMARY KEY (day, watch_time)
) WITH CLUSTERING ORDER BY (watch_time DESC);
```

**How trending works**:
1. Every video view writes a row to `video_activity` for that day
2. The trending query reads a day's partition and aggregates view counts per video
3. Time period selection (24h, 7 days, 30 days) determines how many day-partitions to scan

## Why This Design?

- **Bounded partitions**: Each day's activity is in its own partition, preventing unbounded growth
- **Natural time windowing**: "Past 7 days" = read 7 partitions
- **TimeUUID clustering**: Preserves exact ordering within each day

**In KillrVideo**: The trending page queries `video_activity` for the selected time window, counts views per video, and ranks them — all from time-bucketed partitions.
