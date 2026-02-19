# Denormalization: Same Data, Different Partition Key

Comments are stored in **two tables** — same data, organized for different queries. This is the core Cassandra data modeling pattern.

## Two Tables, Two Query Patterns

```cql
-- "Show comments on this video" (partition by video)
CREATE TABLE comments (
    videoid uuid,
    commentid timeuuid,
    comment text, userid uuid,
    PRIMARY KEY (videoid, commentid)
) WITH CLUSTERING ORDER BY (commentid DESC);

-- "Show all comments by this user" (partition by user)
CREATE TABLE comments_by_user (
    userid uuid,
    commentid timeuuid,
    comment text, videoid uuid,
    PRIMARY KEY (userid, commentid)
) WITH CLUSTERING ORDER BY (commentid DESC);
```

**Why duplicate the data?**
- Cassandra has **no JOINs** — you can't query `comments` by `userid` efficiently
- Each table is optimized for exactly one access pattern
- Both use `commentid DESC` for newest-first ordering

## The Trade-off

- **Write cost**: Every comment is written twice (one to each table)
- **Read benefit**: Both queries are single-partition reads — the fastest operation Cassandra offers

**In KillrVideo**: Posting a comment writes to both tables. The video page reads from `comments`, while a user's profile page reads from `comments_by_user`.
