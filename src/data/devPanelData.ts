import type { DevPanelDataset } from "@/types/devPanel";

const entries = {
    latest_videos: {
      key: "latest_videos",
      label: "Latest Videos Query",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/videos/latest",

        sourceFile: "src/hooks/useApi.ts:67",
        cql: `SELECT videoid, name, preview_image_location, userid, added_date
FROM latest_videos
WHERE day = ?
ORDER BY added_date DESC
LIMIT 10`,
        dataApiMethodChain: `db.collection("videos").find({}).sort({ "added_date": -1 }).limit(10)`,
        dataApiBody: {
          find: {
            filter: {},
            sort: { added_date: -1 },
            options: { limit: 10 },
          },
        },
        tableApiMethodChain: `table("videos").find({}).sort({ "added_date": -1 }).limit(10)`,
        tableApiBody: {
          find: {
            filter: {},
            sort: { added_date: -1 },
            options: { limit: 10 },
          },
        },
      },
      schema: {
        tableName: "latest_videos",
        columns: [
          { name: "day", type: "DATE", keyType: "partition" },
          { name: "added_date", type: "TIMESTAMP", keyType: "clustering", sortDirection: "desc" },
          { name: "videoid", type: "UUID", keyType: "clustering", sortDirection: "asc" },
          { name: "userid", type: "UUID", keyType: "none" },
          { name: "name", type: "TEXT", keyType: "none" },
          { name: "preview_image_location", type: "TEXT", keyType: "none" },
        ],
        description:
          "Partitioned by date bucket (day) to prevent unbounded partition growth. Clustering by added_date DESC returns newest videos first within each day.",
      },
      languageExamples: [
        {
          language: "python",
          code: `from cassandra.cluster import Cluster

session = cluster.connect("killrvideo")

prepared = session.prepare(
    "SELECT * FROM latest_videos WHERE day = ? "
    "ORDER BY added_date DESC LIMIT 10"
)
rows = session.execute(prepared, [date_bucket])

for row in rows:
    print(row.name, row.preview_image_location)`,
        },
        {
          language: "java",
          code: `import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.cql.*;

PreparedStatement prepared = session.prepare(
    "SELECT * FROM latest_videos WHERE day = ? "
  + "ORDER BY added_date DESC LIMIT 10"
);

ResultSet rs = session.execute(prepared.bind(dateBucket));

for (Row row : rs) {
    System.out.println(row.getString("name"));
}`,
        },
        {
          language: "nodejs",
          code: `const cassandra = require('cassandra-driver');

const query = \`SELECT * FROM latest_videos
  WHERE day = ? ORDER BY added_date DESC LIMIT 10\`;

const result = await client.execute(query, [dateBucket], { prepare: true });

for (const row of result.rows) {
  console.log(row['name'], row['preview_image_location']);
}`,
        },
        {
          language: "csharp",
          code: `using Cassandra;

var ps = session.Prepare(
    "SELECT * FROM latest_videos WHERE day = ? "
  + "ORDER BY added_date DESC LIMIT 10");

var rs = session.Execute(ps.Bind(dateBucket));

foreach (var row in rs)
{
    Console.WriteLine(row.GetValue<string>("name"));
}`,
        },
        {
          language: "go",
          code: `import "github.com/gocql/gocql"

query := session.Query(
    "SELECT * FROM latest_videos WHERE day = ? ORDER BY added_date DESC LIMIT 10",
    dateBucket,
)

iter := query.Iter()
var name, previewImage string
for iter.Scan(&name, &previewImage) {
    fmt.Println(name, previewImage)
}`,
        },
      ],
    },

    video_fetch: {
      key: "video_fetch",
      label: "Video Fetch",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/videos/id/{video_id}",
        sourceFile: "src/hooks/useApi.ts:42",
        cql: `SELECT videoid, name, description, userid, tags, preview_image_location, added_date
FROM videos
WHERE videoid = ?`,
        dataApiMethodChain: `db.collection("videos").findOne({ "videoid": videoId })`,
        dataApiBody: {
          findOne: {
            filter: { videoid: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        tableApiMethodChain: `table("videos").findOne({ "videoid": videoId })`,
        tableApiBody: {
          findOne: {
            filter: { videoid: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
      },
      schema: {
        tableName: "videos",
        columns: [
          { name: "videoid", type: "UUID", keyType: "partition" },
          { name: "added_date", type: "TIMESTAMP", keyType: "none" },
          { name: "name", type: "TEXT", keyType: "none" },
          { name: "description", type: "TEXT", keyType: "none" },
          { name: "userid", type: "UUID", keyType: "none" },
          { name: "tags", type: "SET<TEXT>", keyType: "none" },
          { name: "preview_image_location", type: "TEXT", keyType: "none" },
        ],
        description:
          "Single-partition lookup by videoid. All video metadata denormalized into one table for single-read access. SAI indexes on tags, userid, and added_date enable flexible querying.",
      },
      languageExamples: [
        {
          language: "python",
          code: `from cassandra.cluster import Cluster

session = cluster.connect("killrvideo")

prepared = session.prepare(
    "SELECT * FROM videos WHERE videoid = ?"
)
row = session.execute(prepared, [video_id]).one()

if row:
    print(row.name, row.description)`,
        },
        {
          language: "java",
          code: `import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.cql.*;

PreparedStatement prepared = session.prepare(
    "SELECT * FROM videos WHERE videoid = ?"
);

Row row = session.execute(prepared.bind(videoId)).one();

if (row != null) {
    String title = row.getString("name");
}`,
        },
        {
          language: "nodejs",
          code: `const cassandra = require('cassandra-driver');

const query = 'SELECT * FROM videos WHERE videoid = ?';

const result = await client.execute(query, [videoId], { prepare: true });
const row = result.first();

if (row) {
  console.log(row['name'], row['description']);
}`,
        },
        {
          language: "csharp",
          code: `using Cassandra;

var ps = session.Prepare("SELECT * FROM videos WHERE videoid = ?");
var rs = session.Execute(ps.Bind(videoId));
var row = rs.FirstOrDefault();

if (row != null)
{
    Console.WriteLine(row.GetValue<string>("name"));
}`,
        },
        {
          language: "go",
          code: `import "github.com/gocql/gocql"

var name, description string
err := session.Query(
    "SELECT name, description FROM videos WHERE videoid = ?",
    videoId,
).Scan(&name, &description)

if err == nil {
    fmt.Println(name, description)
}`,
        },
      ],
    },

    video_submit: {
      key: "video_submit",
      label: "Submit Video",
      query: {
        type: "WRITE",
        endpoint: "POST /api/v1/videos",
        sourceFile: "src/hooks/useApi.ts:75",
        cql: `INSERT INTO videos (videoid, userid, name, description, tags, preview_image_location, added_date, status)
VALUES (?, ?, ?, ?, ?, ?, toTimestamp(now()), 'pending')

-- Also insert into latest_videos for time-series feed
INSERT INTO latest_videos (day, added_date, videoid, userid, name, preview_image_location)
VALUES (?, toTimestamp(now()), ?, ?, ?, ?)`,
        dataApiMethodChain: `db.collection("videos").insertOne({ videoid, userid, name, description, tags, added_date: new Date(), status: "pending" })`,
        dataApiBody: {
          insertOne: {
            document: {
              videoid: "generated-uuid",
              userid: "current-user-uuid",
              name: "Video Title",
              description: "Description",
              tags: ["tag1", "tag2"],
              status: "pending",
            },
          },
        },
        tableApiMethodChain: `table("videos").insertOne({ videoid, userid, name, description, tags, added_date: new Date(), status: "pending" })`,
        tableApiBody: {
          insertOne: {
            document: {
              videoid: "generated-uuid",
              userid: "current-user-uuid",
              name: "Video Title",
              description: "Description",
              tags: ["tag1", "tag2"],
              status: "pending",
            },
          },
        },
      },
      schema: {
        tableName: "videos",
        columns: [
          { name: "videoid", type: "UUID", keyType: "partition" },
          { name: "added_date", type: "TIMESTAMP", keyType: "none" },
          { name: "name", type: "TEXT", keyType: "none" },
          { name: "description", type: "TEXT", keyType: "none" },
          { name: "userid", type: "UUID", keyType: "none" },
          { name: "tags", type: "SET<TEXT>", keyType: "none" },
          { name: "preview_image_location", type: "TEXT", keyType: "none" },
          { name: "status", type: "TEXT", keyType: "none" },
        ],
        description:
          "New video row inserted with status 'pending'. YouTube metadata (title, thumbnail) is resolved asynchronously. A corresponding row is written to latest_videos for the time-series feed.",
      },
      languageExamples: [
        {
          language: "python",
          code: `from cassandra.cluster import Cluster
import uuid

session = cluster.connect("killrvideo")
video_id = uuid.uuid4()

prepared = session.prepare(
    "INSERT INTO videos "
    "(videoid, userid, name, description, tags, added_date, status) "
    "VALUES (?, ?, ?, ?, ?, toTimestamp(now()), 'pending')"
)
session.execute(prepared, [video_id, user_id, name, desc, tags])`,
        },
        {
          language: "java",
          code: `UUID videoId = UUID.randomUUID();

PreparedStatement ps = session.prepare(
    "INSERT INTO videos "
    + "(videoid, userid, name, description, tags, added_date, status) "
    + "VALUES (?, ?, ?, ?, ?, toTimestamp(now()), 'pending')"
);
session.execute(ps.bind(videoId, userId, name, desc, tags));`,
        },
        {
          language: "nodejs",
          code: `const { v4: uuidv4 } = require('uuid');

const videoId = uuidv4();
const query = \`INSERT INTO videos
  (videoid, userid, name, description, tags, added_date, status)
  VALUES (?, ?, ?, ?, ?, toTimestamp(now()), 'pending')\`;

await client.execute(query, [videoId, userId, name, desc, tags],
  { prepare: true });`,
        },
        {
          language: "csharp",
          code: `var videoId = Guid.NewGuid();

var ps = session.Prepare(
    "INSERT INTO videos "
    + "(videoid, userid, name, description, tags, added_date, status) "
    + "VALUES (?, ?, ?, ?, ?, toTimestamp(now()), 'pending')");

session.Execute(ps.Bind(videoId, userId, name, desc, tags));`,
        },
        {
          language: "go",
          code: `videoId := gocql.TimeUUID()

err := session.Query(
    "INSERT INTO videos "+
        "(videoid, userid, name, description, tags, added_date, status) "+
        "VALUES (?, ?, ?, ?, ?, toTimestamp(now()), 'pending')",
    videoId, userId, name, desc, tags,
).Exec()`,
        },
      ],
    },

    video_update: {
      key: "video_update",
      label: "Update Video",
      query: {
        type: "WRITE",
        endpoint: "PUT /api/v1/videos/id/{video_id}",
        sourceFile: "src/hooks/useApi.ts:93",
        cql: `UPDATE videos
SET name = ?, description = ?, tags = ?
WHERE videoid = ?`,
        dataApiMethodChain: `db.collection("videos").findOneAndUpdate({ "videoid": videoId }, { "$set": { name, description, tags } })`,
        dataApiBody: {
          findOneAndUpdate: {
            filter: { videoid: "550e8400-e29b-41d4-a716-446655440000" },
            update: { "$set": { name: "New Title", description: "New desc", tags: ["tag1"] } },
          },
        },
        tableApiMethodChain: `table("videos").updateOne({ "videoid": videoId }, { "$set": { name, description, tags } })`,
        tableApiBody: {
          updateOne: {
            filter: { videoid: "550e8400-e29b-41d4-a716-446655440000" },
            update: { "$set": { name: "New Title", description: "New desc", tags: ["tag1"] } },
          },
        },
      },
      schema: {
        tableName: "videos",
        columns: [
          { name: "videoid", type: "UUID", keyType: "partition" },
          { name: "name", type: "TEXT", keyType: "none" },
          { name: "description", type: "TEXT", keyType: "none" },
          { name: "tags", type: "SET<TEXT>", keyType: "none" },
        ],
        description:
          "Updates mutable metadata fields on an existing video. The partition key (videoid) is used for a direct single-row update. Immutable fields like userid and added_date are not modified.",
      },
      languageExamples: [
        {
          language: "python",
          code: `prepared = session.prepare(
    "UPDATE videos SET name = ?, description = ?, tags = ? "
    "WHERE videoid = ?"
)
session.execute(prepared, [new_name, new_desc, new_tags, video_id])`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "UPDATE videos SET name = ?, description = ?, tags = ? "
    + "WHERE videoid = ?"
);
session.execute(ps.bind(newName, newDesc, newTags, videoId));`,
        },
        {
          language: "nodejs",
          code: `const query = \`UPDATE videos
  SET name = ?, description = ?, tags = ?
  WHERE videoid = ?\`;

await client.execute(query, [newName, newDesc, newTags, videoId],
  { prepare: true });`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare(
    "UPDATE videos SET name = ?, description = ?, tags = ? "
    + "WHERE videoid = ?");

session.Execute(ps.Bind(newName, newDesc, newTags, videoId));`,
        },
        {
          language: "go",
          code: `err := session.Query(
    "UPDATE videos SET name = ?, description = ?, tags = ? "+
        "WHERE videoid = ?",
    newName, newDesc, newTags, videoId,
).Exec()`,
        },
      ],
    },

    comments_by_video: {
      key: "comments_by_video",
      label: "Comments by Video",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/videos/{video_id}/comments",
        sourceFile: "src/hooks/useApi.ts:124",
        cql: `SELECT commentid, userid, comment, sentiment_score
FROM comments
WHERE videoid = ?
ORDER BY commentid DESC`,
        dataApiMethodChain: `db.collection("comments").find({ "videoid": videoId }).sort({ "commentid": -1 })`,
        dataApiBody: {
          find: {
            filter: { videoid: "550e8400-e29b-41d4-a716-446655440000" },
            sort: { commentid: -1 },
          },
        },
        tableApiMethodChain: `table("comments").find({ "videoid": videoId }).sort({ "commentid": -1 })`,
        tableApiBody: {
          find: {
            filter: { videoid: "550e8400-e29b-41d4-a716-446655440000" },
            sort: { commentid: -1 },
          },
        },
      },
      schema: {
        tableName: "comments",
        columns: [
          { name: "videoid", type: "UUID", keyType: "partition" },
          { name: "commentid", type: "TIMEUUID", keyType: "clustering", sortDirection: "desc" },
          { name: "userid", type: "UUID", keyType: "none" },
          { name: "comment", type: "TEXT", keyType: "none" },
          { name: "sentiment_score", type: "FLOAT", keyType: "none" },
        ],
        description:
          "TIMEUUID clustering column encodes both time and uniqueness, enabling time-ordered retrieval. Comments are denormalized per-video for single-partition reads. A parallel comments_by_user table enables user-centric queries.",
      },
      languageExamples: [
        {
          language: "python",
          code: `from cassandra.cluster import Cluster

session = cluster.connect("killrvideo")

prepared = session.prepare(
    "SELECT * FROM comments "
    "WHERE videoid = ? ORDER BY commentid DESC"
)
rows = session.execute(prepared, [video_id])

for row in rows:
    print(row.userid, row.comment)`,
        },
        {
          language: "java",
          code: `import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.cql.*;

PreparedStatement prepared = session.prepare(
    "SELECT * FROM comments "
  + "WHERE videoid = ? ORDER BY commentid DESC"
);

ResultSet rs = session.execute(prepared.bind(videoId));

for (Row row : rs) {
    System.out.println(row.getString("comment"));
}`,
        },
        {
          language: "nodejs",
          code: `const cassandra = require('cassandra-driver');

const query = \`SELECT * FROM comments
  WHERE videoid = ? ORDER BY commentid DESC\`;

const result = await client.execute(query, [videoId], { prepare: true });

for (const row of result.rows) {
  console.log(row['userid'], row['comment']);
}`,
        },
        {
          language: "csharp",
          code: `using Cassandra;

var ps = session.Prepare(
    "SELECT * FROM comments "
  + "WHERE videoid = ? ORDER BY commentid DESC");

var rs = session.Execute(ps.Bind(videoId));

foreach (var row in rs)
{
    Console.WriteLine(row.GetValue<string>("comment"));
}`,
        },
        {
          language: "go",
          code: `import "github.com/gocql/gocql"

iter := session.Query(
    "SELECT * FROM comments WHERE videoid = ? ORDER BY commentid DESC",
    videoId,
).Iter()

var userId gocql.UUID
var comment string
for iter.Scan(&userId, &comment) {
    fmt.Println(userId, comment)
}`,
        },
      ],
    },

    rating_submit: {
      key: "rating_submit",
      label: "Rating Submit",
      query: {
        type: "WRITE",
        endpoint: "POST /api/v1/videos/{video_id}/ratings",
        sourceFile: "src/hooks/useApi.ts:198",
        cql: `INSERT INTO video_ratings_by_user (videoid, userid, rating, rating_date)
VALUES (?, ?, ?, ?)

-- Then update summary counters:
UPDATE video_ratings
SET rating_counter = rating_counter + 1,
    rating_total = rating_total + ?
WHERE videoid = ?`,
        dataApiMethodChain: `db.collection("video_ratings_by_user").insertOne({ videoid, userid, rating, rating_date })`,
        dataApiBody: {
          insertOne: {
            document: {
              videoid: "550e8400-e29b-41d4-a716-446655440000",
              userid: "user-uuid",
              rating: 4,
              rating_date: "2025-10-31T10:30:00Z",
            },
          },
        },
        tableApiMethodChain: `table("video_ratings_by_user").insertOne({ videoid, userid, rating, rating_date })`,
        tableApiBody: {
          insertOne: {
            document: {
              videoid: "550e8400-e29b-41d4-a716-446655440000",
              userid: "user-uuid",
              rating: 4,
              rating_date: "2025-10-31T10:30:00Z",
            },
          },
        },
      },
      schema: {
        tableName: "video_ratings_by_user",
        columns: [
          { name: "videoid", type: "UUID", keyType: "partition" },
          { name: "userid", type: "UUID", keyType: "clustering", sortDirection: "asc" },
          { name: "rating", type: "INT", keyType: "none" },
          { name: "rating_date", type: "TIMESTAMP", keyType: "none" },
        ],
        description:
          "Individual user ratings with composite primary key (videoid, userid) enabling upsert semantics. A separate video_ratings counter table tracks aggregate totals for average calculation.",
      },
      languageExamples: [
        {
          language: "python",
          code: `from cassandra.cluster import Cluster

session = cluster.connect("killrvideo")

# Upsert individual rating
prepared = session.prepare(
    "INSERT INTO video_ratings_by_user "
    "(videoid, userid, rating, rating_date) "
    "VALUES (?, ?, ?, ?)"
)
session.execute(prepared, [video_id, user_id, rating, now])

# Update counter summary
counter_stmt = session.prepare(
    "UPDATE video_ratings "
    "SET rating_counter = rating_counter + 1, "
    "rating_total = rating_total + ? "
    "WHERE videoid = ?"
)
session.execute(counter_stmt, [rating, video_id])`,
        },
        {
          language: "java",
          code: `import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.cql.*;

PreparedStatement insertRating = session.prepare(
    "INSERT INTO video_ratings_by_user "
  + "(videoid, userid, rating, rating_date) "
  + "VALUES (?, ?, ?, ?)"
);
session.execute(insertRating.bind(videoId, userId, rating, now));

PreparedStatement updateCounter = session.prepare(
    "UPDATE video_ratings "
  + "SET rating_counter = rating_counter + 1, "
  + "rating_total = rating_total + ? "
  + "WHERE videoid = ?"
);
session.execute(updateCounter.bind(rating, videoId));`,
        },
        {
          language: "nodejs",
          code: `const cassandra = require('cassandra-driver');

// Upsert individual rating
await client.execute(
  'INSERT INTO video_ratings_by_user (videoid, userid, rating, rating_date) VALUES (?, ?, ?, ?)',
  [videoId, userId, rating, new Date()],
  { prepare: true }
);

// Update counter summary
await client.execute(
  'UPDATE video_ratings SET rating_counter = rating_counter + 1, rating_total = rating_total + ? WHERE videoid = ?',
  [rating, videoId],
  { prepare: true }
);`,
        },
        {
          language: "csharp",
          code: `using Cassandra;

var insertPs = session.Prepare(
    "INSERT INTO video_ratings_by_user "
  + "(videoid, userid, rating, rating_date) "
  + "VALUES (?, ?, ?, ?)");
session.Execute(insertPs.Bind(videoId, userId, rating, DateTime.UtcNow));

var counterPs = session.Prepare(
    "UPDATE video_ratings "
  + "SET rating_counter = rating_counter + 1, "
  + "rating_total = rating_total + ? "
  + "WHERE videoid = ?");
session.Execute(counterPs.Bind(rating, videoId));`,
        },
        {
          language: "go",
          code: `import "github.com/gocql/gocql"

// Upsert individual rating
err := session.Query(
    "INSERT INTO video_ratings_by_user (videoid, userid, rating, rating_date) VALUES (?, ?, ?, ?)",
    videoId, userId, rating, time.Now().UTC(),
).Exec()

// Update counter summary
err = session.Query(
    "UPDATE video_ratings SET rating_counter = rating_counter + 1, rating_total = rating_total + ? WHERE videoid = ?",
    rating, videoId,
).Exec()`,
        },
      ],
    },

    user_register: {
      key: "user_register",
      label: "User Registration",
      query: {
        type: "WRITE",
        endpoint: "POST /api/v1/users/register",
        sourceFile: "src/hooks/useApi.ts:310",
        cql: `-- Check if email exists
SELECT * FROM user_credentials WHERE email = ?

-- Insert user profile
INSERT INTO users (userid, firstname, lastname, email, created_date, account_status)
VALUES (?, ?, ?, ?, ?, 'active')

-- Insert credentials
INSERT INTO user_credentials (email, password, userid, account_locked)
VALUES (?, ?, ?, false)`,
        dataApiMethodChain: `db.collection("user_credentials").findOne({ "email": email })
db.collection("users").insertOne({ userid, firstname, ... })
db.collection("user_credentials").insertOne({ email, password, ... })`,
        dataApiBody: {
          insertOne: {
            document: {
              userid: "uuid-v4",
              firstname: "John",
              lastname: "Doe",
              email: "john@example.com",
              created_date: "2025-10-31T10:30:00Z",
              account_status: "active",
            },
          },
        },
        tableApiMethodChain: `table("user_credentials").findOne({ "email": email })
table("users").insertOne({ userid, firstname, ... })
table("user_credentials").insertOne({ email, password, ... })`,
        tableApiBody: {
          insertOne: {
            document: {
              userid: "uuid-v4",
              firstname: "John",
              lastname: "Doe",
              email: "john@example.com",
              created_date: "2025-10-31T10:30:00Z",
              account_status: "active",
            },
          },
        },
      },
      schema: {
        tableName: "users",
        columns: [
          { name: "userid", type: "UUID", keyType: "partition" },
          { name: "created_date", type: "TIMESTAMP", keyType: "none" },
          { name: "email", type: "TEXT", keyType: "none" },
          { name: "firstname", type: "TEXT", keyType: "none" },
          { name: "lastname", type: "TEXT", keyType: "none" },
          { name: "account_status", type: "TEXT", keyType: "none" },
        ],
        description:
          "User profiles partitioned by userid. SAI indexes on email and account_status enable flexible lookups. A separate user_credentials table stores hashed passwords keyed by email for authentication.",
      },
      languageExamples: [
        {
          language: "python",
          code: `from cassandra.cluster import Cluster
from uuid import uuid4
from datetime import datetime, timezone

session = cluster.connect("killrvideo")

# Check for existing email
cred_check = session.prepare(
    "SELECT * FROM user_credentials WHERE email = ?"
)
existing = session.execute(cred_check, [email]).one()

if existing:
    raise ValueError("Email already registered")

user_id = uuid4()
now = datetime.now(timezone.utc)

# Insert into users table
user_stmt = session.prepare(
    "INSERT INTO users (userid, firstname, lastname, email, created_date, account_status) "
    "VALUES (?, ?, ?, ?, ?, 'active')"
)
session.execute(user_stmt, [user_id, firstname, lastname, email, now])

# Insert credentials
cred_stmt = session.prepare(
    "INSERT INTO user_credentials (email, password, userid, account_locked) "
    "VALUES (?, ?, ?, false)"
)
session.execute(cred_stmt, [email, hashed_password, user_id])`,
        },
        {
          language: "java",
          code: `import com.datastax.oss.driver.api.core.CqlSession;
import com.datastax.oss.driver.api.core.cql.*;
import java.util.UUID;
import java.time.Instant;

// Check for existing email
PreparedStatement credCheck = session.prepare(
    "SELECT * FROM user_credentials WHERE email = ?"
);
Row existing = session.execute(credCheck.bind(email)).one();

if (existing != null) {
    throw new IllegalArgumentException("Email already registered");
}

UUID userId = UUID.randomUUID();
Instant now = Instant.now();

PreparedStatement userInsert = session.prepare(
    "INSERT INTO users (userid, firstname, lastname, email, created_date, account_status) "
  + "VALUES (?, ?, ?, ?, ?, 'active')"
);
session.execute(userInsert.bind(userId, firstname, lastname, email, now));`,
        },
        {
          language: "nodejs",
          code: `const cassandra = require('cassandra-driver');
const { v4: uuidv4 } = require('uuid');

// Check for existing email
const existing = await client.execute(
  'SELECT * FROM user_credentials WHERE email = ?',
  [email], { prepare: true }
);

if (existing.first()) {
  throw new Error('Email already registered');
}

const userId = uuidv4();

await client.execute(
  'INSERT INTO users (userid, firstname, lastname, email, created_date, account_status) VALUES (?, ?, ?, ?, ?, ?)',
  [userId, firstname, lastname, email, new Date(), 'active'],
  { prepare: true }
);`,
        },
        {
          language: "csharp",
          code: `using Cassandra;
using System;

var credCheck = session.Prepare(
    "SELECT * FROM user_credentials WHERE email = ?");
var existing = session.Execute(credCheck.Bind(email)).FirstOrDefault();

if (existing != null)
    throw new InvalidOperationException("Email already registered");

var userId = Guid.NewGuid();
var now = DateTimeOffset.UtcNow;

var userInsert = session.Prepare(
    "INSERT INTO users (userid, firstname, lastname, email, created_date, account_status) "
  + "VALUES (?, ?, ?, ?, ?, 'active')");
session.Execute(userInsert.Bind(userId, firstname, lastname, email, now));`,
        },
        {
          language: "go",
          code: `import (
    "github.com/gocql/gocql"
    "time"
)

// Check for existing email
var existingEmail string
err := session.Query(
    "SELECT email FROM user_credentials WHERE email = ?", email,
).Scan(&existingEmail)
if err == nil {
    return errors.New("email already registered")
}

userId := gocql.TimeUUID()
now := time.Now().UTC()

err = session.Query(
    "INSERT INTO users (userid, firstname, lastname, email, created_date, account_status) VALUES (?, ?, ?, ?, ?, 'active')",
    userId, firstname, lastname, email, now,
).Exec()`,
        },
      ],
    },

    user_login: {
      key: "user_login",
      label: "User Login",
      query: {
        type: "READ",
        endpoint: "POST /api/v1/users/login",
        sourceFile: "src/hooks/useApi.ts:325",
        cql: `-- Fetch credentials by email
SELECT * FROM user_credentials WHERE email = ?

-- Fetch user profile by userid
SELECT * FROM users WHERE userid = ?

-- Update last login timestamp
UPDATE users SET last_login_date = ? WHERE userid = ?`,
        dataApiMethodChain: `db.collection("user_credentials").findOne({ "email": email })
db.collection("users").findOne({ "userid": userid })`,
        dataApiBody: {
          findOne: {
            filter: { email: "john@example.com" },
          },
        },
        tableApiMethodChain: `table("user_credentials").findOne({ "email": email })
table("users").findOne({ "userid": userid })`,
        tableApiBody: {
          findOne: {
            filter: { email: "john@example.com" },
          },
        },
      },
      schema: {
        tableName: "user_credentials",
        columns: [
          { name: "email", type: "TEXT", keyType: "partition" },
          { name: "password", type: "TEXT", keyType: "none" },
          { name: "userid", type: "UUID", keyType: "none" },
          { name: "account_locked", type: "BOOLEAN", keyType: "none" },
        ],
        description:
          "Credentials keyed by email for O(1) authentication lookups. Passwords are bcrypt-hashed. A separate login_attempts counter table tracks failed login attempts.",
      },
      languageExamples: [
        {
          language: "python",
          code: `from cassandra.cluster import Cluster

session = cluster.connect("killrvideo")

# Lookup credentials by email (partition key)
cred_stmt = session.prepare(
    "SELECT * FROM user_credentials WHERE email = ?"
)
cred = session.execute(cred_stmt, [email]).one()

if not cred or not verify_password(password, cred.password):
    raise ValueError("Invalid credentials")

# Fetch user profile
user_stmt = session.prepare(
    "SELECT * FROM users WHERE userid = ?"
)
user = session.execute(user_stmt, [cred.userid]).one()`,
        },
        {
          language: "java",
          code: `PreparedStatement credStmt = session.prepare(
    "SELECT * FROM user_credentials WHERE email = ?"
);
Row cred = session.execute(credStmt.bind(email)).one();

if (cred == null || !verifyPassword(password, cred.getString("password"))) {
    throw new AuthenticationException("Invalid credentials");
}

PreparedStatement userStmt = session.prepare(
    "SELECT * FROM users WHERE userid = ?"
);
Row user = session.execute(userStmt.bind(cred.getUuid("userid"))).one();`,
        },
        {
          language: "nodejs",
          code: `const cred = await client.execute(
  'SELECT * FROM user_credentials WHERE email = ?',
  [email], { prepare: true }
);

const credRow = cred.first();
if (!credRow || !await bcrypt.compare(password, credRow['password'])) {
  throw new Error('Invalid credentials');
}

const user = await client.execute(
  'SELECT * FROM users WHERE userid = ?',
  [credRow['userid']], { prepare: true }
);`,
        },
        {
          language: "csharp",
          code: `var credPs = session.Prepare(
    "SELECT * FROM user_credentials WHERE email = ?");
var cred = session.Execute(credPs.Bind(email)).FirstOrDefault();

if (cred == null || !BCrypt.Verify(password, cred.GetValue<string>("password")))
    throw new UnauthorizedAccessException("Invalid credentials");

var userPs = session.Prepare("SELECT * FROM users WHERE userid = ?");
var user = session.Execute(userPs.Bind(cred.GetValue<Guid>("userid"))).FirstOrDefault();`,
        },
        {
          language: "go",
          code: `var hashedPw string
var userId gocql.UUID

err := session.Query(
    "SELECT password, userid FROM user_credentials WHERE email = ?",
    email,
).Scan(&hashedPw, &userId)

if err != nil || !bcrypt.CompareHashAndPassword([]byte(hashedPw), []byte(password)) {
    return errors.New("invalid credentials")
}

var firstname, lastname string
err = session.Query(
    "SELECT firstname, lastname FROM users WHERE userid = ?",
    userId,
).Scan(&firstname, &lastname)`,
        },
      ],
    },

    user_me: {
      key: "user_me",
      label: "Current User Profile",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/users/me",
        sourceFile: "src/hooks/useApi.ts:55",
        cql: `SELECT userid, firstname, lastname, email, account_status, created_date
FROM users
WHERE userid = ?`,
        dataApiMethodChain: `db.collection("users").findOne({ "userid": currentUserId })`,
        dataApiBody: {
          findOne: {
            filter: { userid: "current-user-uuid" },
          },
        },
        tableApiMethodChain: `table("users").findOne({ "userid": currentUserId })`,
        tableApiBody: {
          findOne: {
            filter: { userid: "current-user-uuid" },
          },
        },
      },
      schema: {
        tableName: "users",
        columns: [
          { name: "userid", type: "UUID", keyType: "partition" },
          { name: "firstname", type: "TEXT", keyType: "none" },
          { name: "lastname", type: "TEXT", keyType: "none" },
          { name: "email", type: "TEXT", keyType: "none" },
          { name: "account_status", type: "TEXT", keyType: "none" },
          { name: "created_date", type: "TIMESTAMP", keyType: "none" },
        ],
        description:
          "Direct partition key lookup by userid extracted from JWT token. O(1) performance — Cassandra knows exactly which node holds the data.",
      },
      languageExamples: [
        {
          language: "python",
          code: `prepared = session.prepare(
    "SELECT * FROM users WHERE userid = ?"
)
row = session.execute(prepared, [user_id_from_jwt]).one()`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "SELECT * FROM users WHERE userid = ?"
);
Row row = session.execute(ps.bind(userIdFromJwt)).one();`,
        },
        {
          language: "nodejs",
          code: `const result = await client.execute(
  'SELECT * FROM users WHERE userid = ?',
  [userIdFromJwt], { prepare: true }
);
const row = result.first();`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare("SELECT * FROM users WHERE userid = ?");
var row = session.Execute(ps.Bind(userIdFromJwt)).FirstOrDefault();`,
        },
        {
          language: "go",
          code: `var firstname, lastname, email string
err := session.Query(
    "SELECT firstname, lastname, email FROM users WHERE userid = ?",
    userIdFromJwt,
).Scan(&firstname, &lastname, &email)`,
        },
      ],
    },

    videos_by_uploader: {
      key: "videos_by_uploader",
      label: "Videos by Uploader",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/videos/by-uploader/{user_id}",
        sourceFile: "src/hooks/useApi.ts:82",
        cql: `SELECT videoid, name, preview_image_location, userid, added_date
FROM videos
WHERE userid = ?
ORDER BY added_date DESC`,
        dataApiMethodChain: `db.collection("videos").find({ "userid": userId }).sort({ "added_date": -1 })`,
        dataApiBody: {
          find: {
            filter: { userid: "uploader-uuid" },
            sort: { added_date: -1 },
          },
        },
        tableApiMethodChain: `table("videos").find({ "userid": userId }).sort({ "added_date": -1 })`,
        tableApiBody: {
          find: {
            filter: { userid: "uploader-uuid" },
            sort: { added_date: -1 },
          },
        },
      },
      schema: {
        tableName: "videos",
        columns: [
          { name: "videoid", type: "UUID", keyType: "partition" },
          { name: "userid", type: "UUID", keyType: "none" },
          { name: "name", type: "TEXT", keyType: "none" },
          { name: "added_date", type: "TIMESTAMP", keyType: "none" },
          { name: "preview_image_location", type: "TEXT", keyType: "none" },
        ],
        description:
          "Uses SAI index on userid to find all videos by a specific uploader. In earlier Cassandra versions this required a separate denormalized table (user_videos).",
      },
      languageExamples: [
        {
          language: "python",
          code: `prepared = session.prepare(
    "SELECT * FROM videos WHERE userid = ? ORDER BY added_date DESC"
)
rows = session.execute(prepared, [uploader_id])`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "SELECT * FROM videos WHERE userid = ? ORDER BY added_date DESC"
);
ResultSet rs = session.execute(ps.bind(uploaderId));`,
        },
        {
          language: "nodejs",
          code: `const result = await client.execute(
  'SELECT * FROM videos WHERE userid = ? ORDER BY added_date DESC',
  [uploaderId], { prepare: true }
);`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare(
    "SELECT * FROM videos WHERE userid = ? ORDER BY added_date DESC");
var rs = session.Execute(ps.Bind(uploaderId));`,
        },
        {
          language: "go",
          code: `iter := session.Query(
    "SELECT * FROM videos WHERE userid = ? ORDER BY added_date DESC",
    uploaderId,
).Iter()`,
        },
      ],
    },

    videos_trending: {
      key: "videos_trending",
      label: "Trending Videos",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/videos/trending",
        sourceFile: "src/hooks/useApi.ts:95",
        cql: `-- Query video_activity for each day in the window
SELECT videoid FROM video_activity WHERE day = ?

-- Then fetch metadata for top N video IDs
SELECT * FROM videos WHERE videoid IN (?, ?, ...)`,
        dataApiMethodChain: `table("video_activity").find({ "day": dayKey })
// Aggregate counts, then:
db.collection("videos").find({ "videoid": { "$in": topIds } })`,
        dataApiBody: {
          find: {
            filter: { day: "2025-10-31" },
            projection: { videoid: 1 },
          },
        },
        tableApiMethodChain: `table("video_activity").find({ "day": dayKey })
table("videos").find({ "videoid": { "$in": topIds } })`,
        tableApiBody: {
          find: {
            filter: { day: "2025-10-31" },
            projection: { videoid: 1 },
          },
        },
      },
      schema: {
        tableName: "video_activity",
        columns: [
          { name: "day", type: "DATE", keyType: "partition" },
          { name: "watch_time", type: "TIMEUUID", keyType: "clustering", sortDirection: "desc" },
          { name: "videoid", type: "UUID", keyType: "none" },
        ],
        description:
          "Time-series table partitioned by day. Each view event is a row. Trending is computed by counting rows per videoid across a configurable time window (1, 7, or 30 days).",
      },
      languageExamples: [
        {
          language: "python",
          code: `from collections import Counter
from datetime import date, timedelta

# Query each day partition in the window
view_counts = Counter()
for delta in range(interval_days):
    day_key = (date.today() - timedelta(days=delta)).isoformat()
    rows = session.execute(
        "SELECT videoid FROM video_activity WHERE day = %s",
        [day_key]
    )
    for row in rows:
        view_counts[row.videoid] += 1

# Get top N
top_ids = [vid for vid, _ in view_counts.most_common(limit)]`,
        },
        {
          language: "java",
          code: `Map<UUID, Integer> viewCounts = new HashMap<>();
for (int i = 0; i < intervalDays; i++) {
    LocalDate day = LocalDate.now().minusDays(i);
    ResultSet rs = session.execute(
        "SELECT videoid FROM video_activity WHERE day = ?", day
    );
    for (Row row : rs) {
        UUID vid = row.getUuid("videoid");
        viewCounts.merge(vid, 1, Integer::sum);
    }
}`,
        },
        {
          language: "nodejs",
          code: `const viewCounts = new Map();
for (let i = 0; i < intervalDays; i++) {
  const day = new Date(Date.now() - i * 86400000)
    .toISOString().slice(0, 10);
  const result = await client.execute(
    'SELECT videoid FROM video_activity WHERE day = ?',
    [day], { prepare: true }
  );
  for (const row of result.rows) {
    const vid = row['videoid'];
    viewCounts.set(vid, (viewCounts.get(vid) || 0) + 1);
  }
}`,
        },
        {
          language: "csharp",
          code: `var viewCounts = new Dictionary<Guid, int>();
for (int i = 0; i < intervalDays; i++)
{
    var day = DateTime.UtcNow.AddDays(-i).ToString("yyyy-MM-dd");
    var rs = session.Execute(
        session.Prepare("SELECT videoid FROM video_activity WHERE day = ?").Bind(day));
    foreach (var row in rs)
    {
        var vid = row.GetValue<Guid>("videoid");
        viewCounts[vid] = viewCounts.GetValueOrDefault(vid) + 1;
    }
}`,
        },
        {
          language: "go",
          code: `viewCounts := make(map[gocql.UUID]int)
for i := 0; i < intervalDays; i++ {
    day := time.Now().AddDate(0, 0, -i).Format("2006-01-02")
    iter := session.Query(
        "SELECT videoid FROM video_activity WHERE day = ?", day,
    ).Iter()
    var vid gocql.UUID
    for iter.Scan(&vid) {
        viewCounts[vid]++
    }
}`,
        },
      ],
    },

    search_videos: {
      key: "search_videos",
      label: "Video Search",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/search/videos",
        sourceFile: "src/hooks/useApi.ts:110",
        cql: `-- Vector similarity search (semantic mode)
SELECT videoid, name, description, similarity_cosine(content_features, ?) AS score
FROM videos
ORDER BY content_features ANN OF ?
LIMIT 10`,
        dataApiMethodChain: `db.collection("videos").find({}).sort({ "$vector": queryVector }).limit(10)`,
        dataApiBody: {
          find: {
            sort: { $vector: [0.1, 0.2, "...384 dimensions"] },
            options: { limit: 10, includeSimilarity: true },
          },
        },
        tableApiMethodChain: `table("videos").find({}).sort({ "$vector": queryVector }).limit(10)`,
        tableApiBody: {
          find: {
            sort: { content_features: [0.1, 0.2, "...384 dimensions"] },
            options: { limit: 10, includeSimilarity: true },
          },
        },
      },
      schema: {
        tableName: "videos",
        columns: [
          { name: "videoid", type: "UUID", keyType: "partition" },
          { name: "name", type: "TEXT", keyType: "none" },
          { name: "description", type: "TEXT", keyType: "none" },
          { name: "content_features", type: "VECTOR<FLOAT, 384>", keyType: "none" },
          { name: "tags", type: "SET<TEXT>", keyType: "none" },
        ],
        description:
          "Uses SAI vector index on content_features for approximate nearest neighbor (ANN) search. Embeddings are generated using IBM Granite-Embedding-30m-English (384 dimensions) with cosine similarity.",
      },
      languageExamples: [
        {
          language: "python",
          code: `from cassandra.cluster import Cluster

# Generate query embedding
query_vector = embedding_service.generate_embedding(search_query)

# ANN search using CQL
prepared = session.prepare(
    "SELECT videoid, name, similarity_cosine(content_features, ?) AS score "
    "FROM videos "
    "ORDER BY content_features ANN OF ? LIMIT ?"
)
rows = session.execute(prepared, [query_vector, query_vector, limit])

for row in rows:
    print(f"{row.name} (score: {row.score:.3f})")`,
        },
        {
          language: "java",
          code: `import com.datastax.oss.driver.api.core.data.CqlVector;

// Generate query embedding
float[] queryVector = embeddingService.generateEmbedding(searchQuery);

PreparedStatement ps = session.prepare(
    "SELECT videoid, name, similarity_cosine(content_features, ?) AS score "
  + "FROM videos ORDER BY content_features ANN OF ? LIMIT ?"
);
ResultSet rs = session.execute(ps.bind(
    CqlVector.newInstance(queryVector), CqlVector.newInstance(queryVector), limit
));`,
        },
        {
          language: "nodejs",
          code: `// Generate query embedding
const queryVector = embeddingService.generateEmbedding(searchQuery);

// ANN search
const result = await client.execute(
  'SELECT videoid, name, similarity_cosine(content_features, ?) AS score ' +
  'FROM videos ORDER BY content_features ANN OF ? LIMIT ?',
  [queryVector, queryVector, limit],
  { prepare: true }
);`,
        },
        {
          language: "csharp",
          code: `// CQL driver with vector search
var queryVector = embeddingService.GenerateEmbedding(searchQuery);

var ps = session.Prepare(
    "SELECT videoid, name, similarity_cosine(content_features, ?) AS score "
  + "FROM videos ORDER BY content_features ANN OF ? LIMIT ?");
var rs = session.Execute(ps.Bind(queryVector, queryVector, limit));`,
        },
        {
          language: "go",
          code: `// Generate query embedding
queryVector := embeddingService.GenerateEmbedding(searchQuery)

iter := session.Query(
    "SELECT videoid, name, similarity_cosine(content_features, ?) AS score "+
    "FROM videos ORDER BY content_features ANN OF ? LIMIT ?",
    queryVector, queryVector, limit,
).Iter()`,
        },
      ],
    },

    tags_suggest: {
      key: "tags_suggest",
      label: "Tag Autocomplete",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/search/tags/suggest",
        sourceFile: "src/hooks/useApi.ts:120",
        cql: `-- Scan recent video tags and filter client-side
SELECT tags FROM videos
WHERE tags CONTAINS ?
LIMIT 2000`,
        dataApiMethodChain: `db.collection("videos").find({ "tags": { "$exists": true } }, { projection: { "tags": 1 } })`,
        dataApiBody: {
          find: {
            filter: { tags: { $exists: true } },
            projection: { tags: 1 },
            options: { limit: 2000 },
          },
        },
        tableApiMethodChain: `table("videos").find({ "tags": { "$exists": true } }, { projection: { "tags": 1 } })`,
        tableApiBody: {
          find: {
            filter: { tags: { $exists: true } },
            projection: { tags: 1 },
            options: { limit: 2000 },
          },
        },
      },
      schema: {
        tableName: "videos",
        columns: [
          { name: "videoid", type: "UUID", keyType: "partition" },
          { name: "tags", type: "SET<TEXT>", keyType: "none" },
        ],
        description:
          "Tags are stored as SET<TEXT> in the videos table with a SAI index enabling CONTAINS queries. For autocomplete, the backend scans recent tags and performs substring matching server-side.",
      },
      languageExamples: [
        {
          language: "python",
          code: `# SAI-powered tag search
prepared = session.prepare(
    "SELECT tags FROM videos WHERE tags CONTAINS ? LIMIT 2000"
)
rows = session.execute(prepared, [query])

tag_set = set()
for row in rows:
    tag_set.update(row.tags)

# Filter by substring match
suggestions = [t for t in sorted(tag_set) if query.lower() in t.lower()]`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "SELECT tags FROM videos WHERE tags CONTAINS ? LIMIT 2000"
);
ResultSet rs = session.execute(ps.bind(query));

Set<String> tagSet = new HashSet<>();
for (Row row : rs) {
    tagSet.addAll(row.getSet("tags", String.class));
}`,
        },
        {
          language: "nodejs",
          code: `const result = await client.execute(
  'SELECT tags FROM videos WHERE tags CONTAINS ? LIMIT 2000',
  [query], { prepare: true }
);

const tagSet = new Set();
for (const row of result.rows) {
  for (const tag of row['tags']) tagSet.add(tag);
}`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare(
    "SELECT tags FROM videos WHERE tags CONTAINS ? LIMIT 2000");
var rs = session.Execute(ps.Bind(query));

var tagSet = new HashSet<string>();
foreach (var row in rs)
    foreach (var tag in row.GetValue<IEnumerable<string>>("tags"))
        tagSet.Add(tag);`,
        },
        {
          language: "go",
          code: `iter := session.Query(
    "SELECT tags FROM videos WHERE tags CONTAINS ? LIMIT 2000",
    query,
).Iter()

tagSet := make(map[string]bool)
var tags []string
for iter.Scan(&tags) {
    for _, tag := range tags {
        tagSet[tag] = true
    }
}`,
        },
      ],
    },

    record_view: {
      key: "record_view",
      label: "Record Video View",
      query: {
        type: "WRITE",
        endpoint: "POST /api/v1/videos/id/{video_id}/view",
        sourceFile: "src/hooks/useApi.ts:155",
        cql: `-- Read-modify-write for view count
SELECT views FROM videos WHERE videoid = ?
UPDATE videos SET views = ? WHERE videoid = ?

-- Log activity event
INSERT INTO video_activity (day, watch_time, videoid)
VALUES (?, ?, ?)`,
        dataApiMethodChain: `db.collection("videos").updateOne({ "videoid": videoId }, { "$set": { "views": newCount } })
table("video_activity").insertOne({ day, watch_time, videoid })`,
        dataApiBody: {
          updateOne: {
            filter: { videoid: "550e8400-e29b-41d4-a716-446655440000" },
            update: { $set: { views: 43 } },
          },
        },
        tableApiMethodChain: `table("videos").updateOne({ "videoid": videoId }, { "$set": { "views": newCount } })
table("video_activity").insertOne({ day, watch_time, videoid })`,
        tableApiBody: {
          updateOne: {
            filter: { videoid: "550e8400-e29b-41d4-a716-446655440000" },
            update: { $set: { views: 43 } },
          },
        },
      },
      schema: {
        tableName: "videos",
        columns: [
          { name: "videoid", type: "UUID", keyType: "partition" },
          { name: "views", type: "INT", keyType: "none" },
        ],
        description:
          "View counts stored directly in the videos table. The Table API does not support $inc, so a read-modify-write cycle is used. A video_activity time-series table logs each view event for trending calculation.",
      },
      languageExamples: [
        {
          language: "python",
          code: `# Atomic counter increment with CQL
prepared = session.prepare(
    "UPDATE video_playback_stats "
    "SET views = views + 1 "
    "WHERE videoid = ?"
)
session.execute(prepared, [video_id])`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "UPDATE video_playback_stats SET views = views + 1 WHERE videoid = ?"
);
session.execute(ps.bind(videoId));`,
        },
        {
          language: "nodejs",
          code: `await client.execute(
  'UPDATE video_playback_stats SET views = views + 1 WHERE videoid = ?',
  [videoId], { prepare: true }
);`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare(
    "UPDATE video_playback_stats SET views = views + 1 WHERE videoid = ?");
session.Execute(ps.Bind(videoId));`,
        },
        {
          language: "go",
          code: `err := session.Query(
    "UPDATE video_playback_stats SET views = views + 1 WHERE videoid = ?",
    videoId,
).Exec()`,
        },
      ],
    },

    rating_summary: {
      key: "rating_summary",
      label: "Rating Summary",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/videos/{video_id}/ratings",
        sourceFile: "src/hooks/useApi.ts:205",
        cql: `-- Get aggregate counters
SELECT rating_counter, rating_total
FROM video_ratings
WHERE videoid = ?

-- Get current user's individual rating (optional)
SELECT rating FROM video_ratings_by_user
WHERE videoid = ? AND userid = ?`,
        dataApiMethodChain: `db.collection("video_ratings").findOne({ "videoid": videoId })`,
        dataApiBody: {
          findOne: {
            filter: { videoid: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        tableApiMethodChain: `table("video_ratings").findOne({ "videoid": videoId })`,
        tableApiBody: {
          findOne: {
            filter: { videoid: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
      },
      schema: {
        tableName: "video_ratings",
        columns: [
          { name: "videoid", type: "UUID", keyType: "partition" },
          { name: "rating_counter", type: "COUNTER", keyType: "none" },
          { name: "rating_total", type: "COUNTER", keyType: "none" },
        ],
        description:
          "COUNTER columns support atomic increment/decrement without read-before-write. Counter tables cannot contain non-counter, non-key columns. Average is computed as rating_total / rating_counter.",
      },
      languageExamples: [
        {
          language: "python",
          code: `prepared = session.prepare(
    "SELECT rating_counter, rating_total "
    "FROM video_ratings WHERE videoid = ?"
)
row = session.execute(prepared, [video_id]).one()

if row and row.rating_counter > 0:
    avg = row.rating_total / row.rating_counter
    print(f"Average: {avg:.1f} ({row.rating_counter} ratings)")`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "SELECT rating_counter, rating_total FROM video_ratings WHERE videoid = ?"
);
Row row = session.execute(ps.bind(videoId)).one();

if (row != null && row.getLong("rating_counter") > 0) {
    double avg = (double) row.getLong("rating_total") / row.getLong("rating_counter");
}`,
        },
        {
          language: "nodejs",
          code: `const result = await client.execute(
  'SELECT rating_counter, rating_total FROM video_ratings WHERE videoid = ?',
  [videoId], { prepare: true }
);
const row = result.first();

if (row && row['rating_counter'] > 0) {
  const avg = row['rating_total'] / row['rating_counter'];
}`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare(
    "SELECT rating_counter, rating_total FROM video_ratings WHERE videoid = ?");
var row = session.Execute(ps.Bind(videoId)).FirstOrDefault();

if (row != null && row.GetValue<long>("rating_counter") > 0)
{
    double avg = (double)row.GetValue<long>("rating_total") / row.GetValue<long>("rating_counter");
}`,
        },
        {
          language: "go",
          code: `var ratingCounter, ratingTotal int64
err := session.Query(
    "SELECT rating_counter, rating_total FROM video_ratings WHERE videoid = ?",
    videoId,
).Scan(&ratingCounter, &ratingTotal)

if err == nil && ratingCounter > 0 {
    avg := float64(ratingTotal) / float64(ratingCounter)
}`,
        },
      ],
    },

    user_activity: {
      key: "user_activity",
      label: "User Activity Timeline",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/users/{user_id}/activity",
        sourceFile: "src/hooks/useApi.ts:170",
        cql: `-- Query each day partition concurrently (last 30 days)
SELECT activity_type, activity_timestamp, activity_id
FROM user_activity
WHERE userid = ? AND day = ?`,
        dataApiMethodChain: `table("user_activity").find({ "userid": userId, "day": dayKey })`,
        dataApiBody: {
          find: {
            filter: { userid: "user-uuid", day: "2025-10-31" },
          },
        },
        tableApiMethodChain: `table("user_activity").find({ "userid": userId, "day": dayKey })`,
        tableApiBody: {
          find: {
            filter: { userid: "user-uuid", day: "2025-10-31" },
          },
        },
      },
      schema: {
        tableName: "user_activity",
        columns: [
          { name: "userid", type: "UUID", keyType: "partition" },
          { name: "day", type: "DATE", keyType: "partition" },
          { name: "activity_type", type: "TEXT", keyType: "clustering", sortDirection: "asc" },
          { name: "activity_timestamp", type: "TIMESTAMP", keyType: "clustering", sortDirection: "desc" },
          { name: "activity_id", type: "TIMEUUID", keyType: "clustering", sortDirection: "asc" },
        ],
        description:
          "Composite partition key (userid, day) bounds partition size to one day per user. All 30 day-partitions are queried concurrently via asyncio.gather with a hard cap of 1000 total rows.",
      },
      languageExamples: [
        {
          language: "python",
          code: `import asyncio
from datetime import date, timedelta

# Query all 30 day partitions concurrently
async def fetch_day(day_key):
    rows = session.execute(
        "SELECT * FROM user_activity WHERE userid = %s AND day = %s",
        [user_id, day_key]
    )
    return list(rows)

days = [(date.today() - timedelta(days=i)).isoformat() for i in range(30)]
results = await asyncio.gather(*[fetch_day(d) for d in days])`,
        },
        {
          language: "java",
          code: `List<CompletableFuture<ResultSet>> futures = new ArrayList<>();
for (int i = 0; i < 30; i++) {
    LocalDate day = LocalDate.now().minusDays(i);
    futures.add(session.executeAsync(
        ps.bind(userId, day)
    ).toCompletableFuture());
}
CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();`,
        },
        {
          language: "nodejs",
          code: `const days = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.now() - i * 86400000);
  return d.toISOString().slice(0, 10);
});

const results = await Promise.all(
  days.map(day => client.execute(
    'SELECT * FROM user_activity WHERE userid = ? AND day = ?',
    [userId, day], { prepare: true }
  ))
);`,
        },
        {
          language: "csharp",
          code: `var tasks = Enumerable.Range(0, 30).Select(i =>
{
    var day = DateTime.UtcNow.AddDays(-i).ToString("yyyy-MM-dd");
    return Task.Run(() => session.Execute(ps.Bind(userId, day)));
}).ToArray();

await Task.WhenAll(tasks);`,
        },
        {
          language: "go",
          code: `var wg sync.WaitGroup
results := make([][]map[string]interface{}, 30)

for i := 0; i < 30; i++ {
    wg.Add(1)
    go func(idx int) {
        defer wg.Done()
        day := time.Now().AddDate(0, 0, -idx).Format("2006-01-02")
        iter := session.Query(
            "SELECT * FROM user_activity WHERE userid = ? AND day = ?",
            userId, day,
        ).Iter()
        // ... collect rows
    }(i)
}
wg.Wait()`,
        },
      ],
    },

    moderation_flags_list: {
      key: "moderation_flags_list",
      label: "Moderation Flags List",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/moderation/flags",
        sourceFile: "src/hooks/useApi.ts:280",
        cql: `SELECT contentid, flagid, content_type, status, flagged_reason, reviewer, review_date
FROM content_moderation`,
        dataApiMethodChain: `db.collection("content_moderation").find({ "status": statusFilter })`,
        dataApiBody: {
          find: {
            filter: { status: "open" },
            options: { limit: 10 },
          },
        },
        tableApiMethodChain: `table("content_moderation").find({ "status": statusFilter })`,
        tableApiBody: {
          find: {
            filter: { status: "open" },
            options: { limit: 10 },
          },
        },
      },
      schema: {
        tableName: "content_moderation",
        columns: [
          { name: "contentid", type: "UUID", keyType: "partition" },
          { name: "flagid", type: "TIMEUUID", keyType: "clustering" },
          { name: "content_type", type: "TEXT", keyType: "none" },
          { name: "status", type: "TEXT", keyType: "none" },
          { name: "flagged_reason", type: "TEXT", keyType: "none" },
          { name: "reviewer", type: "UUID", keyType: "none" },
          { name: "review_date", type: "TIMESTAMP", keyType: "none" },
        ],
        description:
          "Content moderation flags with composite key (contentid, flagid). Flags are created by viewers and reviewed by moderators. Status transitions: open → under_review → approved/rejected.",
      },
      languageExamples: [
        {
          language: "python",
          code: `prepared = session.prepare(
    "SELECT * FROM content_moderation"
)
rows = session.execute(prepared)

for row in rows:
    print(f"Flag {row.flagid}: {row.content_type} - {row.status}")`,
        },
        {
          language: "java",
          code: `ResultSet rs = session.execute("SELECT * FROM content_moderation");

for (Row row : rs) {
    System.out.printf("Flag %s: %s - %s%n",
        row.getUuid("flagid"),
        row.getString("content_type"),
        row.getString("status"));
}`,
        },
        {
          language: "nodejs",
          code: `const result = await client.execute(
  'SELECT * FROM content_moderation', [], { prepare: true }
);

for (const row of result.rows) {
  console.log(\`Flag \${row['flagid']}: \${row['status']}\`);
}`,
        },
        {
          language: "csharp",
          code: `var rs = session.Execute("SELECT * FROM content_moderation");

foreach (var row in rs)
{
    Console.WriteLine($"Flag {row.GetValue<Guid>("flagid")}: {row.GetValue<string>("status")}");
}`,
        },
        {
          language: "go",
          code: `iter := session.Query("SELECT * FROM content_moderation").Iter()

var flagId gocql.UUID
var status string
for iter.Scan(&flagId, &status) {
    fmt.Printf("Flag %s: %s\\n", flagId, status)
}`,
        },
      ],
    },

    add_comment: {
      key: "add_comment",
      label: "Add Comment",
      query: {
        type: "WRITE",
        endpoint: "POST /api/v1/videos/{video_id}/comments",
        sourceFile: "src/hooks/useApi.ts:154",
        cql: `INSERT INTO comments (videoid, commentid, userid, comment)
VALUES (?, now(), ?, ?)

-- Dual-write to denormalized table for user-centric queries
INSERT INTO comments_by_user (userid, commentid, videoid, comment)
VALUES (?, now(), ?, ?)`,
        dataApiMethodChain: `db.collection("comments").insertOne({ videoid, commentid: TimeUUID(), userid, comment })`,
        dataApiBody: {
          insertOne: {
            document: {
              videoid: "550e8400-e29b-41d4-a716-446655440000",
              userid: "user-uuid",
              comment: "Great video!",
            },
          },
        },
        tableApiMethodChain: `table("comments").insertOne({ videoid, commentid: TimeUUID(), userid, comment })`,
        tableApiBody: {
          insertOne: {
            document: {
              videoid: "550e8400-e29b-41d4-a716-446655440000",
              userid: "user-uuid",
              comment: "Great video!",
            },
          },
        },
      },
      schema: {
        tableName: "comments",
        columns: [
          { name: "videoid", type: "UUID", keyType: "partition" },
          { name: "commentid", type: "TIMEUUID", keyType: "clustering", sortDirection: "desc" },
          { name: "userid", type: "UUID", keyType: "none" },
          { name: "comment", type: "TEXT", keyType: "none" },
        ],
        description:
          "TIMEUUID now() generates a time-based unique ID for ordering. Dual-write pattern: every comment is written to both comments (by video) and comments_by_user (by user) to support different access patterns without JOINs.",
      },
      languageExamples: [
        {
          language: "python",
          code: `from cassandra.cluster import Cluster

session = cluster.connect("killrvideo")

# Dual-write: comments + comments_by_user
comment_stmt = session.prepare(
    "INSERT INTO comments (videoid, commentid, userid, comment) "
    "VALUES (?, now(), ?, ?)"
)
session.execute(comment_stmt, [video_id, user_id, comment_text])

by_user_stmt = session.prepare(
    "INSERT INTO comments_by_user (userid, commentid, videoid, comment) "
    "VALUES (?, now(), ?, ?)"
)
session.execute(by_user_stmt, [user_id, video_id, comment_text])`,
        },
        {
          language: "java",
          code: `PreparedStatement commentStmt = session.prepare(
    "INSERT INTO comments (videoid, commentid, userid, comment) "
  + "VALUES (?, now(), ?, ?)"
);
session.execute(commentStmt.bind(videoId, userId, commentText));

PreparedStatement byUserStmt = session.prepare(
    "INSERT INTO comments_by_user (userid, commentid, videoid, comment) "
  + "VALUES (?, now(), ?, ?)"
);
session.execute(byUserStmt.bind(userId, videoId, commentText));`,
        },
        {
          language: "nodejs",
          code: `// Dual-write to both comment tables
await client.execute(
  'INSERT INTO comments (videoid, commentid, userid, comment) VALUES (?, now(), ?, ?)',
  [videoId, userId, commentText],
  { prepare: true }
);

await client.execute(
  'INSERT INTO comments_by_user (userid, commentid, videoid, comment) VALUES (?, now(), ?, ?)',
  [userId, videoId, commentText],
  { prepare: true }
);`,
        },
        {
          language: "csharp",
          code: `var commentPs = session.Prepare(
    "INSERT INTO comments (videoid, commentid, userid, comment) "
  + "VALUES (?, now(), ?, ?)");
session.Execute(commentPs.Bind(videoId, userId, commentText));

var byUserPs = session.Prepare(
    "INSERT INTO comments_by_user (userid, commentid, videoid, comment) "
  + "VALUES (?, now(), ?, ?)");
session.Execute(byUserPs.Bind(userId, videoId, commentText));`,
        },
        {
          language: "go",
          code: `// Dual-write: comments + comments_by_user
err := session.Query(
    "INSERT INTO comments (videoid, commentid, userid, comment) VALUES (?, now(), ?, ?)",
    videoId, userId, commentText,
).Exec()

err = session.Query(
    "INSERT INTO comments_by_user (userid, commentid, videoid, comment) VALUES (?, now(), ?, ?)",
    userId, videoId, commentText,
).Exec()`,
        },
      ],
    },

    flag_content: {
      key: "flag_content",
      label: "Flag Content",
      query: {
        type: "WRITE",
        endpoint: "POST /api/v1/flags",
        sourceFile: "src/hooks/useApi.ts:377",
        cql: `INSERT INTO content_flags (contentid, flagid, content_type, reporter_id, reason, status, created_at)
VALUES (?, now(), ?, ?, ?, 'open', toTimestamp(now()))`,
        dataApiMethodChain: `db.collection("content_flags").insertOne({ contentid, content_type, reporter_id, reason, status: "open" })`,
        dataApiBody: {
          insertOne: {
            document: {
              contentid: "550e8400-e29b-41d4-a716-446655440000",
              content_type: "video",
              reporter_id: "user-uuid",
              reason: "inappropriate",
              status: "open",
            },
          },
        },
        tableApiMethodChain: `table("content_flags").insertOne({ contentid, content_type, reporter_id, reason, status: "open" })`,
        tableApiBody: {
          insertOne: {
            document: {
              contentid: "550e8400-e29b-41d4-a716-446655440000",
              content_type: "video",
              reporter_id: "user-uuid",
              reason: "inappropriate",
              status: "open",
            },
          },
        },
      },
      schema: {
        tableName: "content_flags",
        columns: [
          { name: "contentid", type: "UUID", keyType: "partition" },
          { name: "flagid", type: "TIMEUUID", keyType: "clustering", sortDirection: "desc" },
          { name: "content_type", type: "TEXT", keyType: "none" },
          { name: "reporter_id", type: "UUID", keyType: "none" },
          { name: "reason", type: "TEXT", keyType: "none" },
          { name: "status", type: "TEXT", keyType: "none" },
          { name: "created_at", type: "TIMESTAMP", keyType: "none" },
        ],
        description:
          "Simple write-only insert for user-submitted flags. Moderation picks up flags asynchronously. TIMEUUID clustering preserves flag ordering per content item.",
      },
      languageExamples: [
        {
          language: "python",
          code: `from cassandra.cluster import Cluster

session = cluster.connect("killrvideo")

prepared = session.prepare(
    "INSERT INTO content_flags "
    "(contentid, flagid, content_type, reporter_id, reason, status, created_at) "
    "VALUES (?, now(), ?, ?, ?, 'open', toTimestamp(now()))"
)
session.execute(prepared, [content_id, content_type, reporter_id, reason])`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "INSERT INTO content_flags "
  + "(contentid, flagid, content_type, reporter_id, reason, status, created_at) "
  + "VALUES (?, now(), ?, ?, ?, 'open', toTimestamp(now()))"
);
session.execute(ps.bind(contentId, contentType, reporterId, reason));`,
        },
        {
          language: "nodejs",
          code: `await client.execute(
  'INSERT INTO content_flags (contentid, flagid, content_type, reporter_id, reason, status, created_at) ' +
  "VALUES (?, now(), ?, ?, ?, 'open', toTimestamp(now()))",
  [contentId, contentType, reporterId, reason],
  { prepare: true }
);`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare(
    "INSERT INTO content_flags "
  + "(contentid, flagid, content_type, reporter_id, reason, status, created_at) "
  + "VALUES (?, now(), ?, ?, ?, 'open', toTimestamp(now()))");
session.Execute(ps.Bind(contentId, contentType, reporterId, reason));`,
        },
        {
          language: "go",
          code: `err := session.Query(
    "INSERT INTO content_flags "+
        "(contentid, flagid, content_type, reporter_id, reason, status, created_at) "+
        "VALUES (?, now(), ?, ?, ?, 'open', toTimestamp(now()))",
    contentId, contentType, reporterId, reason,
).Exec()`,
        },
      ],
    },

    update_profile: {
      key: "update_profile",
      label: "Update Profile",
      query: {
        type: "WRITE",
        endpoint: "PUT /api/v1/users/me",
        sourceFile: "src/lib/api.ts:96",
        cql: `UPDATE users
SET firstname = ?, lastname = ?, email = ?
WHERE userid = ?`,
        dataApiMethodChain: `db.collection("users").findOneAndUpdate({ "userid": currentUserId }, { "$set": { firstname, lastname, email } })`,
        dataApiBody: {
          findOneAndUpdate: {
            filter: { userid: "current-user-uuid" },
            update: { "$set": { firstname: "Jane", lastname: "Doe", email: "jane@example.com" } },
          },
        },
        tableApiMethodChain: `table("users").updateOne({ "userid": currentUserId }, { "$set": { firstname, lastname, email } })`,
        tableApiBody: {
          updateOne: {
            filter: { userid: "current-user-uuid" },
            update: { "$set": { firstname: "Jane", lastname: "Doe", email: "jane@example.com" } },
          },
        },
      },
      schema: {
        tableName: "users",
        columns: [
          { name: "userid", type: "UUID", keyType: "partition" },
          { name: "firstname", type: "TEXT", keyType: "none" },
          { name: "lastname", type: "TEXT", keyType: "none" },
          { name: "email", type: "TEXT", keyType: "none" },
        ],
        description:
          "Cassandra UPDATE is an upsert — it creates the row if absent and overwrites specified columns if present. No read-before-write needed. The partition key (userid) from the JWT targets a single node.",
      },
      languageExamples: [
        {
          language: "python",
          code: `prepared = session.prepare(
    "UPDATE users SET firstname = ?, lastname = ?, email = ? "
    "WHERE userid = ?"
)
session.execute(prepared, [firstname, lastname, email, user_id])`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "UPDATE users SET firstname = ?, lastname = ?, email = ? "
  + "WHERE userid = ?"
);
session.execute(ps.bind(firstname, lastname, email, userId));`,
        },
        {
          language: "nodejs",
          code: `await client.execute(
  'UPDATE users SET firstname = ?, lastname = ?, email = ? WHERE userid = ?',
  [firstname, lastname, email, userId],
  { prepare: true }
);`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare(
    "UPDATE users SET firstname = ?, lastname = ?, email = ? "
  + "WHERE userid = ?");
session.Execute(ps.Bind(firstname, lastname, email, userId));`,
        },
        {
          language: "go",
          code: `err := session.Query(
    "UPDATE users SET firstname = ?, lastname = ?, email = ? WHERE userid = ?",
    firstname, lastname, email, userId,
).Exec()`,
        },
      ],
    },

    comments_by_user: {
      key: "comments_by_user",
      label: "Comments by User",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/users/{user_id}/comments",
        sourceFile: "src/hooks/useApi.ts:146",
        cql: `SELECT commentid, videoid, comment
FROM comments_by_user
WHERE userid = ?
ORDER BY commentid DESC`,
        dataApiMethodChain: `db.collection("comments_by_user").find({ "userid": userId }).sort({ "commentid": -1 })`,
        dataApiBody: {
          find: {
            filter: { userid: "user-uuid" },
            sort: { commentid: -1 },
          },
        },
        tableApiMethodChain: `table("comments_by_user").find({ "userid": userId }).sort({ "commentid": -1 })`,
        tableApiBody: {
          find: {
            filter: { userid: "user-uuid" },
            sort: { commentid: -1 },
          },
        },
      },
      schema: {
        tableName: "comments_by_user",
        columns: [
          { name: "userid", type: "UUID", keyType: "partition" },
          { name: "commentid", type: "TIMEUUID", keyType: "clustering", sortDirection: "desc" },
          { name: "videoid", type: "UUID", keyType: "none" },
          { name: "comment", type: "TEXT", keyType: "none" },
        ],
        description:
          "Denormalized copy of comments partitioned by userid instead of videoid. Same data, different access pattern — this is the core Cassandra modeling principle: one table per query pattern.",
      },
      languageExamples: [
        {
          language: "python",
          code: `prepared = session.prepare(
    "SELECT * FROM comments_by_user "
    "WHERE userid = ? ORDER BY commentid DESC"
)
rows = session.execute(prepared, [user_id])

for row in rows:
    print(row.videoid, row.comment)`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "SELECT * FROM comments_by_user "
  + "WHERE userid = ? ORDER BY commentid DESC"
);
ResultSet rs = session.execute(ps.bind(userId));

for (Row row : rs) {
    System.out.println(row.getString("comment"));
}`,
        },
        {
          language: "nodejs",
          code: `const result = await client.execute(
  'SELECT * FROM comments_by_user WHERE userid = ? ORDER BY commentid DESC',
  [userId], { prepare: true }
);

for (const row of result.rows) {
  console.log(row['videoid'], row['comment']);
}`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare(
    "SELECT * FROM comments_by_user "
  + "WHERE userid = ? ORDER BY commentid DESC");
var rs = session.Execute(ps.Bind(userId));

foreach (var row in rs)
{
    Console.WriteLine(row.GetValue<string>("comment"));
}`,
        },
        {
          language: "go",
          code: `iter := session.Query(
    "SELECT * FROM comments_by_user WHERE userid = ? ORDER BY commentid DESC",
    userId,
).Iter()

var videoId gocql.UUID
var comment string
for iter.Scan(&videoId, &comment) {
    fmt.Println(videoId, comment)
}`,
        },
      ],
    },

    flag_details: {
      key: "flag_details",
      label: "Flag Details",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/moderation/flags/{flag_id}",
        sourceFile: "src/hooks/useApi.ts:357",
        cql: `SELECT contentid, flagid, content_type, status, flagged_reason, reporter_id, reviewer, review_date
FROM content_moderation
WHERE contentid = ? AND flagid = ?`,
        dataApiMethodChain: `db.collection("content_moderation").findOne({ "contentid": contentId, "flagid": flagId })`,
        dataApiBody: {
          findOne: {
            filter: {
              contentid: "550e8400-e29b-41d4-a716-446655440000",
              flagid: "timeuuid-value",
            },
          },
        },
        tableApiMethodChain: `table("content_moderation").findOne({ "contentid": contentId, "flagid": flagId })`,
        tableApiBody: {
          findOne: {
            filter: {
              contentid: "550e8400-e29b-41d4-a716-446655440000",
              flagid: "timeuuid-value",
            },
          },
        },
      },
      schema: {
        tableName: "content_moderation",
        columns: [
          { name: "contentid", type: "UUID", keyType: "partition" },
          { name: "flagid", type: "TIMEUUID", keyType: "clustering" },
          { name: "content_type", type: "TEXT", keyType: "none" },
          { name: "status", type: "TEXT", keyType: "none" },
          { name: "flagged_reason", type: "TEXT", keyType: "none" },
          { name: "reporter_id", type: "UUID", keyType: "none" },
          { name: "reviewer", type: "UUID", keyType: "none" },
          { name: "review_date", type: "TIMESTAMP", keyType: "none" },
        ],
        description:
          "Single-row lookup by composite key (contentid, flagid). The partition key routes to the correct node, the clustering key selects the specific flag within that partition.",
      },
      languageExamples: [
        {
          language: "python",
          code: `prepared = session.prepare(
    "SELECT * FROM content_moderation "
    "WHERE contentid = ? AND flagid = ?"
)
row = session.execute(prepared, [content_id, flag_id]).one()

if row:
    print(f"Status: {row.status}, Reason: {row.flagged_reason}")`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "SELECT * FROM content_moderation "
  + "WHERE contentid = ? AND flagid = ?"
);
Row row = session.execute(ps.bind(contentId, flagId)).one();

if (row != null) {
    System.out.println("Status: " + row.getString("status"));
}`,
        },
        {
          language: "nodejs",
          code: `const result = await client.execute(
  'SELECT * FROM content_moderation WHERE contentid = ? AND flagid = ?',
  [contentId, flagId], { prepare: true }
);

const row = result.first();
if (row) {
  console.log(\`Status: \${row['status']}, Reason: \${row['flagged_reason']}\`);
}`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare(
    "SELECT * FROM content_moderation "
  + "WHERE contentid = ? AND flagid = ?");
var row = session.Execute(ps.Bind(contentId, flagId)).FirstOrDefault();

if (row != null)
{
    Console.WriteLine($"Status: {row.GetValue<string>("status")}");
}`,
        },
        {
          language: "go",
          code: `var status, reason string
err := session.Query(
    "SELECT status, flagged_reason FROM content_moderation WHERE contentid = ? AND flagid = ?",
    contentId, flagId,
).Scan(&status, &reason)

if err == nil {
    fmt.Printf("Status: %s, Reason: %s\n", status, reason)
}`,
        },
      ],
    },

    action_flag: {
      key: "action_flag",
      label: "Action Flag",
      query: {
        type: "WRITE",
        endpoint: "POST /api/v1/moderation/flags/{flag_id}/action",
        sourceFile: "src/hooks/useApi.ts:366",
        cql: `UPDATE content_moderation
SET status = ?, reviewer = ?, review_date = toTimestamp(now())
WHERE contentid = ? AND flagid = ?
IF status = 'open'`,
        dataApiMethodChain: `db.collection("content_moderation").findOneAndUpdate(
  { "contentid": contentId, "flagid": flagId, "status": "open" },
  { "$set": { status: "approved", reviewer: reviewerId, review_date: new Date() } }
)`,
        dataApiBody: {
          findOneAndUpdate: {
            filter: {
              contentid: "550e8400-e29b-41d4-a716-446655440000",
              flagid: "timeuuid-value",
              status: "open",
            },
            update: {
              "$set": { status: "approved", reviewer: "reviewer-uuid", review_date: "2025-10-31T10:30:00Z" },
            },
          },
        },
        tableApiMethodChain: `table("content_moderation").updateOne(
  { "contentid": contentId, "flagid": flagId },
  { "$set": { status: "approved", reviewer: reviewerId, review_date: new Date() } }
)`,
        tableApiBody: {
          updateOne: {
            filter: {
              contentid: "550e8400-e29b-41d4-a716-446655440000",
              flagid: "timeuuid-value",
            },
            update: {
              "$set": { status: "approved", reviewer: "reviewer-uuid", review_date: "2025-10-31T10:30:00Z" },
            },
          },
        },
      },
      schema: {
        tableName: "content_moderation",
        columns: [
          { name: "contentid", type: "UUID", keyType: "partition" },
          { name: "flagid", type: "TIMEUUID", keyType: "clustering" },
          { name: "status", type: "TEXT", keyType: "none" },
          { name: "reviewer", type: "UUID", keyType: "none" },
          { name: "review_date", type: "TIMESTAMP", keyType: "none" },
        ],
        description:
          "Uses a lightweight transaction (IF status = 'open') to prevent double-action. LWTs use Paxos consensus for linearizable consistency — the update only applies if the condition holds at read time.",
      },
      languageExamples: [
        {
          language: "python",
          code: `# Lightweight transaction prevents double-action
prepared = session.prepare(
    "UPDATE content_moderation "
    "SET status = ?, reviewer = ?, review_date = toTimestamp(now()) "
    "WHERE contentid = ? AND flagid = ? "
    "IF status = 'open'"
)
result = session.execute(prepared, [new_status, reviewer_id, content_id, flag_id])

if not result.one().applied:
    print("Flag already actioned")`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "UPDATE content_moderation "
  + "SET status = ?, reviewer = ?, review_date = toTimestamp(now()) "
  + "WHERE contentid = ? AND flagid = ? "
  + "IF status = 'open'"
);
ResultSet rs = session.execute(ps.bind(newStatus, reviewerId, contentId, flagId));

if (!rs.wasApplied()) {
    System.out.println("Flag already actioned");
}`,
        },
        {
          language: "nodejs",
          code: `const result = await client.execute(
  'UPDATE content_moderation SET status = ?, reviewer = ?, review_date = toTimestamp(now()) ' +
  "WHERE contentid = ? AND flagid = ? IF status = 'open'",
  [newStatus, reviewerId, contentId, flagId],
  { prepare: true }
);

if (!result.first()['[applied]']) {
  console.log('Flag already actioned');
}`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare(
    "UPDATE content_moderation "
  + "SET status = ?, reviewer = ?, review_date = toTimestamp(now()) "
  + "WHERE contentid = ? AND flagid = ? "
  + "IF status = 'open'");
var rs = session.Execute(ps.Bind(newStatus, reviewerId, contentId, flagId));

if (!rs.First().GetValue<bool>("[applied]"))
{
    Console.WriteLine("Flag already actioned");
}`,
        },
        {
          language: "go",
          code: `var applied bool
err := session.Query(
    "UPDATE content_moderation "+
        "SET status = ?, reviewer = ?, review_date = toTimestamp(now()) "+
        "WHERE contentid = ? AND flagid = ? "+
        "IF status = 'open'",
    newStatus, reviewerId, contentId, flagId,
).Scan(&applied)

if !applied {
    fmt.Println("Flag already actioned")
}`,
        },
      ],
    },

    search_users: {
      key: "search_users",
      label: "Search Users",
      query: {
        type: "READ",
        endpoint: "GET /api/v1/moderation/users",
        sourceFile: "src/hooks/useApi.ts:383",
        cql: `SELECT userid, firstname, lastname, email, account_status, is_moderator
FROM users
WHERE firstname LIKE ? OR lastname LIKE ? OR email LIKE ?`,
        dataApiMethodChain: `db.collection("users").find({ "$or": [{ "firstname": { "$regex": query } }, { "lastname": { "$regex": query } }] })`,
        dataApiBody: {
          find: {
            filter: {
              "$or": [
                { firstname: { "$regex": ".*john.*" } },
                { lastname: { "$regex": ".*john.*" } },
              ],
            },
          },
        },
        tableApiMethodChain: `table("users").find({ "$or": [{ "firstname": { "$regex": query } }, { "lastname": { "$regex": query } }] })`,
        tableApiBody: {
          find: {
            filter: {
              "$or": [
                { firstname: { "$regex": ".*john.*" } },
                { lastname: { "$regex": ".*john.*" } },
              ],
            },
          },
        },
      },
      schema: {
        tableName: "users",
        columns: [
          { name: "userid", type: "UUID", keyType: "partition" },
          { name: "firstname", type: "TEXT", keyType: "none" },
          { name: "lastname", type: "TEXT", keyType: "none" },
          { name: "email", type: "TEXT", keyType: "none" },
          { name: "account_status", type: "TEXT", keyType: "none" },
          { name: "is_moderator", type: "BOOLEAN", keyType: "none" },
        ],
        description:
          "SAI indexes on firstname, lastname, and email enable LIKE queries without denormalization. SAI (Storage-Attached Indexing) is built into the SSTable lifecycle, avoiding the scatter-gather overhead of legacy secondary indexes.",
      },
      languageExamples: [
        {
          language: "python",
          code: `# SAI-powered user search with LIKE
prepared = session.prepare(
    "SELECT * FROM users WHERE firstname LIKE ? OR lastname LIKE ?"
)
rows = session.execute(prepared, [f"%{query}%", f"%{query}%"])

for row in rows:
    print(f"{row.firstname} {row.lastname} ({row.email})")`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "SELECT * FROM users WHERE firstname LIKE ? OR lastname LIKE ?"
);
ResultSet rs = session.execute(ps.bind("%" + query + "%", "%" + query + "%"));

for (Row row : rs) {
    System.out.printf("%s %s (%s)%n",
        row.getString("firstname"),
        row.getString("lastname"),
        row.getString("email"));
}`,
        },
        {
          language: "nodejs",
          code: `const result = await client.execute(
  'SELECT * FROM users WHERE firstname LIKE ? OR lastname LIKE ?',
  [\`%\${query}%\`, \`%\${query}%\`],
  { prepare: true }
);

for (const row of result.rows) {
  console.log(\`\${row['firstname']} \${row['lastname']} (\${row['email']})\`);
}`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare(
    "SELECT * FROM users WHERE firstname LIKE ? OR lastname LIKE ?");
var rs = session.Execute(ps.Bind($"%{query}%", $"%{query}%"));

foreach (var row in rs)
{
    Console.WriteLine($"{row.GetValue<string>("firstname")} {row.GetValue<string>("lastname")}");
}`,
        },
        {
          language: "go",
          code: `iter := session.Query(
    "SELECT * FROM users WHERE firstname LIKE ? OR lastname LIKE ?",
    "%"+query+"%", "%"+query+"%",
).Iter()

var firstname, lastname, email string
for iter.Scan(&firstname, &lastname, &email) {
    fmt.Printf("%s %s (%s)\n", firstname, lastname, email)
}`,
        },
      ],
    },

    assign_moderator: {
      key: "assign_moderator",
      label: "Assign Moderator",
      query: {
        type: "WRITE",
        endpoint: "POST /api/v1/moderation/users/{user_id}/assign-moderator",
        sourceFile: "src/hooks/useApi.ts:391",
        cql: `UPDATE users
SET is_moderator = true
WHERE userid = ?`,
        dataApiMethodChain: `db.collection("users").findOneAndUpdate({ "userid": userId }, { "$set": { is_moderator: true } })`,
        dataApiBody: {
          findOneAndUpdate: {
            filter: { userid: "target-user-uuid" },
            update: { "$set": { is_moderator: true } },
          },
        },
        tableApiMethodChain: `table("users").updateOne({ "userid": userId }, { "$set": { is_moderator: true } })`,
        tableApiBody: {
          updateOne: {
            filter: { userid: "target-user-uuid" },
            update: { "$set": { is_moderator: true } },
          },
        },
      },
      schema: {
        tableName: "users",
        columns: [
          { name: "userid", type: "UUID", keyType: "partition" },
          { name: "is_moderator", type: "BOOLEAN", keyType: "none" },
        ],
        description:
          "Single-column update on the users table. Cassandra UPDATE targets a specific partition with no read-before-write overhead. The boolean flag is checked on login to populate JWT claims.",
      },
      languageExamples: [
        {
          language: "python",
          code: `prepared = session.prepare(
    "UPDATE users SET is_moderator = true WHERE userid = ?"
)
session.execute(prepared, [target_user_id])`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "UPDATE users SET is_moderator = true WHERE userid = ?"
);
session.execute(ps.bind(targetUserId));`,
        },
        {
          language: "nodejs",
          code: `await client.execute(
  'UPDATE users SET is_moderator = true WHERE userid = ?',
  [targetUserId], { prepare: true }
);`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare(
    "UPDATE users SET is_moderator = true WHERE userid = ?");
session.Execute(ps.Bind(targetUserId));`,
        },
        {
          language: "go",
          code: `err := session.Query(
    "UPDATE users SET is_moderator = true WHERE userid = ?",
    targetUserId,
).Exec()`,
        },
      ],
    },

    revoke_moderator: {
      key: "revoke_moderator",
      label: "Revoke Moderator",
      query: {
        type: "WRITE",
        endpoint: "POST /api/v1/moderation/users/{user_id}/revoke-moderator",
        sourceFile: "src/hooks/useApi.ts:402",
        cql: `UPDATE users
SET is_moderator = false
WHERE userid = ?`,
        dataApiMethodChain: `db.collection("users").findOneAndUpdate({ "userid": userId }, { "$set": { is_moderator: false } })`,
        dataApiBody: {
          findOneAndUpdate: {
            filter: { userid: "target-user-uuid" },
            update: { "$set": { is_moderator: false } },
          },
        },
        tableApiMethodChain: `table("users").updateOne({ "userid": userId }, { "$set": { is_moderator: false } })`,
        tableApiBody: {
          updateOne: {
            filter: { userid: "target-user-uuid" },
            update: { "$set": { is_moderator: false } },
          },
        },
      },
      schema: {
        tableName: "users",
        columns: [
          { name: "userid", type: "UUID", keyType: "partition" },
          { name: "is_moderator", type: "BOOLEAN", keyType: "none" },
        ],
        description:
          "Mirrors assign_moderator but sets is_moderator to false. Same single-partition UPDATE with no read-before-write. Role changes take effect on next JWT refresh.",
      },
      languageExamples: [
        {
          language: "python",
          code: `prepared = session.prepare(
    "UPDATE users SET is_moderator = false WHERE userid = ?"
)
session.execute(prepared, [target_user_id])`,
        },
        {
          language: "java",
          code: `PreparedStatement ps = session.prepare(
    "UPDATE users SET is_moderator = false WHERE userid = ?"
);
session.execute(ps.bind(targetUserId));`,
        },
        {
          language: "nodejs",
          code: `await client.execute(
  'UPDATE users SET is_moderator = false WHERE userid = ?',
  [targetUserId], { prepare: true }
);`,
        },
        {
          language: "csharp",
          code: `var ps = session.Prepare(
    "UPDATE users SET is_moderator = false WHERE userid = ?");
session.Execute(ps.Bind(targetUserId));`,
        },
        {
          language: "go",
          code: `err := session.Query(
    "UPDATE users SET is_moderator = false WHERE userid = ?",
    targetUserId,
).Exec()`,
        },
      ],
    },
} as const;

const routeMap: Record<string, string[]> = {
  "/": ["latest_videos"],
  "/watch/:id": ["video_fetch", "comments_by_video", "rating_submit", "rating_summary", "record_view", "add_comment", "flag_content"],
  "/auth": ["user_register", "user_login"],
  "/profile": ["user_me", "user_activity", "update_profile", "comments_by_user"],
  "/creator": ["videos_by_uploader", "video_submit", "video_update"],
  "/explore": ["latest_videos"],
  "/trending": ["videos_trending"],
  "/search": ["search_videos", "tags_suggest"],
  "/moderation": ["moderation_flags_list", "action_flag"],
  "/moderation/flags/:flagId": ["flag_details", "action_flag"],
  "/moderation/users": ["search_users", "assign_moderator", "revoke_moderator"],
};

// Reverse-index: tableName → list of entry keys that operate on that table
const tableOperations: Record<string, string[]> = {};
for (const [key, entry] of Object.entries(entries)) {
  const table = entry.schema.tableName;
  (tableOperations[table] ??= []).push(key);
}

export const devPanelData: DevPanelDataset = {
  entries,
  routeMap,
  tableOperations,
};
