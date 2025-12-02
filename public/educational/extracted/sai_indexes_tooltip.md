# Storage-Attached Indexes (SAI) for Tags

SAI indexes enable efficient filtering on collection types like tags without creating separate denormalized tables.

## Querying Tags with SAI

**Without SAI**: You'd need a separate `videos_by_tag` table with duplicated data for every tag-video combination.

**With SAI on Collections**:
```cql
CREATE INDEX videos_tags_idx ON videos(tags)
USING 'StorageAttachedIndex';

-- Query videos containing a specific tag:
SELECT * FROM videos WHERE tags CONTAINS 'cassandra';
```

**Benefits**:
- Query inside `set<text>` and other collection types directly
- No data duplication or sync issues between tables
- Add filters on multiple columns in a single query
- Index stays in sync automatically with base table

**In KillrVideo**: Click any tag to filter videos - powered by SAI on the `tags` collection column.
