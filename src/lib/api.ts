import { ApiError } from '@/types/api';
import { components } from '@/types/killrvideo-openapi-types';

const API_BASE_URL = '/api/v1';

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private userId: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('auth_token');
  }

  setUserId(userId: string) {
    this.userId = userId;
    localStorage.setItem('user_id', userId);
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
    window.dispatchEvent(new Event('auth-change'));
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
    window.dispatchEvent(new Event('auth-change'));
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid – clear it so the UI reflects logged-out state
        this.clearToken();
      }
      const error: ApiError = await response.json();
      throw error;
    }

      if (response.status === 204) {
        return {} as T;
      }

      return response.json();
    } catch (error) {
      console.error('API request failed:', { url, error });
      throw error;
    }
  }

  // Auth endpoints
  async login(credentials: components["schemas"]["UserLoginRequest"]): Promise<components["schemas"]["UserLoginResponse"]> {
    return this.request('/users/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async register(userInfo: components["schemas"]["UserCreateRequest"]): Promise<components["schemas"]["UserCreateResponse"]> {
    return this.request('/users/register', {
      method: 'POST',
      body: JSON.stringify(userInfo),
    });
  }

  async getProfile(): Promise<components["schemas"]["User"]> {
    return this.request('/users/me');
  }

  async updateProfile(data: components["schemas"]["UserProfileUpdateRequest"]): Promise<components["schemas"]["User"]> {
    return this.request('/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Video endpoints
  async submitVideo(data: components["schemas"]["VideoSubmitRequest"]): Promise<components["schemas"]["VideoDetailResponse"]> {
    return this.request('/videos', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getVideo(videoId: string): Promise<components["schemas"]["VideoDetailResponse"]> {
    return this.request(`/videos/id/${videoId}`);
  }

  async getVideoStatus(videoId: string): Promise<components["schemas"]["VideoStatusResponse"]> {
    return this.request(`/videos/id/${videoId}/status`);
  }

  async updateVideo(videoId: string, data: components["schemas"]["VideoUpdateRequest"]): Promise<components["schemas"]["VideoDetailResponse"]> {
    return this.request(`/videos/id/${videoId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async recordView(videoId: string): Promise<void> {
    return this.request(`/videos/id/${videoId}/view`, {
      method: 'POST',
    });
  }

  async getLatestVideos(page: number = 1, pageSize: number = 10): Promise<components["schemas"]["PaginatedResponse_VideoSummary_"]> {
    return this.request(`/videos/latest?page=${page}&pageSize=${pageSize}`);
  }

  async getTrendingVideos(days: number = 1, limit: number = 10): Promise<Array<components["schemas"]["VideoSummary"]>> {
    return this.request(`/videos/trending?intervalDays=${days}&limit=${limit}`);
  }

  async getVideosByTag(tag: string, page: number = 1, pageSize: number = 10): Promise<components["schemas"]["PaginatedResponse_VideoSummary_"]> {
    return this.request(`/videos/by-tag/${tag}?page=${page}&pageSize=${pageSize}`);
  }

  async getVideosByUser(userId: string, page: number = 1, pageSize: number = 10): Promise<components["schemas"]["PaginatedResponse_VideoSummary_"]> {
    return this.request(`/videos/by-uploader/${userId}?page=${page}&pageSize=${pageSize}`);
  }

  // Comment endpoints
  async addComment(videoId: string, comment: components["schemas"]["CommentCreateRequest"]): Promise<components["schemas"]["CommentResponse"]> {
    return this.request(`/videos/${videoId}/comments`, {
      method: 'POST',
      body: JSON.stringify(comment),
    });
  }

  async getComments(videoId: string, page: number = 1, pageSize: number = 10): Promise<components["schemas"]["PaginatedResponse"]> {
    return this.request(`/videos/${videoId}/comments?page=${page}&pageSize=${pageSize}`);
  }

  async getCommentsByUser(userId: string, page: number = 1, pageSize: number = 10): Promise<components["schemas"]["PaginatedResponse"]> {
    return this.request(`/users/${userId}/comments?page=${page}&pageSize=${pageSize}`);
  }

  // Rating endpoints
  async rateVideo(videoId: string, rating: components["schemas"]["RatingCreateOrUpdateRequest"]): Promise<components["schemas"]["RatingResponse"]> {
    return this.request(`/videos/${videoId}/ratings`, {
      method: 'POST',
      body: JSON.stringify(rating),
    });
  }

  async getRatings(videoId: string): Promise<components["schemas"]["AggregateRatingResponse"]> {
    return this.request(`/videos/${videoId}/ratings`);
  }

  async getVideoRating(videoId: string): Promise<components["schemas"]["VideoRatingSummary"]> {
    return this.request(`/videos/id/${videoId}/rating`);
  }

  // Search endpoints
  async searchVideos(params: { query: string; page?: number; pageSize?: number }): Promise<components["schemas"]["PaginatedResponse_VideoSummary_"]> {
    const queryString = new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)])
    ).toString();
    return this.request(`/search/videos?${queryString}`);
  }

  async getTagSuggestions(query: string, limit: number = 10): Promise<Array<components["schemas"]["TagSuggestion"]>> {
    return this.request(`/search/tags/suggest?query=${query}&limit=${limit}`);
  }

  // Recommendation endpoints
  async getRelatedVideos(videoId: string, limit: number = 5): Promise<Array<components["schemas"]["RecommendationItem"]>> {
    return this.request(`/videos/id/${videoId}/related?limit=${limit}`);
  }

  async getPersonalizedRecommendations(page: number = 1, pageSize: number = 10): Promise<components["schemas"]["PaginatedResponse_VideoSummary_"]> {
    return this.request(`/recommendations/foryou?page=${page}&pageSize=${pageSize}`);
  }

  // Moderation endpoints
  async flagContent(data: components["schemas"]["FlagCreateRequest"]): Promise<components["schemas"]["FlagResponse"]> {
    return this.request('/flags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getModerationFlags(
    status?: components["schemas"]["FlagStatusEnum"],
    page: number = 1,
    pageSize: number = 10
  ): Promise<components["schemas"]["PaginatedResponse_FlagResponse_"]> {
    const params = new URLSearchParams({ page: page.toString(), pageSize: pageSize.toString() });
    if (status) params.append('status', status);
    return this.request(`/moderation/flags?${params.toString()}`);
  }

  async getFlagDetails(flagId: string): Promise<components["schemas"]["FlagResponse"]> {
    return this.request(`/moderation/flags/${flagId}`);
  }

  async actionFlag(flagId: string, data: components["schemas"]["FlagUpdateRequest"]): Promise<components["schemas"]["FlagResponse"]> {
    return this.request(`/moderation/flags/${flagId}/action`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async searchUsers(query?: string): Promise<Array<components["schemas"]["User"]>> {
    const params = query ? `?q=${encodeURIComponent(query)}` : '';
    return this.request(`/moderation/users${params}`);
  }

  async assignModerator(userId: string): Promise<components["schemas"]["User"]> {
    return this.request(`/moderation/users/${userId}/assign-moderator`, {
      method: 'POST',
    });
  }

  async revokeModerator(userId: string): Promise<components["schemas"]["User"]> {
    return this.request(`/moderation/users/${userId}/revoke-moderator`, {
      method: 'POST',
    });
  }

  async restoreVideo(videoId: string): Promise<components["schemas"]["ContentRestoreResponse"]> {
    return this.request(`/moderation/videos/${videoId}/restore`, {
      method: 'POST',
    });
  }

  async restoreComment(commentId: string): Promise<components["schemas"]["ContentRestoreResponse"]> {
    return this.request(`/moderation/comments/${commentId}/restore`, {
      method: 'POST',
    });
  }

  // User endpoints
  async getUser(userId: string): Promise<components["schemas"]["User"]> {
    return this.request(`/users/${userId}`);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);