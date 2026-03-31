# Developer Experience Panel — Technical Specification

## Overview

The Developer Experience Panel (dev panel) is the signature feature of the KillrVideo UI/UX overhaul. Its purpose is to make the invisible visible: every time a user interacts with the UI — loading a video, posting a comment, submitting a rating — the dev panel surfaces exactly what is happening at the database layer.

KillrVideo exists to teach Apache Cassandra and DataStax Astra DB through a working, realistic application. Without the dev panel, a developer browsing the site sees a polished video platform and learns nothing about the underlying data model. With the dev panel open, every click becomes a lesson: which table was queried, what the CQL looks like, how the same operation maps to the DataStax Data API, and how to write that query in Python, Java, Node.js, or Rust using the official drivers.

The dev panel bridges the gap between:

> "I clicked Play on a video"

and:

> "This CQL query ran against the `videos_by_id` table using `video_id` as the partition key, and here is how to write that in Java with the DataStax Java driver."

All content in the dev panel is **static and hardcoded** in the frontend. There are no additional API calls. The educational content is versioned in git alongside the application code.

---

## Panel Structure

The dev panel occupies a collapsible drawer anchored to the bottom of the viewport. It renders on top of page content when expanded and can be toggled via a persistent tab handle. On desktop it defaults to a 320px tall expanded state. On mobile it is collapsed by default and expands to fill 60% of viewport height.

```
┌─────────────────────────────────────────────────────────────────┐
│  Query Metadata Bar                                             │
│  [ READ ] [ GET /api/v1/videos/:id ] [ ~3ms ] [ useApi.ts:42 ] │
├─────────────────────────────────────────────────────────────────┤
│  [ CQL ]  [ Data API ]                                          │
│                                                                 │
│  SELECT * FROM videos WHERE video_id = ?                        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Schema: videos_by_id                                           │
│  video_id      UUID          [PK]                               │
│  added_date    TIMESTAMP     [CK ↓]                             │
│  title         TEXT                                             │
│  ...                                                            │
├─────────────────────────────────────────────────────────────────┤
│  [ Python ] [ Java ] [ Node.js ] [ Rust ]                      │
│                                                                 │
│  row = session.execute(                                         │
│      "SELECT * FROM videos WHERE video_id = %s",               │
│      [video_id]                                                 │
│  ).one()                                                        │
└─────────────────────────────────────────────────────────────────┘
```

The four primary regions are described in detail below.

---

## Query Display Area

The query display area occupies the upper-center portion of the panel. It shows the database operation that was triggered by the most recent UI interaction. The content switches automatically as the user navigates — fetching the home page swaps in the `latest_videos` query, opening a video page swaps in the `videos_by_id` query, and so on.

The display area is a syntax-highlighted code block. CQL syntax highlighting uses Cassandra-appropriate token coloring (keywords in purple, literals in teal, identifiers in white). Data API JSON uses standard JSON highlighting.

Bind variable placeholders in CQL are rendered as `?` and annotated with a tooltip explaining that these map to prepared statement parameters, preventing injection and enabling server-side query plan caching.

---

## CQL / Data API Toggle

A two-segment toggle control switches the query display between two representations of the same operation.

### CQL Mode

Displays the raw CQL statement as it would be sent to Cassandra or Astra DB using the binary native protocol. Bind variables are shown as `?`. This is what the server-side backend constructs when handling the API request.

```sql
SELECT * FROM videos WHERE video_id = ?
```

```sql
SELECT * FROM latest_videos
WHERE yyyymmdd = ?
ORDER BY added_date DESC
LIMIT 10
```

```sql
SELECT * FROM comments_by_video
WHERE video_id = ?
ORDER BY comment_timestamp DESC
```

```sql
UPDATE video_ratings
SET rating_total = rating_total + ?,
    rating_count = rating_count + 1
WHERE video_id = ?
```

### Data API Mode

Displays the equivalent operation expressed as a Data API JSON request body. The Data API is a REST/JSON interface to Astra DB that does not require CQL knowledge, making it accessible to developers from non-JVM ecosystems.

**Video Fetch:**

```json
db.collection("videos").findOne({ "_id": videoId })
```

Full request body form:

```json
{
  "findOne": {
    "filter": { "_id": "550e8400-e29b-41d4-a716-446655440000" }
  }
}
```

**Latest Videos:**

```json
db.collection("videos").find({}).sort({ "addedDate": -1 }).limit(10)
```

Full request body form:

```json
{
  "find": {
    "filter": {},
    "sort": { "addedDate": -1 },
    "options": { "limit": 10 }
  }
}
```

**Comments:**

```json
db.collection("comments").find({ "videoId": videoId }).sort({ "timestamp": -1 })
```

Full request body form:

```json
{
  "find": {
    "filter": { "videoId": "550e8400-e29b-41d4-a716-446655440000" },
    "sort": { "timestamp": -1 }
  }
}
```

**Rating:**

```json
db.collection("ratings").updateOne(
  { "_id": videoId },
  { "$inc": { "total": rating, "count": 1 } }
)
```

Full request body form:

```json
{
  "updateOne": {
    "filter": { "_id": "550e8400-e29b-41d4-a716-446655440000" },
    "update": { "$inc": { "total": 4, "count": 1 } }
  }
}
```

The toggle persists across navigation events. If a developer sets the panel to Data API mode and then navigates to another page, the new query loads in Data API mode.

---

## Language Switcher

Below the query display, a tab bar offers four language choices: **Python**, **Java**, **Node.js**, and **Rust**. Each tab shows idiomatic driver code for the current query using the relevant official DataStax or community driver.

The code shown is not a minimal snippet — it is production-realistic, including import statements, connection setup (abbreviated with a comment), error handling patterns where they are idiomatic to the language, and the actual query execution call.

### Python

Uses the `cassandra-driver` Python package (DataStax maintained).

```python
from cassandra.cluster import Cluster
from cassandra.auth import PlainTextAuthProvider

# Connection setup omitted — see docs/connection-setup.md
session = cluster.connect("killrvideo")

prepared = session.prepare(
    "SELECT * FROM videos WHERE video_id = %s"
)
row = session.execute(prepared, [video_id]).one()

if row:
    print(row.title, row.description)
```

### Java

Uses the DataStax Java Driver 4.x with the fluent query builder.

```java
import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.cql.PreparedStatement;
import com.datastax.oss.driver.api.core.cql.Row;

// Session obtained from application context
PreparedStatement prepared = session.prepare(
    "SELECT * FROM videos WHERE video_id = ?"
);

Row row = session.execute(
    prepared.bind(videoId)
).one();

if (row != null) {
    String title = row.getString("title");
}
```

### Node.js

Uses the `cassandra-driver` npm package (DataStax maintained).

```javascript
const cassandra = require('cassandra-driver');

// Client obtained from application context
const query = 'SELECT * FROM videos WHERE video_id = ?';
const params = [videoId];

const result = await client.execute(query, params, { prepare: true });
const row = result.first();

if (row) {
  console.log(row['title'], row['description']);
}
```

### Rust

Uses the `scylla` crate, which supports Cassandra-compatible databases including Astra DB via the native protocol.

```rust
use scylla::Session;
use uuid::Uuid;

// Session obtained from application state
let result = session
    .query(
        "SELECT title, description FROM videos WHERE video_id = ?",
        (video_id,),
    )
    .await?;

if let Some(row) = result.rows_typed::<(String, String)>()?.next() {
    let (title, description) = row?;
    println!("{title}: {description}");
}
```

The selected language tab persists in `localStorage` so returning developers do not have to re-select their preferred language on each visit.

---

## Schema Block

The schema block renders a visual table schema below the query display. It shows every column in the relevant table with its CQL data type and a role badge indicating how the column participates in the primary key.

### Badge Definitions

| Badge | Style | Meaning |
|---|---|---|
| `[PK]` | Purple filled | Partition key column — determines which node holds the data |
| `[CK ↓]` | Teal filled | Clustering column, descending sort order |
| `[CK ↑]` | Teal filled | Clustering column, ascending sort order |
| (none) | Gray outlined | Regular (non-key) column |

A tooltip on each badge explains the concept in one sentence. For example, hovering `[PK]` shows: "The partition key determines which Cassandra node stores this row. All rows with the same partition key are stored together."

### Schema: `videos_by_id`

```
video_id        UUID          [PK]
added_date      TIMESTAMP     [CK ↓]
title           TEXT
description     TEXT
user_id         UUID
tags            SET<TEXT>
thumbnail_url   TEXT
```

### Schema: `latest_videos`

```
yyyymmdd        TEXT          [PK]
added_date      TIMESTAMP     [CK ↓]
video_id        UUID          [CK ↓]
user_id         UUID
title           TEXT
preview_image   TEXT
```

Note: `yyyymmdd` is a date bucket (e.g., `"20240315"`). This is a Cassandra data modeling pattern — partitioning by day prevents unbounded partition growth while keeping chronological queries efficient.

### Schema: `comments_by_video`

```
video_id          UUID          [PK]
comment_timestamp TIMEUUID      [CK ↓]
comment_id        UUID
user_id           UUID
comment           TEXT
```

Note: `TIMEUUID` encodes both time and uniqueness in a single value, enabling time-ordered clustering without a separate timestamp column.

### Schema: `video_ratings`

```
video_id       UUID          [PK]
rating_counter COUNTER
rating_total   COUNTER
```

Note: `COUNTER` is a special Cassandra type supporting atomic increment/decrement operations without read-before-write. Counter tables cannot contain non-counter, non-key columns.

---

## Query Metadata Bar

The metadata bar is a compact strip at the top of the panel. It provides at-a-glance context for the current query without requiring the developer to read the full statement.

### Components

**Type Badge**

A pill badge indicating the operation category:

| Value | Color | CQL operations |
|---|---|---|
| `READ` | Teal | `SELECT` |
| `WRITE` | Amber | `INSERT`, `UPDATE` |
| `DELETE` | Red | `DELETE` |

**Endpoint Badge**

The REST API endpoint that triggered this database operation. Format: `METHOD /api/v1/path/:param`.

Examples:
- `GET /api/v1/videos/:id`
- `GET /api/v1/videos`
- `GET /api/v1/videos/:id/comments`
- `POST /api/v1/videos/:id/ratings`

This badge links to the relevant section of the OpenAPI spec (`docs/killrvideo_openapi.yaml`) in a new tab.

**Latency Display**

A static, representative latency value showing what a typical Cassandra single-partition read looks like in production. The value is not measured — it is educational, set to a realistic range.

| Operation type | Representative latency |
|---|---|
| Single-partition read | `~3ms` |
| Full-table scan / multi-partition | `~12ms` |
| Counter update | `~4ms` |

A tooltip explains: "This is a representative value, not a live measurement. Single-partition reads in Cassandra typically complete in 1–5ms on co-located infrastructure."

**Source File Link**

The frontend source file and line number where the React Query hook for this operation is defined. Format: `src/hooks/useApi.ts:42`. Rendered as a `<code>` element with copy-to-clipboard on click.

This allows a developer to immediately navigate to the hook implementation and understand how the frontend constructs the API request.

---

## Sample Data: Complete Entries

The following are the four complete dev panel entries shipped with the initial implementation. Each entry contains all data needed to populate every panel region.

### Entry 1: Video Fetch

Triggered when: a user opens a video watch page (`/watch/:videoId`).

**Metadata:**
- Type: `READ`
- Endpoint: `GET /api/v1/videos/:id`
- Latency: `~3ms`
- Source file: `src/hooks/useApi.ts:42`

**CQL:**
```sql
SELECT video_id, title, description, user_id, tags, thumbnail_url, added_date
FROM videos
WHERE video_id = ?
```

**Data API:**
```json
{
  "findOne": {
    "filter": { "_id": "550e8400-e29b-41d4-a716-446655440000" }
  }
}
```

**Table:** `videos_by_id`

---

### Entry 2: Latest Videos

Triggered when: the home page loads or the user navigates to the video browse page.

**Metadata:**
- Type: `READ`
- Endpoint: `GET /api/v1/videos`
- Latency: `~12ms`
- Source file: `src/hooks/useApi.ts:67`

**CQL:**
```sql
SELECT video_id, title, preview_image, user_id, added_date
FROM latest_videos
WHERE yyyymmdd = ?
ORDER BY added_date DESC
LIMIT 10
```

**Data API:**
```json
{
  "find": {
    "filter": {},
    "sort": { "addedDate": -1 },
    "options": { "limit": 10 }
  }
}
```

**Table:** `latest_videos`

---

### Entry 3: Comments

Triggered when: a video watch page loads and fetches the comment list.

**Metadata:**
- Type: `READ`
- Endpoint: `GET /api/v1/videos/:id/comments`
- Latency: `~3ms`
- Source file: `src/hooks/useApi.ts:124`

**CQL:**
```sql
SELECT comment_id, user_id, comment, comment_timestamp
FROM comments_by_video
WHERE video_id = ?
ORDER BY comment_timestamp DESC
```

**Data API:**
```json
{
  "find": {
    "filter": { "videoId": "550e8400-e29b-41d4-a716-446655440000" },
    "sort": { "timestamp": -1 }
  }
}
```

**Table:** `comments_by_video`

---

### Entry 4: Rating

Triggered when: a logged-in user submits a star rating on a video.

**Metadata:**
- Type: `WRITE`
- Endpoint: `POST /api/v1/videos/:id/ratings`
- Latency: `~4ms`
- Source file: `src/hooks/useApi.ts:198`

**CQL:**
```sql
UPDATE video_ratings
SET rating_total = rating_total + ?,
    rating_count = rating_count + 1
WHERE video_id = ?
```

**Data API:**
```json
{
  "updateOne": {
    "filter": { "_id": "550e8400-e29b-41d4-a716-446655440000" },
    "update": { "$inc": { "total": 4, "count": 1 } }
  }
}
```

**Table:** `video_ratings`

---

## Static Data Approach

All dev panel content is hardcoded in the frontend as typed TypeScript objects. There are no API calls to fetch educational content, and the panel does not instrument live backend queries.

### Rationale

**Reliable.** The dev panel works regardless of backend health. A developer running the frontend against a mock or offline backend still gets the full educational experience.

**Versioned.** Content changes are tracked in git. Adding a new query entry, correcting a CQL statement, or updating a source file line number produces a diff that can be reviewed like any code change.

**Fast.** Zero network latency for panel content. The panel renders synchronously from in-memory data.

**AI-friendly.** Structured TypeScript objects with consistent shapes are straightforward to generate, validate, and modify with AI tooling.

**Deterministic.** The same UI interaction always shows the same query. There is no race condition between the panel update and a live query completing.

### Content Mapping

UI interactions map to dev panel entries via a lookup table keyed on route pattern and query type. The mapping is defined in `src/lib/devPanel.ts`:

| Route | Interaction | Entry key |
|---|---|---|
| `/` | Page load | `latest_videos` |
| `/watch/:id` | Page load | `video_fetch` |
| `/watch/:id` | Comments section visible | `comments` |
| `/watch/:id` | User submits rating | `rating` |

When a user navigates, the current route is matched against this table and the corresponding entry is loaded into the panel. If no entry matches, the panel shows a placeholder state: "Interact with the app to see a database query."

---

## TypeScript Type Definitions

All dev panel data conforms to these interfaces, defined in `src/types/devPanel.ts`.

```typescript
/** The two display modes for the query area. */
export type QueryMode = "cql" | "dataapi";

/** The language options for the code snippet tab bar. */
export type LanguageName = "python" | "java" | "nodejs" | "rust";

/** The operation category shown in the type badge. */
export type QueryType = "READ" | "WRITE" | "DELETE";

/** The role a column plays in the Cassandra primary key. */
export type KeyType = "partition" | "clustering" | "none";

/** Sort direction for clustering columns. */
export type SortDirection = "asc" | "desc";

/**
 * A single database operation: the CQL statement, its Data API equivalent,
 * and the metadata shown in the metadata bar.
 */
export interface DevPanelQuery {
  /** CQL statement with bind variable placeholders shown as ?. */
  cql: string;

  /**
   * Equivalent Data API operation as a JavaScript method chain string,
   * suitable for display alongside the full JSON body.
   */
  dataApiMethodChain: string;

  /** Full Data API JSON request body. */
  dataApiBody: Record<string, unknown>;

  /** READ, WRITE, or DELETE — controls the type badge color. */
  type: QueryType;

  /** REST endpoint that triggers this database operation. */
  endpoint: string;

  /**
   * Representative latency string (e.g., "~3ms").
   * Static educational value, not a live measurement.
   */
  latency: string;

  /**
   * Frontend source file and line where the React Query hook
   * for this operation is defined. Format: "src/hooks/useApi.ts:42".
   */
  sourceFile: string;
}

/**
 * A single column in a Cassandra table schema.
 */
export interface SchemaColumn {
  /** Column name as it appears in CQL. */
  name: string;

  /** CQL data type string (e.g., "UUID", "TEXT", "SET<TEXT>"). */
  type: string;

  /** Role of this column in the primary key. */
  keyType: KeyType;

  /**
   * Sort direction for clustering columns.
   * Undefined when keyType is not "clustering".
   */
  sortDirection?: SortDirection;
}

/**
 * The full schema for a Cassandra table, as shown in the schema block.
 */
export interface TableSchema {
  /** CQL table name. */
  tableName: string;

  /** Ordered list of columns. Partition keys first, then clustering, then regular. */
  columns: SchemaColumn[];

  /**
   * One or two sentence description of why this table is modeled this way.
   * Shown as a callout below the column list.
   */
  description: string;
}

/**
 * Idiomatic driver code for one language.
 */
export interface LanguageExample {
  language: LanguageName;

  /**
   * Full code snippet including imports and connection context comment.
   * Shown verbatim in the syntax-highlighted code block.
   */
  code: string;
}

/**
 * A complete dev panel entry combining query, schema, and language examples.
 * One entry corresponds to one UI interaction (e.g., fetching a video).
 */
export interface DevPanelEntry {
  /**
   * Stable identifier used as the lookup key in the route-to-entry map.
   * Snake_case string (e.g., "video_fetch", "latest_videos").
   */
  key: string;

  /** Human-readable label shown as the panel title (e.g., "Fetch Video"). */
  label: string;

  /** The database operation details and metadata. */
  query: DevPanelQuery;

  /** The table schema displayed in the schema block. */
  schema: TableSchema;

  /** One example per supported language. Must include all four LanguageName values. */
  languageExamples: LanguageExample[];
}

/**
 * The full static dataset: all entries and the route-to-key mapping.
 * Exported from src/lib/devPanel.ts.
 */
export interface DevPanelDataset {
  entries: Record<string, DevPanelEntry>;
  routeMap: Array<{
    routePattern: string;
    interaction: string;
    entryKey: string;
  }>;
}
```

---

## Implementation Notes

### File Layout

```
src/
  types/
    devPanel.ts              # Type definitions (above)
  lib/
    devPanel.ts              # Static data + route mapping
  components/
    dev-panel/
      DevPanel.tsx           # Root panel shell, collapse logic
      QueryDisplay.tsx       # Syntax-highlighted code block + CQL/DataAPI toggle
      SchemaBlock.tsx        # Column list with badge rendering
      LanguageSwitcher.tsx   # Tab bar + code block per language
      MetadataBar.tsx        # Type badge, endpoint, latency, source link
      DevPanelToggle.tsx     # Persistent tab handle at bottom of viewport
```

### Collapse Behavior

The panel persists its open/closed state in `localStorage` under the key `devPanel.open`. Default is `false` (collapsed). On first visit a subtle animation draws attention to the toggle handle after 2 seconds.

### Accessibility

- Panel toggle is keyboard accessible (`Tab` to focus, `Enter`/`Space` to toggle)
- Code blocks include `aria-label` describing the content (e.g., "CQL query for video fetch")
- Badge tooltips are implemented with `aria-describedby` pointing to hidden description elements
- Color is never the sole indicator of meaning — type badges include the text label alongside color

### Responsive Behavior

| Viewport | Panel height (expanded) | Default state |
|---|---|---|
| Desktop (≥1024px) | 320px | Open |
| Tablet (768–1023px) | 280px | Closed |
| Mobile (<768px) | 60vh | Closed |

On mobile, the panel renders as a bottom sheet with a drag handle, consistent with the shadcn/ui Sheet primitive.
