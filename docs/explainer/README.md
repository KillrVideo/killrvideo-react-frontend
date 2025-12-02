# KillrVideo API Endpoint Explainers

Welcome to the KillrVideo endpoint explainer documentation! This collection of guides is designed to help developers learn Cassandra and Astra DB by exploring real-world API implementations.

## What You'll Learn

Each explainer document covers:
- **How the endpoint works** - What it does and why
- **Cassandra fundamentals** - Partition keys, clustering columns, and data modeling concepts
- **Database queries** - The actual CQL/AstraPy code that executes
- **Astra DB features** - Vector search, SAI indexes, and other advanced capabilities
- **Implementation patterns** - Best practices and common pitfalls

## Target Audience

These guides are written for **developers learning Cassandra** who want to see how database concepts apply in production applications. We assume basic programming knowledge but explain all Cassandra-specific concepts.

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
- [GET /api/v1/videos/id/{video_id}/status](./video_catalog/GET_videos_status.md) - Check video processing status
- [GET /api/v1/videos/id/{video_id}](./video_catalog/GET_videos_details.md) - Get full video details
- [PUT /api/v1/videos/id/{video_id}](./video_catalog/PUT_videos.md) - Update video metadata
- [POST /api/v1/videos/id/{video_id}/view](./video_catalog/POST_videos_view.md) - Record video view
- [GET /api/v1/videos/latest](./video_catalog/GET_videos_latest.md) - Get latest videos (paginated)
- [GET /api/v1/videos/by-tag/{tag}](./video_catalog/GET_videos_by_tag.md) - Filter videos by tag
- [GET /api/v1/videos/by-uploader/{user_id}](./video_catalog/GET_videos_by_uploader.md) - Get videos by uploader
- [POST /api/v1/videos/id/{video_id}/rating](./video_catalog/POST_videos_rating.md) - Submit 1-5 star rating
- [GET /api/v1/videos/id/{video_id}/rating](./video_catalog/GET_videos_rating.md) - Get rating summary
- [GET /api/v1/videos/id/{video_id}/related](./video_catalog/GET_videos_related.md) - Get related videos
- [GET /api/v1/videos/trending](./video_catalog/GET_videos_trending.md) - Get trending videos by views
- [POST /api/v1/videos/preview](./video_catalog/POST_videos_preview.md) - Preview YouTube video title

**Key Concepts**: Denormalized tables, time-series data modeling, counter patterns, SAI for filtering, background processing

---

### Search & Discovery
Full-text and semantic search capabilities.

- [GET /api/v1/search/videos](./search/GET_search_videos.md) - Search videos (keyword or semantic)
- [GET /api/v1/search/tags/suggest](./search/GET_search_tags_suggest.md) - Autocomplete tag suggestions

**Key Concepts**: Vector search with NVIDIA embeddings, SAI text indexes, similarity scoring, semantic vs keyword search

---

### Comments & Ratings
User-generated content and engagement.

- [POST /api/v1/videos/{video_id}/comments](./comments_ratings/POST_videos_comments.md) - Add comment to video
- [GET /api/v1/videos/{video_id}/comments](./comments_ratings/GET_videos_comments.md) - List comments for video
- [GET /api/v1/users/{user_id}/comments](./comments_ratings/GET_users_comments.md) - List comments by user
- [POST /api/v1/videos/{video_id}/ratings](./comments_ratings/POST_videos_ratings.md) - Rate video 1-5
- [GET /api/v1/videos/{video_id}/ratings](./comments_ratings/GET_videos_ratings.md) - Get rating summary

**Key Concepts**: Denormalization for multiple query patterns, TimeUUID for ordering, counter aggregation, upsert patterns

---

### Recommendations
Personalized content recommendations.

- [GET /api/v1/recommendations/foryou](./recommendations/GET_recommendations_foryou.md) - Get personalized feed
- [POST /api/v1/reco/ingest](./recommendations/POST_reco_ingest.md) - Ingest video embeddings

**Key Concepts**: Vector similarity search, ML integration patterns, embedding storage

---

### Content Flags
User-initiated content moderation.

- [POST /api/v1/flags](./flags/POST_flags.md) - Flag video or comment for moderation

**Key Concepts**: Composite primary keys, status tracking, moderation workflows

---

### Moderation
Moderator tools for content and user management.

- [GET /api/v1/moderation/flags](./moderation/GET_moderation_flags.md) - List all flags
- [GET /api/v1/moderation/flags/{flag_id}](./moderation/GET_moderation_flag_details.md) - Get flag details
- [POST /api/v1/moderation/flags/{flag_id}/action](./moderation/POST_moderation_flag_action.md) - Take action on flag
- [GET /api/v1/moderation/users](./moderation/GET_moderation_users.md) - Search users
- [POST /api/v1/moderation/users/{user_id}/assign-moderator](./moderation/POST_moderation_assign_moderator.md) - Promote to moderator
- [POST /api/v1/moderation/users/{user_id}/revoke-moderator](./moderation/POST_moderation_revoke_moderator.md) - Revoke moderator role
- [POST /api/v1/moderation/videos/{video_id}/restore](./moderation/POST_moderation_videos_restore.md) - Restore deleted video
- [POST /api/v1/moderation/comments/{comment_id}/restore](./moderation/POST_moderation_comments_restore.md) - Restore deleted comment

**Key Concepts**: Role-based access control, soft deletes, state transitions, administrative operations

---

### Future Enhancements

- [BM25 Full-Text Search Roadmap](./future/bm25_search_roadmap.md) - How to add BM25 search to Astra DB

---

## Understanding the Code References

Throughout these explainers, you'll see references like `app/services/video_service.py:145`. These point to specific locations in the source code where you can see the implementation details.

## Getting Started

1. **New to Cassandra?** Start with [POST /api/v1/users/register](./account_management/POST_users_register.md) - it covers fundamental concepts like partition keys and primary key lookups.

2. **Want to see advanced features?** Check out [GET /api/v1/search/videos](./search/GET_search_videos.md) for vector search or [GET /api/v1/videos/latest](./video_catalog/GET_videos_latest.md) for time-series modeling.

3. **Learning data modeling?** Compare [GET /api/v1/videos/{video_id}/comments](./comments_ratings/GET_videos_comments.md) and [GET /api/v1/users/{user_id}/comments](./comments_ratings/GET_users_comments.md) to understand denormalization.

## Additional Resources

- [Complete Database Schema](../schema-astra.cql) - Full CQL schema with indexes
- [Main README](../../README.md) - Setup and running the application
- [Vector Search Architecture](../vector_search.md) - Deep dive on semantic search
- [OpenAPI Specification](../killrvideo_openapi.yaml) - Complete API reference

## Contributing

Found an error or have suggestions? This is a living educational resource. Feel free to suggest improvements!
