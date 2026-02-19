# Ratings Data Model: Counters + Individual Records

Video ratings use **two tables** — one for fast aggregate counts, another for individual user ratings with upsert semantics.

## The Two Tables

```cql
-- Aggregate counters (fast average calculation)
CREATE TABLE video_ratings (
    videoid uuid PRIMARY KEY,
    rating_counter counter,   -- Number of ratings
    rating_total counter      -- Sum of all star values
);

-- Individual ratings (one per user per video)
CREATE TABLE video_ratings_by_user (
    videoid uuid,
    userid uuid,
    rating int,
    rating_date timestamp,
    PRIMARY KEY (videoid, userid)
);
```

## Composite Primary Key & Upsert

`video_ratings_by_user` uses a **composite primary key** `(videoid, userid)` — this means each user can only have one rating per video. Re-rating the same video **upserts** (overwrites) automatically:

```cql
-- First rating or update — same CQL either way:
INSERT INTO video_ratings_by_user (videoid, userid, rating, rating_date)
VALUES (?, ?, 4, '2025-10-31T10:00:00Z');
```

Cassandra's INSERT is always an upsert when the full primary key matches — no need for `INSERT ... ON CONFLICT` like SQL.

**In KillrVideo**: Submitting a rating writes to both tables. The counter table gives instant averages; the per-user table prevents duplicate votes and lets users see their own rating.
