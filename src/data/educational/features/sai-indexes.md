# Storage-Attached Indexes (SAI)

Storage-Attached Indexes are a revolutionary feature in Cassandra/Astra DB that eliminates the need for complex denormalized table structures.

## What Problem Does SAI Solve?

In Cassandra 3.x, if you wanted to query videos by tag, you needed a separate denormalized table like `videos_by_tag`. This approach required:

- **Multiple writes** on every insert (videos table + videos_by_tag table)
- **Complex consistency** management across tables
- **More storage** for duplicated data
- **Application logic** to keep tables in sync

With hundreds of videos and dozens of tags, this could mean managing multiple denormalized tables just to support different query patterns.

## How SAI Works

SAI attaches indexes directly to the storage layer, enabling efficient filtering without denormalization. You create a single index:

```cql
CREATE INDEX videos_tags_idx ON videos(tags)
USING 'StorageAttachedIndex';
```

Now you can query the primary table directly:

```cql
SELECT * FROM videos
WHERE tags CONTAINS 'cassandra'
LIMIT 10;
```

**No separate table needed!** SAI handles the indexing automatically.

## SAI in KillrVideo

The KillrVideo `videos` table uses multiple SAI indexes for flexible querying:

- **`videos_tags_idx`** - Find videos by tag (e.g., `WHERE tags CONTAINS 'tutorial'`)
- **`videos_name_idx`** - Text search on video titles
- **`videos_userid_idx`** - All videos by a specific user (replaces `user_videos` table)
- **`videos_added_date_idx`** - Query by date range (supports `latest_videos` queries)
- **`videos_category_idx`** - Filter by category (music, education, gaming, etc.)
- **`videos_content_rating_idx`** - Filter by rating (G, PG, PG-13, R)
- **`videos_language_idx`** - Filter by language
- **`videos_content_features_idx`** - **Vector similarity search** (COSINE distance)

### Multiple Index Queries

SAI allows combining multiple filters efficiently:

```cql
SELECT * FROM videos
WHERE category = 'education'
  AND content_rating = 'G'
  AND tags CONTAINS 'cassandra'
LIMIT 20;
```

This query uses three SAI indexes simultaneously without requiring a denormalized table for this specific combination.

## Migration Impact

Migrating from Cassandra 3.x to Astra DB with SAI:

**Before (3.x):**
- 1 primary table (`videos`)
- 5+ denormalized tables (`videos_by_tag`, `videos_by_user`, `videos_by_category`, etc.)
- Complex application code for multi-table writes

**After (Astra with SAI):**
- 1 primary table (`videos`)
- 8 SAI indexes
- Simple application code - single table writes

**Result:** 5x fewer tables, simpler architecture, easier maintenance.

## Performance Characteristics

- **Write performance**: Slightly higher latency due to index maintenance, but eliminates multi-table writes
- **Read performance**: Optimized for filtered queries, comparable to denormalized tables
- **Storage**: Indexes add overhead, but less than full denormalization
- **Flexibility**: Add new indexes without schema changes to application code

## Learn More

- [Astra DB SAI Documentation](https://docs.datastax.com/en/astra-serverless/docs/develop/dev-with-sai.html)
- [SAI Query Examples](https://docs.datastax.com/en/astra-serverless/docs/develop/dev-with-sai.html#_query_examples)
- [Migration Guide: 3.x to 5.0](../../../../../../../killrvideo-data/migrating/Migrating%20from%203.x%20to%205.0.md)

---

## Tag Autocomplete {#autocomplete}

The tag autocomplete feature uses SAI's collection indexing to provide instant suggestions as you type.

### How It Works

When you start typing a tag, the application queries:

```cql
SELECT DISTINCT tag FROM tags
WHERE tag >= 'cas'
  AND tag < 'cat'
LIMIT 10;
```

The `tags` table has an SAI index on the `tag` column, enabling fast prefix matching without scanning the entire table.

### Why It's Fast

- **SAI indexes are sorted** - Prefix queries are efficient (like a B-tree)
- **No full table scan** - Only relevant partitions are accessed
- **Low latency** - Typically < 10ms for autocomplete queries
- **Scalable** - Performance doesn't degrade with millions of tags

### Alternative Approaches

Before SAI, you might have used:
- **Client-side filtering** - Load all tags into memory (doesn't scale)
- **Separate search service** - Elasticsearch/Solr (adds complexity)
- **Prefix partitioning** - Denormalized table by first letter (limited flexibility)

SAI provides the best of all worlds: fast, scalable, simple.
