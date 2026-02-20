# Video Playback Stats: Multi-Counter Table

Video statistics use a **dedicated counter table** with four independent counters — each atomically incremented across distributed nodes.

## The Data Model

```cql
CREATE TABLE video_playback_stats (
    videoid uuid PRIMARY KEY,
    views counter,            -- Total view count
    total_play_time counter,  -- Total seconds watched
    complete_views counter,   -- Full watch-throughs
    unique_viewers counter    -- Approximate unique viewers
);

-- Atomic increment (no read-before-write):
UPDATE video_playback_stats
SET views = views + 1,
    total_play_time = total_play_time + 245
WHERE videoid = 550e8400-...;
```

## Why a Separate Table?

Cassandra enforces a strict rule: **counter columns cannot coexist with regular columns**. That's why playback stats live in `video_playback_stats`, not in the `videos` table.

**Key properties**:
- **Atomic**: Increments never conflict, even across nodes
- **No read-before-write**: Unlike `UPDATE SET views = views + 1` in SQL, Cassandra counters don't require reading the current value first
- **Eventually consistent**: Counter values converge across replicas

**In KillrVideo**: Each video view atomically increments the `views` counter. The stats cards on the Creator Dashboard aggregate these counters across all of a creator's videos.
