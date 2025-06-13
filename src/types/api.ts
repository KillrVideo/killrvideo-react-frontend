// Core data types based on updated OpenAPI spec
export interface User {
  firstName: string;
  lastName: string;
  userId: string;
  username: string;
  email: string;
  createdDate: string;
  accountStatus: string;
  lastLoginDate?: string;
  roles: string[];
}

export interface VideoDetailResponse {
  title: string;
  description?: string;
  tags: string[];
  videoId: string;
  userId: string;
  submittedAt: string;
  thumbnailUrl?: string;
  location: string;
  location_type: number;
  content_features?: number[];
  content_rating?: string;
  category?: string;
  language?: string;
  youtubeVideoId?: string;
  updatedAt?: string;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'ERROR';
  viewCount: number;
  averageRating?: number;
  totalRatingsCount: number;
  is_deleted: boolean;
  deleted_at?: string;
}

export interface VideoSummary {
  key: string;
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  userId: string;
  submittedAt: string;
  contentRating?: string;
  category?: string;
  viewCount: number;
  averageRating?: number;
}

export interface CommentResponse {
  commentid: string;
  videoid: string;
  userid: string;
  comment: string;
  sentiment_score?: number;
}

export interface RatingResponse {
  rating: number;
  videoid: string;
  userid: string;
  created_at: string;
  updated_at: string;
}

export interface AggregateRatingResponse {
  videoId: string;
  averageRating?: number;
  totalRatingsCount: number;
  currentUserRating?: number;
}

export interface RecommendationItem {
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  score?: number;
}

export interface FlagResponse {
  contentType: 'video' | 'comment';
  contentId: string;
  reasonCode: 'spam' | 'inappropriate' | 'harassment' | 'copyright' | 'other';
  reasonText?: string;
  flagId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  status: 'open' | 'under_review' | 'approved' | 'rejected';
  moderatorId?: string;
  moderatorNotes?: string;
  resolvedAt?: string;
}

export interface TagSuggestion {
  tag: string;
}

export interface Pagination {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResponse<T = any> {
  data: T[];
  pagination: Pagination;
}

// API Request types
export interface UserLoginRequest {
  email: string;
  password: string;
}

export interface UserCreateRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface UserLoginResponse {
  token: string;
  user: User;
}

export interface UserCreateResponse {
  firstName: string;
  lastName: string;
  email: string;
  userId: string;
}

export interface VideoSubmitRequest {
  youtubeUrl: string;
}

export interface VideoUpdateRequest {
  title?: string;
  description?: string;
  tags?: string[];
}

export interface CommentCreateRequest {
  text: string;
}

export interface RatingCreateOrUpdateRequest {
  rating: number;
}

export interface FlagCreateRequest {
  contentType: 'video' | 'comment';
  contentId: string;
  reasonCode: 'spam' | 'inappropriate' | 'harassment' | 'copyright' | 'other';
  reasonText?: string;
}

export interface FlagUpdateRequest {
  status: 'open' | 'under_review' | 'approved' | 'rejected';
  moderatorNotes?: string;
}

export interface SearchParams {
  query?: string;
  page?: number;
  pageSize?: number;
}

export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
}
