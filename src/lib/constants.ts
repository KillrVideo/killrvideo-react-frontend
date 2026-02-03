/**
 * Cache timing constants for TanStack Query.
 * All values in milliseconds.
 */
export const CACHE_TIME = {
  /** No caching - always refetch */
  NONE: 0,

  /** Short cache for rapidly changing data (30 seconds) */
  SHORT: 1000 * 30,

  /** Medium cache for moderately changing data (5 minutes) */
  MEDIUM: 1000 * 60 * 5,

  /** Long cache for slowly changing data (1 hour) */
  LONG: 1000 * 60 * 60,

  /** Very long cache for rarely changing data (24 hours) */
  VERY_LONG: 1000 * 60 * 60 * 24,

  /** Never stale - only refetch on explicit invalidation */
  INFINITE: Infinity,
} as const;

/**
 * Recommended cache times by data type.
 * Maps semantic data categories to appropriate cache durations.
 */
export const CACHE_STRATEGY = {
  /** User profile - rarely changes, cache for session length (24h max to prevent memory leaks) */
  USER_PROFILE: CACHE_TIME.VERY_LONG,

  /** Public user info - changes infrequently */
  USER_PUBLIC: CACHE_TIME.LONG,

  /** Video metadata - moderately stable */
  VIDEO: CACHE_TIME.MEDIUM,

  /** Ratings - can change but not rapidly */
  RATINGS: CACHE_TIME.MEDIUM,

  /** Comments - change frequently */
  COMMENTS: CACHE_TIME.SHORT,

  /** Search results - can reuse briefly */
  SEARCH: CACHE_TIME.SHORT,

  /** Platform stats - computed aggregates, cache longer */
  STATS: CACHE_TIME.LONG,

  /** Tag suggestions - static enough to cache */
  TAGS: CACHE_TIME.VERY_LONG,

  /** Related videos - computed recommendations, cache medium */
  RECOMMENDATIONS: CACHE_TIME.MEDIUM,

  /** Moderation flags - need relatively fresh data */
  MODERATION: CACHE_TIME.SHORT,
} as const;
