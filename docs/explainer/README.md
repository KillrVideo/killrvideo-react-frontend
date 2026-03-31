# KillrVideo API Endpoint Explainers

Welcome to the KillrVideo endpoint explainer documentation! This collection of guides is designed to help developers learn Cassandra and Astra DB by exploring real-world API implementations.

## What You'll Learn

Each explainer document covers:
- **How the endpoint works** - What it does and why
- **Cassandra fundamentals** - Partition keys, clustering columns, and data modeling concepts
- **Database queries in 3 modes** - CQL, Data API, and Table API examples
- **Driver examples in 5 languages** - Python, Node.js, Java, C#, and Go
- **Astra DB features** - Vector search, SAI indexes, and other advanced capabilities
- **Implementation patterns** - Best practices and common pitfalls

## Target Audience

These guides are written for **developers learning Cassandra** who want to see how database concepts apply in production applications. We assume basic programming knowledge but explain all Cassandra-specific concepts.

## Query Mode Reference

Each explainer shows database operations in three modes:

| Mode | Description | Client Library |
|------|-------------|----------------|
| **CQL** | Native Cassandra Query Language | cassandra-driver (Python/Node.js/Java/C#/Go) |
| **Data API** | Collection-style JSON operations | astrapy Collection (Python), @datastax/astra-db-ts (Node.js), astra-db-java (Java) |
| **Table API** | Table-style operations via HTTP | astrapy Table (Python), @datastax/astra-db-ts (Node.js), astra-db-java (Java) |

**Note**: C# and Go currently only have CQL drivers. Data/Table API access from these languages is available via direct REST calls.

## API Endpoint Index

### Account Management
User registration, authentication, and profile management.

- [POST /api/v1/users/register](./account_management/POST_users_register.md) - Create new user account
- [POST /api/v1/users/login](./account_management/POST_users_login.md) - Authenticate and get JWT token
- [GET /api/v1/users/me](./account_management/GET_users_me.md) - Get current user profile
- [PUT /api/v1/users/me](./account_management/PUT_users_me.md) - Update current user profile
- [GET /api/v1/users/{user_id}](./account_management/GET_users_by_id.md) - Get public user profile

**Key Concepts**: Primary key lookups, secondary indexes (SAI), authentication patterns, denormalized credentials table

---

### Video Catalog
Core video management, submission, metadata, and statistics.

- [POST /api/v1/videos](./video_catalog/POST_videos.md) - Submit YouTube URL for processing
- [GET /api/v1/videos/id/{video_id}](./video_catalog/GET_video_by_id.md) - Get full video details
- [PUT /api/v1/videos/id/{video_id}](./video_catalog/PUT_video.md) - Update video metadata
- [GET /api/v1/videos/id/{video_id}/status](./video_catalog/GET_video_status.md) - Check video processing status
- [GET /api/v1/videos/latest](./video_catalog/GET_videos_latest.md) - Get latest videos (paginated)
- [GET /api/v1/videos/trending](./video_catalog/GET_videos_trending.md) - Get trending videos by views
- [GET /api/v1/videos/by-tag/{tag}](./video_catalog/GET_videos_by_tag.md) - Filter videos by tag
- [GET /api/v1/videos/by-uploader/{user_id}](./video_catalog/GET_videos_by_uploader.md) - Get videos by uploader
- [GET /api/v1/videos/id/{video_id}/related](./video_catalog/GET_video_related.md) - Get related videos
- [POST /api/v1/videos/preview](./video_catalog/POST_video_preview.md) - Preview YouTube video title
- [POST /api/v1/videos/id/{video_id}/view](./video_catalog/POST_video_view.md) - Record playback view
- [POST /api/v1/videos/id/{video_id}/rating](./video_catalog/POST_video_rating.md) - Submit 1-5 star rating
- [GET /api/v1/videos/id/{video_id}/rating](./video_catalog/GET_video_rating.md) - Get rating summary

**Key Concepts**: Denormalized tables, time-series data modeling, counter patterns, SAI for filtering, background processing, IBM Granite embeddings

---

### Search & Discovery
Full-text and semantic search capabilities.

- [GET /api/v1/search/videos](./search/GET_search_videos.md) - Search videos (keyword or semantic)
- [GET /api/v1/search/tags/suggest](./search/GET_tags_suggest.md) - Autocomplete tag suggestions

**Key Concepts**: Vector search with IBM Granite embeddings, SAI text indexes, similarity scoring, semantic vs keyword search

---

### Comments & Ratings
User-generated content and engagement.

- [POST /api/v1/videos/{video_id}/comments](./comments_ratings/POST_comment.md) - Add comment to video
- [GET /api/v1/videos/{video_id}/comments](./comments_ratings/GET_comments_by_video.md) - List comments for video
- [GET /api/v1/users/{user_id}/comments](./comments_ratings/GET_comments_by_user.md) - List comments by user
- [POST /api/v1/videos/{video_id}/ratings](./comments_ratings/POST_rating.md) - Rate video 1-5
- [GET /api/v1/videos/{video_id}/ratings](./comments_ratings/GET_ratings_summary.md) - Get rating summary

**Key Concepts**: Denormalization for multiple query patterns, TimeUUID for ordering, counter aggregation, upsert patterns

---

### Recommendations
Personalized content recommendations.

- [GET /api/v1/recommendations/foryou](./recommendations/GET_for_you.md) - Get personalized feed
- [POST /api/v1/reco/ingest](./recommendations/POST_reco_ingest.md) - Ingest video embeddings

**Key Concepts**: Vector similarity search, ML integration patterns, embedding storage

---

### User Activity
User engagement tracking and timelines.

- [GET /api/v1/users/{user_id}/activity](./user_activity/GET_user_activity.md) - Get activity timeline

**Key Concepts**: Composite partition key, concurrent partition queries, time-series with bounded partitions

---

### Content Flags
User-initiated content moderation.

- [POST /api/v1/flags](./flags/POST_flag.md) - Flag video or comment for moderation

**Key Concepts**: Composite primary keys, status tracking, moderation workflows

---

### Moderation
Moderator tools for content and user management.

- [GET /api/v1/moderation/flags](./moderation/GET_flags.md) - List all flags
- [GET /api/v1/moderation/flags/{flag_id}](./moderation/GET_flag_detail.md) - Get flag details
- [POST /api/v1/moderation/flags/{flag_id}/action](./moderation/POST_flag_action.md) - Take action on flag
- [GET /api/v1/moderation/users](./moderation/GET_users.md) - Search users
- [POST /api/v1/moderation/users/{user_id}/assign-moderator](./moderation/POST_assign_moderator.md) - Promote to moderator
- [POST /api/v1/moderation/users/{user_id}/revoke-moderator](./moderation/POST_revoke_moderator.md) - Revoke moderator role
- [POST /api/v1/moderation/videos/{video_id}/restore](./moderation/POST_restore_video.md) - Restore deleted video
- [POST /api/v1/moderation/comments/{comment_id}/restore](./moderation/POST_restore_comment.md) - Restore deleted comment

**Key Concepts**: Role-based access control, soft deletes, state transitions, administrative operations

---

### Future Enhancements

- [BM25 Full-Text Search Roadmap](./future/bm25_search_roadmap.md) - How to add BM25 search to Astra DB

---

## Understanding the Code References

Throughout these explainers, you'll see references like `app/services/video_service.py:145`. These point to specific locations in the [Python FastAPI backend](https://github.com/KillrVideo/kv-be-python-fastapi-dataapi-table) source code.

## Getting Started

1. **New to Cassandra?** Start with [POST /api/v1/users/register](./account_management/POST_users_register.md) - it covers fundamental concepts like partition keys and primary key lookups.

2. **Want to see advanced features?** Check out [GET /api/v1/search/videos](./search/GET_search_videos.md) for vector search or [GET /api/v1/videos/latest](./video_catalog/GET_videos_latest.md) for time-series modeling.

3. **Learning data modeling?** Compare [GET /api/v1/videos/{video_id}/comments](./comments_ratings/GET_comments_by_video.md) and [GET /api/v1/users/{user_id}/comments](./comments_ratings/GET_comments_by_user.md) to understand denormalization.

4. **Interested in ML integration?** See [GET /api/v1/search/videos](./search/GET_search_videos.md) for IBM Granite embeddings and [GET /api/v1/recommendations/foryou](./recommendations/GET_for_you.md) for the recommendation pipeline.

## Additional Resources

- [Complete Database Schema](../../killrvideo-data/schema-astra.cql) - Full CQL schema with indexes
- [Main README](../../README.md) - Setup and running the application
- [OpenAPI Specification](../killrvideo_openapi.yaml) - Complete API reference
