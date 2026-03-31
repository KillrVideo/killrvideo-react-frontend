# POST /api/v1/videos/preview - Preview YouTube URL Title

## Overview

This endpoint accepts a YouTube URL and returns the video's title. It is used by the "Submit Video" form to auto-populate the video name field before the user finalizes their submission.

**Why it exists**: When a user pastes a YouTube URL into the submission form, the UI should immediately show the video's actual title rather than forcing the user to type it manually. This endpoint handles the title lookup server-side to avoid CORS issues and to keep any API keys hidden from the browser.

**Key characteristic**: This is one of the few endpoints that involves **no database interaction at all**. It is purely a proxy/helper endpoint that fetches metadata from YouTube (or a mock service in development).

## HTTP Details

- **Method**: POST
- **Path**: `/api/v1/videos/preview`
- **Auth Required**: No (public endpoint)
- **Success Status**: 200 OK
- **Handler**: `app/api/v1/endpoints/video_catalog.py`

### Request Body

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `youtubeUrl` | string | Yes | A valid YouTube video URL |
| `title` | string | No | Optional pre-fetched title (ignored by preview) |

**Note**: The request uses the `VideoSubmitRequest` schema, which also includes an optional `title` field. The preview endpoint only cares about `youtubeUrl`.

### Response Body

```json
{
  "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The video's title as retrieved from YouTube |

### Error Responses

| Status | Condition |
|--------|-----------|
| 422 | Missing or empty `youtubeUrl` field |

## Cassandra Concepts Explained

### No Database Involved

This endpoint is an exception in the KillrVideo API -- it does not touch Cassandra at all. There are no reads, no writes, and no tables involved.

**Why document it anyway?** Understanding which endpoints avoid the database is valuable for several reasons:

1. **Performance characteristics differ**: No database means no network hop to Cassandra, but there is a network hop to YouTube's servers instead
2. **Failure modes differ**: This endpoint can fail due to YouTube being unreachable, not Cassandra issues
3. **Caching opportunities**: YouTube titles rarely change, making this a great candidate for server-side caching

### Architectural Pattern: Backend-for-Frontend (BFF)

This endpoint follows the **Backend-for-Frontend** pattern. Instead of the browser calling YouTube directly:

```
Without BFF:
  Browser → YouTube API (CORS blocked, API key exposed)

With BFF:
  Browser → KillrVideo Backend → YouTube API (no CORS, key hidden)
```

**Benefits**:
- No CORS issues (same-origin request from browser to backend)
- API keys stay on the server (never sent to the browser)
- Backend can add caching, rate limiting, and validation
- Frontend code stays simple

## Data Model

No database tables are involved in this endpoint.

### YouTube URL Parsing

The backend extracts the YouTube video ID from various URL formats:

| URL Format | Video ID |
|------------|----------|
| `https://www.youtube.com/watch?v=dQw4w9WgXcQ` | `dQw4w9WgXcQ` |
| `https://youtu.be/dQw4w9WgXcQ` | `dQw4w9WgXcQ` |
| `https://www.youtube.com/embed/dQw4w9WgXcQ` | `dQw4w9WgXcQ` |
| `https://m.youtube.com/watch?v=dQw4w9WgXcQ` | `dQw4w9WgXcQ` |

The video ID is an 11-character alphanumeric string that YouTube uses to identify each video.

## Database Queries

### No Queries

This endpoint performs zero database queries. The entire flow is:

1. Parse the YouTube URL
2. Fetch the title from YouTube (or the mock service)
3. Return the title

### Mock YouTube Service

In development and testing, KillrVideo uses a `MockYouTubeService` instead of calling the real YouTube API:

```python
class MockYouTubeService:
    async def fetch_video_title(self, youtube_url: str) -> str:
        # Extract video ID from URL
        video_id = extract_youtube_id(youtube_url)

        # Return a deterministic mock title
        return f"Video {video_id}"
```

**Why a mock?**
- No YouTube API key needed for development
- Deterministic responses for testing
- No rate limiting concerns
- Works offline

### Production YouTube Service (Future)

```python
class YouTubeService:
    async def fetch_video_title(self, youtube_url: str) -> str:
        video_id = extract_youtube_id(youtube_url)

        # Call YouTube Data API v3
        response = await http_client.get(
            f"https://www.googleapis.com/youtube/v3/videos",
            params={
                "id": video_id,
                "part": "snippet",
                "key": settings.YOUTUBE_API_KEY
            }
        )

        data = response.json()
        return data["items"][0]["snippet"]["title"]
```

**Performance**: **100-300ms** (external HTTP call to YouTube API).

## Implementation Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. Client sends POST /api/v1/videos/preview              │
│    { "youtubeUrl": "https://youtube.com/watch?v=..." }  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. FastAPI Endpoint                                      │
│    ├─ Validates request body (Pydantic)                 │
│    └─ Extracts YouTube URL from payload                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Parse YouTube URL                                     │
│    ├─ Extract video ID (e.g., "dQw4w9WgXcQ")           │
│    └─ Validate URL format                               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Fetch Title                                           │
│    ├─ Dev: MockYouTubeService returns mock title         │
│    └─ Prod: YouTube Data API v3 (HTTP GET)              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Return 200 OK                                         │
│    { "title": "Video Title Here" }                      │
└─────────────────────────────────────────────────────────┘
```

**Code Flow**:
1. **Endpoint** receives the YouTube URL in the request body
2. **Validation** ensures the URL is present and non-empty
3. **URL Parsing** extracts the 11-character video ID
4. **Title Fetch** calls the YouTube service (mock or real)
5. **Response** returns the title as a simple JSON object

## Special Notes

### 1. POST Instead of GET

This endpoint uses POST even though it is a read-only operation. This is unusual but intentional:

- **Why not GET?** URLs can be very long and contain special characters. Putting them in query parameters requires encoding and risks hitting URL length limits.
- **POST body** allows clean JSON payloads without URL encoding concerns
- **Semantic compromise**: While not RESTful purist, it is a pragmatic choice for URL-as-input endpoints

### 2. No Authentication Required

Preview is intentionally unauthenticated. A user should be able to check a video title before deciding to log in and submit it. This reduces friction in the submission flow.

### 3. Request Schema Reuse

The endpoint reuses the `VideoSubmitRequest` schema (the same one used by the video submission endpoint). This means the request body can include a `title` field, but the preview endpoint ignores it. Only `youtubeUrl` matters.

### 4. Mock Service Behavior

The `MockYouTubeService` returns predictable titles based on the video ID:

```
Input URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ
Mock title: "Video dQw4w9WgXcQ"
```

This is helpful for testing because the response is deterministic. You always know what to expect.

### 5. Rate Limiting Considerations

In production with a real YouTube API:
- YouTube Data API has a daily quota (10,000 units by default)
- Each video lookup costs 1 unit
- The backend should cache titles (YouTube titles rarely change)
- Consider a TTL cache: `{ video_id: title }` with 24-hour expiry

### 6. Error Handling for Invalid URLs

If the URL is not a valid YouTube URL, the behavior depends on the implementation:
- **Mock service**: May return a generic title or raise an error
- **Production service**: YouTube API returns an empty `items` array for invalid video IDs

## Developer Tips

### Common Pitfalls

1. **Calling preview before the user finishes typing**: Debounce the preview call. Wait 500-1000ms after the user stops typing before calling the endpoint.

2. **Not handling mock titles in the UI**: In development, titles look like "Video abc123". Do not mistake this for a bug -- it is the mock service.

3. **Assuming the title is the final name**: The preview title pre-fills the name field, but the user can edit it. Always use the user-submitted title for the final video submission.

4. **Forgetting to handle network errors**: Since this calls an external service (YouTube), it can fail independently of the database. Always show a fallback UI if the preview fails.

5. **Sending credentials unnecessarily**: This is a public endpoint. Do not send the Authorization header -- it adds unnecessary overhead and couples the preview to auth state.

### Best Practices

1. **Debounce on paste**: Trigger the preview call when the user pastes a URL, not on every keystroke:
   ```typescript
   const handlePaste = async (e: ClipboardEvent) => {
     const url = e.clipboardData?.getData('text');
     if (isYouTubeUrl(url)) {
       const { title } = await api.previewVideo(url);
       setVideoName(title);
     }
   };
   ```

2. **Show a loading indicator**: The preview can take 100-300ms in production. Show a spinner in the name field while fetching.

3. **Allow manual override**: Always let the user edit the auto-filled title. Some users prefer custom titles.

4. **Validate URL format client-side first**: Before calling the API, check that the URL matches a YouTube pattern. This avoids unnecessary network requests.

5. **Cache responses in React Query**: Use the YouTube URL as the query key:
   ```typescript
   useQuery(['video-preview', youtubeUrl], () => api.previewVideo(youtubeUrl))
   ```

### Performance Expectations

| Scenario | Latency | Notes |
|----------|---------|-------|
| Mock service (development) | **< 5ms** | No network call |
| YouTube API (production) | **100-300ms** | External HTTP call |
| YouTube API with cache hit | **< 5ms** | Server-side cache |
| YouTube API rate limited | **Error** | Daily quota exceeded |

### Testing Tips

```bash
# Preview a YouTube URL
curl -s -X POST "http://localhost:8080/api/v1/videos/preview" \
  -H "Content-Type: application/json" \
  -d '{"youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' | jq

# Test with short URL format
curl -s -X POST "http://localhost:8080/api/v1/videos/preview" \
  -H "Content-Type: application/json" \
  -d '{"youtubeUrl": "https://youtu.be/dQw4w9WgXcQ"}' | jq

# Test with missing URL (should return 422)
curl -s -X POST "http://localhost:8080/api/v1/videos/preview" \
  -H "Content-Type: application/json" \
  -d '{}' | jq

# Test with empty URL (should return 422)
curl -s -X POST "http://localhost:8080/api/v1/videos/preview" \
  -H "Content-Type: application/json" \
  -d '{"youtubeUrl": ""}' | jq
```

## Related Endpoints

- [POST /api/v1/videos](./POST_videos.md) - Submit the video after previewing the title
- [GET /api/v1/videos/id/{video_id}](./GET_video_by_id.md) - View the submitted video's full details

## Further Learning

- [YouTube Data API v3](https://developers.google.com/youtube/v3/docs/videos/list)
- [Backend-for-Frontend Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends)
- [CORS Explained](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
