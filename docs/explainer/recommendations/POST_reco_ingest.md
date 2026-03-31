# POST /api/v1/reco/ingest - Ingest Video Embedding

## Overview

This endpoint accepts a pre-computed embedding vector for a video and stores it for use in
recommendations and semantic search. It is the entry point for the machine learning pipeline
to push embeddings into the KillrVideo database.

**Why it exists**: In a real production system, embedding generation happens asynchronously.
A video is uploaded, metadata is stored immediately, and then a background ML pipeline
computes the content embedding (from the video's title, description, tags, transcript, or
even visual frames). Once the embedding is ready, the pipeline calls this endpoint to persist
it. This decouples the upload latency from the embedding computation time.

**Current status**: This endpoint is a **stub**. It validates that the referenced video
exists and returns 202 Accepted, but it does not persist the embedding vector. The real
implementation would write the vector to `videos.content_features`.

**Why 202 and not 200?** HTTP 202 means "accepted for processing" -- the server acknowledges
receipt but does not guarantee the work is complete. This is the correct status for an
ingestion endpoint because the caller does not need to wait for the vector to be written to
disk. Even in the stub version, 202 sets the right expectation for API consumers.

## HTTP Details

- **Method**: POST
- **Path**: `/api/v1/reco/ingest`
- **Auth Required**: Yes (creator role required)
- **Success Status**: 202 Accepted

### Request

```http
POST /api/v1/reco/ingest
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

### Request Body

```json
{
  "videoid": "550e8400-e29b-41d4-a716-446655440000",
  "embedding": [0.023, -0.871, 0.445, ..., 0.112]
}
```

| Field       | Type          | Required | Description                                  |
|-------------|---------------|----------|----------------------------------------------|
| `videoid`   | string (UUID) | Yes      | UUID of the video to attach the embedding to |
| `embedding` | array[float]  | Yes      | 384-dimensional float vector                 |

**Embedding constraints**:
- Must be exactly 384 floats (matching IBM Granite-Embedding-30m-English output).
- Each float should be in a reasonable range (typically -1.0 to 1.0, but not enforced).
- The vector should be L2-normalized for best cosine similarity results.

### Success Response (202 Accepted)

```json
{
  "status": "accepted",
  "videoid": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Embedding received for processing."
}
```

### Error Responses

| Status | Condition                          | Example Body                                    |
|--------|------------------------------------|-------------------------------------------------|
| 401    | Missing or invalid JWT             | `{"detail": "Not authenticated"}`               |
| 403    | User does not have creator role    | `{"detail": "Creator role required"}`           |
| 404    | Video not found                    | `{"detail": "Video not found"}`                 |
| 422    | Invalid request body               | `{"detail": "embedding must have 384 dimensions"}` |
| 422    | Missing required field             | `{"detail": "videoid is required"}`             |
| 500    | Database error                     | `{"detail": "Internal server error"}`           |

## Cassandra Concepts Explained

### Vector Storage in Cassandra

Cassandra 5.0 introduced the `vector<float, N>` data type, which stores a fixed-length array
of floating-point numbers as a single column value. This is not a blob or a serialized list --
it is a first-class type that Cassandra understands and can index.

**Analogy**: Think of a vector column as a GPS coordinate, but instead of 2 numbers (latitude
and longitude), you have 384 numbers. Just as a GPS index lets you find nearby locations, a
vector index lets you find nearby embeddings.

```cql
-- The content_features column stores the video's embedding
CREATE TABLE killrvideo.videos (
    videoid uuid PRIMARY KEY,
    content_features vector<float, 384>,
    ...
);
```

**What gets stored on disk**:
```
Row for video 550e8400:
  content_features = [0.023, -0.871, 0.445, ..., 0.112]
                      |<---------- 384 floats ---------->|
                      |<---------- ~1,536 bytes -------->|
```

### Embedding Ingestion Patterns

There are two main patterns for getting embeddings into the database:

**Pattern A: Synchronous (current KillrVideo approach for search)**

```
Upload video --> Generate embedding --> Store video + embedding
                 (blocking, ~200ms)
```

Pros: Simple, no eventual consistency issues.
Cons: Upload latency includes embedding time.

**Pattern B: Asynchronous (what this endpoint enables)**

```
Upload video --> Store video (no embedding) --> Return to user
                        |
                        v
              ML pipeline picks up new video
                        |
                        v
              Generate embedding (~200ms-10s depending on model)
                        |
                        v
              POST /api/v1/reco/ingest --> Store embedding
```

Pros: Upload is fast, ML pipeline can be complex (multi-modal, GPU-intensive).
Cons: Window where video has no embedding (invisible to vector search).

This endpoint supports Pattern B. Both patterns can coexist: search embeddings are generated
synchronously during upload, while richer recommendation embeddings are computed
asynchronously.

### Idempotency

Writing the same embedding twice for the same video is safe. Cassandra UPSERTs by default --
writing to an existing primary key overwrites the previous value. This makes the ingestion
endpoint naturally idempotent.

```cql
-- First write
UPDATE videos SET content_features = [0.1, 0.2, ...] WHERE videoid = 550e8400-...;

-- Second write (same video, same or different embedding) -- just overwrites
UPDATE videos SET content_features = [0.3, 0.4, ...] WHERE videoid = 550e8400-...;
```

The ML pipeline can safely retry failed ingestion calls without creating duplicates.

### Why the Creator Role?

Only users with the "creator" role should be able to modify video embeddings. A regular viewer
calling this endpoint could overwrite legitimate embeddings with garbage vectors, degrading
search and recommendation quality for everyone.

Role-based access control (RBAC) at the API level prevents this. The JWT token includes the
user's role, and the endpoint checks for "creator" before proceeding.

## Data Model

### Table: `videos` (embedding target)

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
```

The `content_features` column is the target for ingestion. When this endpoint is fully
implemented, it will UPDATE this column for the specified video.

### Index: Vector Search (SAI)

```cql
CREATE CUSTOM INDEX videos_content_features_idx
ON killrvideo.videos(content_features)
USING 'StorageAttachedIndex'
WITH OPTIONS = { 'similarity_function': 'COSINE' };
```

**Important**: When an embedding is written or updated, the SAI index is updated
automatically during the next compaction cycle. There is no manual reindexing step. However,
there may be a brief delay (seconds to minutes) between writing the embedding and it appearing
in ANN search results.

### Storage Impact

| Scenario              | Size per Write | Notes                            |
|-----------------------|----------------|----------------------------------|
| New embedding         | ~1.5 KB        | 384 floats x 4 bytes            |
| Updated embedding     | ~1.5 KB        | Overwrites previous (tombstone)  |
| Index update (SAI)    | ~0.5 KB (est.) | Graph node insertion/update      |
| **Total per ingest**  | **~2 KB**      | Negligible at any scale          |

## Database Queries

### Current Implementation (Stub)

**Service Function**: `recommendation_service.ingest_video_embedding()`

```python
async def ingest_video_embedding(videoid: UUID, embedding: List[float]):
    """
    Stub: Validates video exists, acknowledges receipt.
    Does NOT persist the embedding.
    """
    # Step 1: Verify video exists
    videos_table = await get_table("videos")
    video = await videos_table.find_one(filter={"videoid": str(videoid)})

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Step 2: Acknowledge receipt (stub -- no persistence)
    return {
        "status": "accepted",
        "videoid": str(videoid),
        "message": "Embedding received for processing."
    }
```

**Equivalent CQL** (validation query only):
```cql
SELECT videoid FROM killrvideo.videos
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
```

### Future Implementation (Persistent)

```python
async def ingest_video_embedding(videoid: UUID, embedding: List[float]):
    """
    Future: Validate and persist the embedding.
    """
    # Step 1: Validate embedding dimensions
    if len(embedding) != 384:
        raise HTTPException(
            status_code=422,
            detail=f"Embedding must have 384 dimensions, got {len(embedding)}"
        )

    # Step 2: Verify video exists
    videos_table = await get_table("videos")
    video = await videos_table.find_one(filter={"videoid": str(videoid)})

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Step 3: Persist the embedding
    await videos_table.update_one(
        filter={"videoid": str(videoid)},
        update={"$set": {"content_features": embedding}}
    )

    return {
        "status": "accepted",
        "videoid": str(videoid),
        "message": "Embedding stored successfully."
    }
```

**Future CQL**:
```cql
-- Verify video exists
SELECT videoid FROM killrvideo.videos
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;

-- Store embedding
UPDATE killrvideo.videos
SET content_features = [0.023, -0.871, 0.445, ..., 0.112]
WHERE videoid = 550e8400-e29b-41d4-a716-446655440000;
```

**Performance**: ~5-10 ms (single partition key lookup + single partition key update)

### Batch Ingestion Consideration

If the ML pipeline generates embeddings in bulk (e.g., 1000 videos at a time), it should
call this endpoint in parallel, not sequentially:

```python
# ML pipeline: ingest 1000 embeddings concurrently
import asyncio
import aiohttp

async def batch_ingest(embeddings: List[dict]):
    async with aiohttp.ClientSession() as session:
        tasks = [
            session.post(
                "http://api/v1/reco/ingest",
                json={"videoid": e["videoid"], "embedding": e["vector"]},
                headers={"Authorization": f"Bearer {token}"}
            )
            for e in embeddings
        ]
        responses = await asyncio.gather(*tasks)
        # All should return 202
```

Cassandra handles concurrent writes well. There is no need to batch them into a single request.

## Implementation Flow

```
+-------------------------------------------------------------+
| 1. ML pipeline sends POST /api/v1/reco/ingest               |
|    Authorization: Bearer <creator_jwt>                       |
|    Body: { "videoid": "...", "embedding": [...] }            |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 2. Validate JWT and check creator role                      |
|    +-- Missing/invalid JWT? --> 401 Unauthorized            |
|    +-- Not creator role? --> 403 Forbidden                  |
|    +-- Valid creator? --> Continue                           |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 3. Validate request body                                    |
|    +-- Missing videoid? --> 422 Validation Error            |
|    +-- Missing embedding? --> 422 Validation Error          |
|    +-- Wrong dimensions? --> 422 (must be 384)              |
|    +-- Valid? --> Continue                                   |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 4. Verify video exists in database                          |
|    SELECT videoid FROM videos WHERE videoid = ?              |
|    +-- Not found? --> 404 Video not found                   |
|    +-- Found? --> Continue                                   |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 5. Store embedding (STUB: skip this step)                   |
|    UPDATE videos SET content_features = ?                    |
|    WHERE videoid = ?                                        |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 6. Return 202 Accepted                                      |
|    { "status": "accepted", "videoid": "...",                |
|      "message": "Embedding received for processing." }      |
+-------------------------------------------------------------+
```

**Current total queries**: 1 (video existence check)
**Future total queries**: 2 (existence check + embedding update)
**Expected latency**: Current ~5 ms, Future ~10 ms

## Special Notes

### 1. Embedding Dimension Validation

The embedding must be exactly 384 floats to match the `vector<float, 384>` column definition.
Cassandra will reject a vector with a different dimension count at the database level, but
validating early at the API level provides a clearer error message and avoids a wasted
database round-trip.

**Common dimension mismatches**:
| Model                          | Dimensions | Compatible? |
|--------------------------------|------------|-------------|
| IBM Granite-Embedding-30m      | 384        | Yes         |
| OpenAI text-embedding-ada-002  | 1536       | No          |
| NVIDIA NV-Embed-QA             | 4096       | No          |
| Sentence-BERT (all-MiniLM-L6)  | 384        | Yes         |

If you change the embedding model, you must also alter the table schema and re-embed all
existing videos.

### 2. Vector Normalization

For cosine similarity to work correctly, vectors should be L2-normalized (unit length). Most
embedding models output normalized vectors by default, but if you are generating embeddings
from a custom model, normalize them before ingestion:

```python
import numpy as np

def normalize(v):
    norm = np.linalg.norm(v)
    if norm == 0:
        return v
    return (v / norm).tolist()

# Before calling the ingest endpoint
embedding = normalize(raw_embedding)
```

**Why it matters**: Cosine similarity between normalized vectors equals their dot product,
which is what the SAI index optimizes for. Un-normalized vectors can produce unexpected
similarity scores.

### 3. Race Condition: Upload vs Ingest

If the synchronous upload path generates a search embedding (Pattern A) and the async
pipeline later ingests a different recommendation embedding (Pattern B) into the same
`content_features` column, the second write overwrites the first.

**Solutions**:
- Use a single embedding column and decide which pipeline "wins" (last write wins in
  Cassandra).
- Add a separate column for recommendation embeddings (e.g., `reco_features vector<float, 384>`)
  with its own SAI index.

The current stub avoids this issue by not persisting anything.

### 4. Security: Embedding Poisoning

A malicious actor with a stolen creator JWT could call this endpoint with carefully crafted
vectors that manipulate search rankings (e.g., making their video appear for unrelated
queries). Mitigations:

- Rate-limit ingestion calls per user.
- Validate that the embedding comes from a trusted ML pipeline (e.g., verify a pipeline
  signature in the request).
- Monitor for anomalous embedding patterns (vectors that are unusually far from the video's
  textual content).

### 5. Monitoring Ingestion Health

Track these metrics to ensure the pipeline is functioning:

| Metric                        | Healthy Value     | Alert Threshold              |
|-------------------------------|-------------------|------------------------------|
| Ingestion rate (calls/min)    | Matches upload rate | Drop > 50% for 10 min     |
| Ingestion latency (p99)       | < 50 ms           | > 200 ms                    |
| 404 rate (video not found)    | < 1%              | > 5%                         |
| 422 rate (validation errors)  | 0%                | Any non-zero                 |

### 6. Astra DB Considerations

On Astra DB, the `UPDATE ... SET content_features = ?` statement works identically to
self-hosted Cassandra 5.0. The SAI index updates are handled transparently by the managed
service. There are no special configuration requirements.

## Developer Tips

### Common Pitfalls

1. **Using the wrong embedding model**: The vector must be 384 dimensions from IBM Granite or
   a compatible model. Mixing models (e.g., using OpenAI embeddings for some videos and
   Granite for others) produces meaningless similarity scores because the vector spaces are
   incompatible.

2. **Forgetting to normalize**: If your model does not output normalized vectors, cosine
   similarity results will be skewed.

3. **Not handling 404 gracefully**: If the ML pipeline processes a video that has been deleted,
   the ingest call returns 404. The pipeline should log and skip, not crash.

4. **Sequential ingestion**: Sending embeddings one at a time wastes throughput. Use
   concurrent requests (10-50 at a time) for batch processing.

5. **Ignoring the stub nature**: In the current version, calling this endpoint does nothing
   beyond validation. Do not rely on it to populate `content_features` for search.

### Best Practices

1. **Implement retry with backoff**: Network failures happen. Use exponential backoff:
   ```python
   for attempt in range(3):
       response = await session.post(url, json=payload)
       if response.status in (202, 404, 422):
           break  # Success or permanent error
       await asyncio.sleep(2 ** attempt)  # 1s, 2s, 4s
   ```

2. **Log every ingestion**: Track which videos have embeddings and which do not. This helps
   diagnose search quality issues.

3. **Version your embeddings**: When changing models, store the model version alongside the
   embedding (or in a separate column). This lets you identify stale embeddings that need
   re-computation.

4. **Test with real embeddings**: Generate actual embeddings from your model for integration
   tests. Random float arrays will not produce meaningful similarity scores.

5. **Validate round-trip**: After ingesting an embedding, verify it by searching for the
   video's own content. It should appear as the top result with similarity close to 1.0.

### Testing Tips

```python
# Test successful ingestion (stub returns 202)
async def test_ingest_embedding():
    response = await client.post(
        "/api/v1/reco/ingest",
        headers={"Authorization": f"Bearer {creator_token}"},
        json={
            "videoid": str(existing_video_id),
            "embedding": [0.1] * 384  # Dummy 384-dim vector
        }
    )

    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "accepted"

# Test video not found
async def test_ingest_video_not_found():
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.post(
        "/api/v1/reco/ingest",
        headers={"Authorization": f"Bearer {creator_token}"},
        json={
            "videoid": fake_id,
            "embedding": [0.1] * 384
        }
    )
    assert response.status_code == 404

# Test wrong dimensions
async def test_ingest_wrong_dimensions():
    response = await client.post(
        "/api/v1/reco/ingest",
        headers={"Authorization": f"Bearer {creator_token}"},
        json={
            "videoid": str(existing_video_id),
            "embedding": [0.1] * 1536  # Wrong: 1536 instead of 384
        }
    )
    assert response.status_code == 422

# Test requires creator role
async def test_ingest_requires_creator():
    response = await client.post(
        "/api/v1/reco/ingest",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={
            "videoid": str(existing_video_id),
            "embedding": [0.1] * 384
        }
    )
    assert response.status_code == 403

# Test unauthenticated
async def test_ingest_requires_auth():
    response = await client.post(
        "/api/v1/reco/ingest",
        json={
            "videoid": str(existing_video_id),
            "embedding": [0.1] * 384
        }
    )
    assert response.status_code == 401

# Test idempotency (calling twice should be safe)
async def test_ingest_idempotent():
    payload = {
        "videoid": str(existing_video_id),
        "embedding": [0.1] * 384
    }
    headers = {"Authorization": f"Bearer {creator_token}"}

    r1 = await client.post("/api/v1/reco/ingest", headers=headers, json=payload)
    r2 = await client.post("/api/v1/reco/ingest", headers=headers, json=payload)

    assert r1.status_code == 202
    assert r2.status_code == 202
```

### curl Examples

```bash
# Ingest an embedding (creator auth required)
curl -X POST "http://localhost:8080/api/v1/reco/ingest" \
  -H "Authorization: Bearer $CREATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "videoid": "550e8400-e29b-41d4-a716-446655440000",
    "embedding": [0.023, -0.871, 0.445, 0.112]
  }'

# Generate a 384-dim dummy vector for testing
python3 -c "import json; print(json.dumps({'videoid':'550e8400-e29b-41d4-a716-446655440000','embedding':[0.1]*384}))" | \
  curl -X POST "http://localhost:8080/api/v1/reco/ingest" \
    -H "Authorization: Bearer $CREATOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d @-
```

## Related Endpoints

- [GET /api/v1/search/videos](../search/GET_search_videos.md) - Searches using the embeddings stored by this endpoint
- [GET /api/v1/recommendations/foryou](./GET_for_you.md) - Recommendations powered by stored embeddings
- [POST /api/v1/videos](../video_catalog/POST_videos.md) - Video creation (may generate initial embedding synchronously)

## Further Learning

- [Cassandra Vector Type](https://cassandra.apache.org/doc/latest/cassandra/vector-search.html)
- [IBM Granite Embedding Models](https://www.ibm.com/granite)
- [L2 Normalization Explained](https://en.wikipedia.org/wiki/Unit_vector)
- [Embedding Poisoning Attacks](https://arxiv.org/abs/2310.19228)
- [Async ML Pipeline Patterns](https://ml-ops.org/content/mlops-principles)
