import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { CACHE_STRATEGY, STORAGE_KEYS, PAGINATION } from '@/lib/constants';
import {
  VideoDetailResponse,
  VideoSummary,
  CommentResponse,
  User,
  PaginatedResponse,
  UserLoginRequest,
  UserCreateRequest,
  VideoSubmitRequest,
  VideoUpdateRequest,
  AggregateRatingResponse,
  SearchParams,
  FlagCreateRequest,
} from '@/types/api';
import { components } from '@/types/killrvideo-openapi-types';

//export const useProfile = () => {
//  return useQuery({
//    queryKey: ['user', 'profile'],
//    queryFn: () => apiClient.getProfile(),
//  });
//};

// Video hooks
export const useLatestVideos = (page: number = PAGINATION.DEFAULT_PAGE, pageSize: number = PAGINATION.DEFAULT_PAGE_SIZE) => {
  return useQuery({
    queryKey: ['videos', 'latest', page, pageSize],
    queryFn: () => apiClient.getLatestVideos(page, pageSize),
    staleTime: CACHE_STRATEGY.VIDEO,
  });
};

export const useTrendingVideos = (days: number = 1, limit: number = PAGINATION.DEFAULT_PAGE_SIZE) => {
  return useQuery({
    queryKey: ['videos', 'trending', days, limit],
    queryFn: () => apiClient.getTrendingVideos(days, limit),
    staleTime: CACHE_STRATEGY.VIDEO,
  });
};

export const useVideo = (videoId: string) => {
  return useQuery({
    queryKey: ['videos', videoId],
    queryFn: () => apiClient.getVideo(videoId),
    enabled: !!videoId,
    staleTime: CACHE_STRATEGY.VIDEO,
  });
};

export const useVideosByUser = (userId: string, page: number = PAGINATION.DEFAULT_PAGE, pageSize: number = PAGINATION.DEFAULT_PAGE_SIZE) => {
  return useQuery({
    queryKey: ['videos', 'user', userId, page, pageSize],
    queryFn: () => apiClient.getVideosByUser(userId, page, pageSize),
    enabled: !!userId,
    staleTime: CACHE_STRATEGY.VIDEO,
  });
};

export const useVideoStatus = (videoId: string) => {
  return useQuery({
    queryKey: ['videos', videoId, 'status'],
    queryFn: () => apiClient.getVideoStatus(videoId),
    enabled: !!videoId,
    staleTime: CACHE_STRATEGY.SHORT,
  });
};

export const useSubmitVideo = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: VideoSubmitRequest) =>
      apiClient.submitVideo(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
  });
};

export const useUpdateVideo = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ videoId, data }: { videoId: string; data: VideoUpdateRequest }) =>
      apiClient.updateVideo(videoId, data),
    onSuccess: (_, { videoId }) => {
      queryClient.invalidateQueries({ queryKey: ['videos', videoId] });
    },
  });
};

export const useRecordView = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (videoId: string) => apiClient.recordView(videoId),
    retry: false, // do not retry on failure to avoid spamming the backend
    onMutate: async (videoId: string) => {
      await queryClient.cancelQueries({ queryKey: ['videos', videoId] });

      const previousVideo = queryClient.getQueryData<VideoDetailResponse>(['videos', videoId]);

      if (previousVideo) {
        queryClient.setQueryData(['videos', videoId], {
          ...previousVideo,
          viewCount: (previousVideo.viewCount ?? 0) + 1,
        });
      }

      return { previousVideo };
    },
    onError: (_err, videoId, context) => {
      if (context?.previousVideo) {
        queryClient.setQueryData(['videos', videoId], context.previousVideo);
      }
    },
    onSuccess: (_data, videoId) => {
      // Ensure fresh data after the optimistic update
      queryClient.invalidateQueries({ queryKey: ['videos', videoId] });
    },
  });
};

// Comment hooks
export const useComments = (videoId: string, page: number = PAGINATION.DEFAULT_PAGE, pageSize: number = PAGINATION.DEFAULT_PAGE_SIZE) => {
  return useQuery({
    queryKey: ['comments', videoId, page, pageSize],
    queryFn: () => apiClient.getComments(videoId, page, pageSize),
    enabled: !!videoId,
    staleTime: CACHE_STRATEGY.COMMENTS,
  });
};

export const useCommentsByUser = (userId: string, page: number = PAGINATION.DEFAULT_PAGE, pageSize: number = PAGINATION.DEFAULT_PAGE_SIZE) => {
  return useQuery({
    queryKey: ['comments', 'user', userId, page, pageSize],
    queryFn: () => apiClient.getCommentsByUser(userId, page, pageSize),
    enabled: !!userId,
  });
};

export const useAddComment = (videoId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => apiClient.addComment(videoId, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', videoId] });
    },
  });
};

// Rating hooks
export const useVideoRating = (videoId: string) => {
  return useQuery({
    queryKey: ['ratings', videoId],
    queryFn: () => apiClient.getVideoRating(videoId),
    enabled: !!videoId,
  });
};

export const useAggregateRating = (videoId: string) => {
  return useQuery({
    queryKey: ['aggregate-rating', videoId],
    queryFn: () => apiClient.getRatings(videoId),
    enabled: !!videoId,
    staleTime: CACHE_STRATEGY.RATINGS,
  });
};

export const useRateVideo = (videoId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rating: number) => apiClient.rateVideo(videoId, { rating }),
    onMutate: async (rating: number) => {
      // Cancel any ongoing fetches for this aggregate rating
      await queryClient.cancelQueries({ queryKey: ['aggregate-rating', videoId] });

      // Snapshot current cache values
      const previousAgg = queryClient.getQueryData<AggregateRatingResponse>(['aggregate-rating', videoId]);
      const previousVideo = queryClient.getQueryData<VideoDetailResponse>(['videos', videoId]);

      // Build a new optimistic aggregate rating object
      const isFirstTimeRater = !previousAgg?.currentUserRating;
      const totalCount = previousAgg?.totalRatingsCount ?? 0;
      const newTotalCount = isFirstTimeRater ? totalCount + 1 : totalCount;

      let newAverage: number;
      if (!previousAgg?.averageRating) {
        newAverage = rating;
      } else if (isFirstTimeRater) {
        // First time rating: add to the pool
        newAverage = (previousAgg.averageRating * totalCount + rating) / newTotalCount;
      } else {
        // Updating existing rating: replace old with new
        newAverage = (previousAgg.averageRating * totalCount - (previousAgg.currentUserRating || 0) + rating) / totalCount;
      }

      const newAgg = previousAgg
        ? {
            ...previousAgg,
            currentUserRating: rating,
            averageRating: newAverage,
            totalRatingsCount: newTotalCount,
          }
        : {
            videoId,
            currentUserRating: rating,
            averageRating: rating,
            totalRatingsCount: 1,
          };

      // Apply optimistic updates
      queryClient.setQueryData(['aggregate-rating', videoId], newAgg);
      if (previousVideo) {
        queryClient.setQueryData(['videos', videoId], {
          ...previousVideo,
          averageRating: newAgg.averageRating,
        });
      }

      return { previousAgg, previousVideo };
    },
    onSuccess: () => {
      // Refresh aggregate rating and video detail queries so UI updates immediately
      queryClient.invalidateQueries({ queryKey: ['aggregate-rating', videoId] });
      queryClient.invalidateQueries({ queryKey: ['videos', videoId] });
    },
    onError: (_err, _newRating, context) => {
      // Revert on error
      if (context?.previousAgg) {
        queryClient.setQueryData(['aggregate-rating', videoId], context.previousAgg);
      }
    },
  });
};

// Search hooks
export const useSearchVideos = (params: SearchParams) => {
  return useQuery({
    queryKey: ['search', 'videos', params],
    queryFn: () => apiClient.searchVideos(params),
    enabled: !!params.query,
    staleTime: CACHE_STRATEGY.SEARCH,
  });
};

export const useTagSuggestions = (query: string, limit: number = PAGINATION.DEFAULT_PAGE_SIZE) => {
  return useQuery({
    queryKey: ['tags', 'suggestions', query, limit],
    queryFn: () => apiClient.getTagSuggestions(query, limit),
    enabled: !!query && query.length > 0,
    staleTime: CACHE_STRATEGY.TAGS,
  });
};

// Recommendation hooks
export const useRelatedVideos = (videoId: string, limit: number = PAGINATION.SMALL) => {
  return useQuery({
    queryKey: ['recommendations', 'related', videoId, limit],
    queryFn: () => apiClient.getRelatedVideos(videoId, limit),
    enabled: !!videoId,
    staleTime: CACHE_STRATEGY.RECOMMENDATIONS,
  });
};

export const usePersonalizedRecommendations = (page: number = PAGINATION.DEFAULT_PAGE, pageSize: number = PAGINATION.DEFAULT_PAGE_SIZE) => {
  return useQuery({
    queryKey: ['recommendations', 'foryou', page, pageSize],
    queryFn: () => apiClient.getPersonalizedRecommendations(page, pageSize),
  });
};

// Auth hooks
export const useProfile = () => {
  // Only attempt to fetch the current user's profile when an auth token is present.
  // By setting a very long `staleTime` and disabling automatic refetching on
  // window focus / reconnect, we avoid repeatedly spamming the backend with
  // /users/me requests while still keeping the data available in cache for the
  // lifetime of the session. The query will be refreshed manually after
  // login / logout via queryClient.invalidateQueries.
  const hasToken = typeof window !== 'undefined' && !!localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);

  return useQuery({
    queryKey: ['user', 'profile'],
    queryFn: () => apiClient.getProfile(),
    enabled: hasToken,
    staleTime: CACHE_STRATEGY.USER_PROFILE,
    gcTime: CACHE_STRATEGY.USER_PROFILE,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useLogin = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (credentials: UserLoginRequest) =>
      apiClient.login(credentials),
    onSuccess: (data: components["schemas"]["UserLoginResponse"]) => {
      if (data.token) {
        apiClient.setToken(data.token);
        // Prime cache and localStorage with the new user
        if (data.user) {
          localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(data.user));
          queryClient.setQueryData(['user', 'profile'], data.user);
        } else {
          queryClient.invalidateQueries({ queryKey: ['user', 'profile'] });
        }
        apiClient.setUserId(data.user?.userId ?? '');
      }
    },
  });
};

export const useRegister = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userInfo: UserCreateRequest) =>
      apiClient.register(userInfo),
    onSuccess: (data: components["schemas"]["UserCreateResponse"]) => {
      if (data.token) {
        apiClient.setToken(data.token);
        if (data.user) {
          localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(data.user));
          queryClient.setQueryData(['user', 'profile'], data.user);
        } else {
          queryClient.invalidateQueries({ queryKey: ['user', 'profile'] });
        }
      }
    },
  });
};

// Moderation hooks
export const useGetModerationFlags = (status: "open" | "under_review" | "approved" | "rejected", page: number, pageSize: number) => {
  return useQuery({
    queryKey: ['moderation', 'flags', 'list', status, page, pageSize],
    queryFn: () => apiClient.getModerationFlags(status, page, pageSize),
    staleTime: CACHE_STRATEGY.MODERATION,
  });
};

export const useGetFlagDetails = (flagId: string) => {
  return useQuery({
    queryKey: ['moderation', 'flags', flagId],
    queryFn: () => apiClient.getFlagDetails(flagId),
    enabled: !!flagId,
    staleTime: CACHE_STRATEGY.MODERATION,
  });
};

export const useActionFlag = (flagId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { status: "open" | "under_review" | "approved" | "rejected"; moderatorNotes?: string }) =>
      apiClient.actionFlag(flagId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moderation', 'flags'] });
    },
  });
};

export const useFlagContent = () => {
  return useMutation({
    mutationFn: (data: FlagCreateRequest) => apiClient.flagContent(data),
  });
};

export const useSearchUsers = (query?: string) => {
  return useQuery({
    queryKey: ['moderation', 'users', query],
    queryFn: () => apiClient.searchUsers(query),
    enabled: query !== undefined,
  });
};

export const useAssignModerator = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (userId: string) => apiClient.assignModerator(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moderation', 'users'] });
    },
  });
};

export const useRevokeModerator = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (userId: string) => apiClient.revokeModerator(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moderation', 'users'] });
    },
  });
};

// Public user fetch by ID (new endpoint)
export const useUser = (userId: string) => {
  return useQuery({
    queryKey: ['user', 'public', userId],
    queryFn: () => apiClient.getUser(userId),
    enabled: !!userId,
    staleTime: CACHE_STRATEGY.USER_PUBLIC,
  });
};

/**
 * Prefetch multiple users in parallel to avoid N+1 queries in VideoCard.
 * Returns a map of userId -> display name for easy lookup.
 * Uses useQueries for proper React Query integration.
 */
export const useUserNames = (userIds: string[]) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Memoize unique IDs to prevent unnecessary re-renders
  const uniqueIds = useMemo(() => {
    return [...new Set(userIds.filter(id => id && uuidRegex.test(id)))];
  }, [userIds]);

  const results = useQueries({
    queries: uniqueIds.map(userId => ({
      queryKey: ['user', 'public', userId],
      queryFn: () => apiClient.getUser(userId),
      staleTime: CACHE_STRATEGY.USER_PUBLIC,
    })),
  });

  const isLoading = results.some(r => r.isLoading);
  const isError = results.some(r => r.isError);

  // Memoize the user map to prevent unnecessary re-renders
  const userMap = useMemo(() => {
    const map: Record<string, string> = {};
    results.forEach((result, index) => {
      if (result.data) {
        const user = result.data;
        map[uniqueIds[index]] = `${user.firstName} ${user.lastName}`.trim();
      }
    });
    return map;
  }, [results, uniqueIds]);

  return { userMap, isLoading, isError };
};

