# GET /api/v1/recommendations/foryou - Personalized "For You" Feed

## Overview

This endpoint returns a personalized video feed for the authenticated user, similar to the
"For You" page on platforms like TikTok or YouTube's homepage. The goal is to surface videos
that match the user's interests based on their viewing history, liked content, and tag
preferences.

**Why it exists**: A chronological "latest videos" feed treats all users identically. A
personalized feed increases engagement by showing each user the content most likely to interest
them. This is the core recommendation surface in KillrVideo.

**Current status**: This endpoint is a **stub**. The current implementation proxies directly
to `list_latest_videos()`, returning the same results for every user. The personalization
logic (querying the `user_preferences` table and performing vector similarity) is designed but
not yet implemented. This document describes both the current behavior and the intended future
implementation.

**Why ship a stub?** The frontend can integrate against the endpoint today, showing the "For
You" tab with real video data. When the backend team enables personalization, the frontend
needs no changes -- the response schema is identical.

## HTTP Details

- **Method**: GET
- **Path**: `/api/v1/recommendations/foryou`
- **Auth Required**: Yes (authenticated viewer)
- **Success Status**: 200 OK

### Request

```http
GET /api/v1/recommendations/foryou
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

No query parameters are required. The user identity is extracted from the JWT token.

### Success Response (200 OK)

```json
{
  "data": [
    {
      "videoid": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Advanced Python Decorators",
      "description": "Deep dive into Python decorator patterns.",
      "preview_image_location": "https://storage.example.com/thumbs/550e8400.jpg",
      "userid": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "added_date": "2025-11-15T08:30:00Z",
      "tags": ["python", "advanced", "decorators"]
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 10,
    "totalItems": 50,
    "totalPages": 5
  }
}
```

### Error Responses

| Status | Condition                 | Example Body                              |
|--------|---------------------------|-------------------------------------------|
| 401    | Missing or invalid JWT    | `{"detail": "Not authenticated"}`         |
| 401    | Expired JWT token         | `{"detail": "Token has expired"}`         |
| 500    | Database connection error | `{"detail": "Internal server error"}`     |

## Cassandra Concepts Explained

### Vector Similarity for Recommendations

The same vector search technology used for text search can power recommendations. Instead of
comparing a *query string* to video vectors, you compare a *user preference vector* to video
vectors.

**Analogy**: Imagine every video is a point on a map and every user is also a point on that
same map. The user's position represents their combined interests. To recommend videos, you
find the video points closest to the user's position.

```
User preference vector: [0.8, 0.2, -0.3, ...]  (384 dimensions)
                         |
                         |  cosine similarity
                         |
Video A vector:          [0.7, 0.3, -0.2, ...]  --> similarity = 0.95 (recommend!)
Video B vector:          [-0.5, 0.1, 0.9, ...]  --> similarity = 0.23 (skip)
Video C vector:          [0.6, 0.1, -0.4, ...]  --> similarity = 0.88 (recommend!)
```

### User Preference Vectors

A user preference vector is a 384-dimensional representation of what the user likes. It is
built by aggregating the content vectors of videos the user has interacted with:

```
User watched:
  Video 1 (python tutorial):  [0.9, 0.1, -0.2, ...]
  Video 2 (python advanced):  [0.8, 0.3, -0.1, ...]
  Video 3 (cooking pasta):    [-0.1, 0.8, 0.5, ...]

Weighted average (more recent = higher weight):
  preference_vector = 0.5 * V1 + 0.3 * V2 + 0.2 * V3
                    = [0.63, 0.25, -0.01, ...]
```

The resulting vector is "closer" to programming content than cooking content because the user
watched more programming videos. ANN search against the videos table would then rank
programming videos higher.

### Personalization as a Spectrum

Recommendation systems exist on a spectrum from simple to complex:

| Level | Approach                    | KillrVideo Status       |
|-------|-----------------------------|-------------------------|
| 0     | Latest videos (no personalization) | Current (stub)   |
| 1     | Tag-based filtering         | Planned (tag_preferences) |
| 2     | Vector similarity           | Planned (preference_vector) |
| 3     | Collaborative filtering     | Not planned             |
| 4     | Deep learning models        | Not planned             |

KillrVideo is designed for levels 0-2. The `user_preferences` table supports both tag-based
and vector-based personalization.

### Composite Keys and Denormalization

The `user_preferences` table uses a simple primary key (`userid`), making it a single-row
lookup per user. This is intentional: preference data is small (one vector + two maps) and
accessed frequently. Keeping it in a single partition ensures O(1) reads.

In contrast, a normalized design would store each preference as a separate row:
```cql
-- Normalized (NOT used) -- more flexible but more queries
CREATE TABLE user_tag_preferences (
    userid uuid,
    tag text,
    weight float,
    PRIMARY KEY (userid, tag)
);
```

The denormalized approach (one row with `map<text, float>`) trades flexibility for read
performance -- a single query returns everything needed for personalization.

## Data Model

### Table: `videos` (recommendation target)

```cql
CREATE TABLE killrvideo.videos (
    videoid uuid PRIMARY KEY,
    name text,
    description text,
    tags set<text>,
    content_features vector<float, 384>,
    userid uuid,
    added_date timestamp,
    views int
);

CREATE CUSTOM INDEX videos_content_features_idx
ON killrvideo.videos(content_features)
USING 'StorageAttachedIndex'
WITH OPTIONS = { 'similarity_function': 'COSINE' };
```

### Table: `user_preferences` (personalization source)

```cql
CREATE TABLE killrvideo.user_preferences (
    userid uuid PRIMARY KEY,
    preference_vector vector<float, 384>,
    tag_preferences map<text, float>,
    category_preferences map<text, float>,
    last_updated timestamp
);
```

**Column details**:

| Column                 | Type                   | Purpose                                    |
|------------------------|------------------------|--------------------------------------------|
| `userid`               | uuid (PK)              | Links to the users table                   |
| `preference_vector`    | vector<float, 384>     | Aggregated embedding of user's interests   |
| `tag_preferences`      | map<text, float>        | Tag -> weight (e.g., {"python": 0.8})      |
| `category_preferences` | map<text, float>        | Category -> weight (future use)            |
| `last_updated`         | timestamp              | When preferences were last recomputed      |

**Example row**:
```json
{
  "userid": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "preference_vector": [0.63, 0.25, -0.01, ...],
  "tag_preferences": {
    "python": 0.85,
    "tutorial": 0.72,
    "machine-learning": 0.45
  },
  "category_preferences": {
    "programming": 0.90,
    "data-science": 0.60
  },
  "last_updated": "2025-11-14T22:00:00Z"
}
```

### Storage Estimates

| Component                | Size per User | 100K Users |
|--------------------------|---------------|------------|
| preference_vector (384f) | ~1.5 KB       | ~150 MB    |
| tag_preferences (avg 20) | ~0.5 KB       | ~50 MB     |
| category_preferences     | ~0.2 KB       | ~20 MB     |
| **Total**                | **~2.2 KB**   | **~220 MB** |

## Database Queries

### Current Implementation (Stub)

**Service Function**: `recommendation_service.get_personalized_for_you_videos()`

```python
async def get_personalized_for_you_videos(user_id: UUID, page: int, page_size: int):
    """
    Currently proxies to list_latest_videos.
    Returns the same results regardless of user identity.
    """
    return await list_latest_videos(page=page, page_size=page_size)
```

**Equivalent CQL** (what `list_latest_videos` executes):
```cql
SELECT videoid, name, description, tags, userid, added_date, views
FROM killrvideo.videos
LIMIT 10;
```

**Performance**: ~5-15 ms (simple scan with limit)

### Future Implementation (Personalized)

When personalization is enabled, the function will:

1. Fetch the user's preference vector from `user_preferences`.
2. Perform ANN search against `videos.content_features` using that vector.
3. Optionally boost results matching the user's tag preferences.

```python
async def get_personalized_for_you_videos(user_id: UUID, page: int, page_size: int):
    """
    Future: Vector-based personalized recommendations.
    """
    # Step 1: Get user preferences
    prefs_table = await get_table("user_preferences")
    prefs = await prefs_table.find_one(filter={"userid": str(user_id)})

    if not prefs or not prefs.get("preference_vector"):
        # No preferences yet -- fall back to latest videos
        return await list_latest_videos(page=page, page_size=page_size)

    # Step 2: ANN search using user's preference vector
    videos_table = await get_table("videos")
    results = await semantic_search_with_threshold(
        table=videos_table,
        vector_column="content_features",
        query_embedding=prefs["preference_vector"],
        page=page,
        page_size=page_size,
        similarity_threshold=0.5  # Lower threshold for discovery
    )

    return results
```

**Future CQL**:
```cql
-- Step 1: Get user preference vector
SELECT preference_vector, tag_preferences
FROM killrvideo.user_preferences
WHERE userid = 7c9e6679-7425-40de-944b-e07fc1f90ae7;

-- Step 2: ANN search using that vector
SELECT videoid, name, description, tags, userid, added_date, views,
       similarity_cosine(content_features, ?) AS score
FROM killrvideo.videos
ORDER BY content_features ANN OF ?
LIMIT 30;
```

**Future performance**: ~60-250 ms (preference lookup ~5 ms + ANN search ~50-200 ms +
post-processing ~5 ms)

### Preference Vector Update (Background)

The `preference_vector` would be recomputed periodically (e.g., every hour or after every
N interactions):

```python
async def update_user_preferences(user_id: UUID):
    """
    Recompute preference vector from recent watch history.
    """
    # Fetch user's recent activity
    activity = await get_recent_activity(user_id, limit=50)

    # Get content vectors for watched videos
    video_ids = [a.video_id for a in activity if a.type == "watch"]
    videos = await get_videos_by_ids(video_ids)

    # Weighted average (exponential decay by recency)
    weights = [0.95 ** i for i in range(len(videos))]
    vectors = [v.content_features for v in videos if v.content_features]

    preference_vector = weighted_average(vectors, weights)

    # Update user_preferences table
    await prefs_table.update_one(
        filter={"userid": str(user_id)},
        update={
            "$set": {
                "preference_vector": preference_vector,
                "last_updated": datetime.utcnow()
            }
        },
        upsert=True
    )
```

## Implementation Flow

### Current Flow (Stub)

```
+-------------------------------------------------------------+
| 1. Client sends GET /api/v1/recommendations/foryou          |
|    Authorization: Bearer <jwt>                               |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 2. Validate JWT token                                       |
|    +-- Missing/invalid? --> 401 Unauthorized                |
|    +-- Expired? --> 401 Token has expired                   |
|    +-- Valid? --> Extract user_id, continue                 |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 3. Call get_personalized_for_you_videos(user_id)            |
|    (currently proxies to list_latest_videos)                |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 4. Fetch latest videos from videos table                    |
|    SELECT * FROM videos LIMIT 10                            |
|    (same for all users -- no personalization)               |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 5. Build paginated response                                 |
|    { "data": [...], "pagination": { ... } }                 |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 6. Return 200 OK                                            |
+-------------------------------------------------------------+
```

### Future Flow (Personalized)

```
+-------------------------------------------------------------+
| 1. Client sends GET /api/v1/recommendations/foryou          |
|    Authorization: Bearer <jwt>                               |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 2. Validate JWT, extract user_id                            |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 3. Fetch user_preferences for user_id                       |
|    SELECT preference_vector FROM user_preferences            |
|    WHERE userid = ?                                         |
|    +-- No preferences? --> Fall back to latest videos       |
|    +-- Has preferences? --> Continue to ANN search          |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 4. ANN search: find videos similar to preference_vector     |
|    SELECT ..., similarity_cosine(content_features, ?) AS s  |
|    FROM videos ORDER BY content_features ANN OF ? LIMIT 30  |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 5. Post-process                                             |
|    +-- Filter by similarity threshold (>= 0.5)             |
|    +-- Boost videos matching tag_preferences                |
|    +-- Exclude already-watched videos                       |
|    +-- Paginate                                             |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 6. Return 200 OK with personalized results                  |
+-------------------------------------------------------------+
```

**Current total queries**: 1 (latest videos scan)
**Future total queries**: 2 (preference lookup + ANN search)
**Expected latency**: Current ~10 ms, Future ~60-250 ms

## Special Notes

### 1. The Stub is Intentional, Not a Bug

The fact that this endpoint returns the same results for every user is by design during this
phase of development. The response schema is already correct, so frontend integration can
proceed in parallel with backend personalization work. This is a common pattern in API-first
development.

### 2. Cold Start Problem for New Users

When the future personalization is enabled, new users will have no `user_preferences` row.
The fallback to `list_latest_videos()` ensures they still see content. As they watch and
interact, their preference vector builds up. After sufficient activity (e.g., 5+ watched
videos), the system switches to personalized results.

### 3. Filter Bubbles

A known risk with vector-based recommendations is the "filter bubble" -- the system keeps
showing more of what the user already watches, narrowing their exposure. Mitigation
strategies:

- **Diversity injection**: Reserve 20% of slots for random or trending videos.
- **Decay preferences**: Weight recent activity higher so interests can shift.
- **Category caps**: Limit any single category to 50% of recommendations.

### 4. Authentication Required but No User-Specific Data (Yet)

The endpoint requires authentication even though the current stub ignores the user identity.
This is correct: when personalization ships, the JWT is needed to look up preferences. Making
it authenticated now avoids a breaking API change later.

### 5. Performance Budget

For a "For You" feed that users see on every app open, latency matters:

| Component            | Budget   | Notes                          |
|----------------------|----------|--------------------------------|
| JWT validation       | ~1 ms    | In-memory verification         |
| Preference lookup    | ~5 ms    | Single partition key read      |
| ANN search           | ~100 ms  | Largest component              |
| Post-processing      | ~5 ms    | Filter, boost, paginate        |
| Network overhead     | ~20 ms   | Round trip                     |
| **Total**            | **~130 ms** | Well under 200 ms target    |

### 6. Astra DB Compatibility

Both `user_preferences` and `videos` tables use standard Cassandra types and SAI indexes.
The ANN search works identically on self-hosted Cassandra 5.0+ and DataStax Astra DB.

## Developer Tips

### Common Pitfalls

1. **Treating the stub as broken**: The "For You" feed returning the same videos for all
   users is expected in the current phase. Do not file a bug.

2. **Forgetting to send the auth header**: This endpoint returns 401 without a valid JWT.
   Unlike search, it is not public.

3. **Expecting real-time preference updates**: When future personalization ships, preference
   vectors will be updated periodically (e.g., hourly), not after every interaction. A user
   who just watched a cooking video will not immediately see cooking recommendations.

4. **Caching personalized results too aggressively**: Once personalization is live, each
   user's feed is different. Do not share cached responses across users. React Query's
   per-user cache key handles this naturally.

5. **Not handling the fallback gracefully**: Even with personalization enabled, users without
   sufficient history fall back to latest videos. The frontend should not distinguish between
   personalized and non-personalized responses.

### Best Practices

1. **Use a stable cache key per user**:
   ```typescript
   // React Query key includes user ID
   const { data } = useQuery({
     queryKey: ['recommendations', 'foryou', userId],
     queryFn: () => api.getForYouVideos(),
     staleTime: 60_000  // 1 minute -- feed changes slowly
   });
   ```

2. **Implement pull-to-refresh**: Users expect to refresh their feed manually. Invalidate
   the query on pull-to-refresh gestures.

3. **Preload the feed**: Fetch the "For You" feed on login or app startup so it is ready
   when the user navigates to it.

4. **Show loading skeletons, not spinners**: A feed that shows content shapes while loading
   feels faster than a blank page with a spinner.

5. **Track impressions**: Log which videos are shown to each user. This data feeds back into
   the preference vector computation and helps measure recommendation quality.

### Testing Tips

```python
# Test authenticated access
async def test_for_you_authenticated():
    response = await client.get(
        "/api/v1/recommendations/foryou",
        headers={"Authorization": f"Bearer {valid_token}"}
    )

    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "pagination" in data

# Test unauthenticated access
async def test_for_you_requires_auth():
    response = await client.get("/api/v1/recommendations/foryou")
    assert response.status_code == 401

# Test expired token
async def test_for_you_expired_token():
    response = await client.get(
        "/api/v1/recommendations/foryou",
        headers={"Authorization": f"Bearer {expired_token}"}
    )
    assert response.status_code == 401

# Test response structure matches video list schema
async def test_for_you_response_schema():
    response = await client.get(
        "/api/v1/recommendations/foryou",
        headers={"Authorization": f"Bearer {valid_token}"}
    )

    data = response.json()
    for video in data["data"]:
        assert "videoid" in video
        assert "name" in video
        assert "userid" in video
        assert "added_date" in video

# Test that stub returns same results for different users
# (Remove this test when personalization is enabled)
async def test_stub_returns_same_for_all_users():
    response_a = await client.get(
        "/api/v1/recommendations/foryou",
        headers={"Authorization": f"Bearer {user_a_token}"}
    )
    response_b = await client.get(
        "/api/v1/recommendations/foryou",
        headers={"Authorization": f"Bearer {user_b_token}"}
    )

    assert response_a.json()["data"] == response_b.json()["data"]
```

### curl Examples

```bash
# Authenticated request
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/recommendations/foryou"

# Without auth (expect 401)
curl -v "http://localhost:8080/api/v1/recommendations/foryou"
```

## Related Endpoints

- [POST /api/v1/reco/ingest](./POST_reco_ingest.md) - Ingest video embeddings for recommendations
- [GET /api/v1/search/videos](../search/GET_search_videos.md) - Text/semantic search (same vector infrastructure)
- [GET /api/v1/users/{user_id}/activity](../user_activity/GET_user_activity.md) - Activity that feeds preferences

## Further Learning

- [Recommendation Systems Overview](https://en.wikipedia.org/wiki/Recommender_system)
- [Content-Based vs Collaborative Filtering](https://developers.google.com/machine-learning/recommendation/collaborative/basics)
- [Cold Start Problem](https://en.wikipedia.org/wiki/Cold_start_(recommender_systems))
- [Filter Bubble](https://en.wikipedia.org/wiki/Filter_bubble)
- [Vector Search in Cassandra](https://cassandra.apache.org/doc/latest/cassandra/vector-search.html)
