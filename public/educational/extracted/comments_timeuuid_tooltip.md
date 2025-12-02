# Comment Ordering with TimeUUID

Cassandra uses **TimeUUID** for comments to guarantee chronological ordering with uniqueness. Each TimeUUID contains both a timestamp and a unique identifier, ensuring no two comments can have the same ID even when created simultaneously.

## How It Works

Comments are stored with a composite primary key where `videoid` is the partition key and `commentid` (TimeUUID) is the clustering column:

```cql
CREATE TABLE comments_by_video (
    videoid uuid,
    commentid timeuuid,  -- TimeUUID = timestamp + uniqueness
    userid uuid,
    comment text,
    ...
    PRIMARY KEY (videoid, commentid)
) WITH CLUSTERING ORDER BY (commentid DESC);
```

**Benefits**:
- Comments sorted by time automatically (newest first with DESC order)
- No duplicate IDs even with concurrent writes from multiple users
- Efficient pagination using `commentid` as cursor
- Single partition per video for fast retrieval of all comments

**In KillrVideo**: Each video's comments live in one partition, ordered by TimeUUID for instant chronological display.
