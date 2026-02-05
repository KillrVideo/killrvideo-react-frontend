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

// Issue #28: localStorage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  AUTH_USER: 'auth_user',
  USER_ID: 'user_id',
  GUIDED_TOUR_ENABLED: 'killrvideo_guided_tour_enabled',
  TOUR_WELCOMED: 'killrvideo_tour_welcomed',
} as const;

// Issue #30: Pagination Defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 10,
  SMALL: 5,
  MEDIUM: 10,
  LARGE: 20,
  MAX: 100,
} as const;

// Issue #31: Custom Events
export const EVENTS = {
  AUTH_CHANGE: 'auth-change',
} as const;

// Issue #32: Sentiment Thresholds
export const SENTIMENT = {
  POSITIVE_THRESHOLD: 0.1,
  NEGATIVE_THRESHOLD: -0.1,
} as const;

// Issue #34: Video Status
export const VIDEO_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  ERROR: 'ERROR',
} as const;

// Issue #34: Flag Status
export const FLAG_STATUS = {
  OPEN: 'open',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

// Issue #34: Flag Reasons
export const FLAG_REASON = {
  SPAM: 'spam',
  INAPPROPRIATE: 'inappropriate',
  HARASSMENT: 'harassment',
  COPYRIGHT: 'copyright',
  OTHER: 'other',
} as const;

export const FLAG_REASON_LABELS: Record<string, string> = {
  [FLAG_REASON.SPAM]: 'Spam or misleading',
  [FLAG_REASON.INAPPROPRIATE]: 'Inappropriate',
  [FLAG_REASON.HARASSMENT]: 'Harassment or hate',
  [FLAG_REASON.COPYRIGHT]: 'Copyright violation',
  [FLAG_REASON.OTHER]: 'Other',
};

// Issue #34: Content Types
export const CONTENT_TYPE = {
  VIDEO: 'video',
  COMMENT: 'comment',
} as const;
