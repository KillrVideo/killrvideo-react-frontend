import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { 
  VideoDetailResponse, 
  VideoSummary, 
  CommentResponse, 
  User,
  PaginatedResponse,
  UserLoginRequest,
  UserCreateRequest,
} from '@/types/api';

//export const useProfile = () => {
//  return useQuery({
//    queryKey: ['user', 'profile'],
//    queryFn: () => apiClient.getProfile(),
//  });
//};

// Video hooks
export const useLatestVideos = (page: number = 1, pageSize: number = 10) => {
  return useQuery({
    queryKey: ['videos', 'latest', page, pageSize],
    queryFn: async () => {
      try {
        const response = await apiClient.getLatestVideos(page, pageSize);
        //console.log('Latest videos response:', response);
        return response;
      } catch (error) {
        console.error('Error fetching latest videos:', error);
        throw error;
      }
    },
  });
};

export const useTrendingVideos = (days: number = 1, limit: number = 10) => {
  return useQuery({
    queryKey: ['videos', 'trending', days, limit],
    queryFn: () => apiClient.getTrendingVideos(days, limit),
  });
};

export const useVideo = (videoId: string) => {
  return useQuery({
    queryKey: ['videos', videoId],
    queryFn: () => apiClient.getVideo(videoId),
    enabled: !!videoId,
  });
};

export const useVideosByUser = (userId: string, page: number = 1, pageSize: number = 10) => {
  return useQuery({
    queryKey: ['videos', 'user', userId, page, pageSize],
    queryFn: () => apiClient.getVideosByUser(userId, page, pageSize),
    enabled: !!userId,
  });
};

export const useVideoStatus = (videoId: string) => {
  return useQuery({
    queryKey: ['videos', videoId, 'status'],
    queryFn: () => apiClient.getVideoStatus(videoId),
    enabled: !!videoId,
  });
};

export const useSubmitVideo = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { youtubeUrl: string }) => apiClient.submitVideo(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
  });
};

export const useUpdateVideo = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ videoId, data }: { videoId: string; data: any }) =>
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

      const previousVideo: any = queryClient.getQueryData(['videos', videoId]);

      if (previousVideo) {
        queryClient.setQueryData(['videos', videoId], {
          ...previousVideo,
          views: ((previousVideo as any).views ?? (previousVideo as any).viewCount ?? 0) + 1,
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
export const useComments = (videoId: string, page: number = 1, pageSize: number = 10) => {
  return useQuery({
    queryKey: ['comments', videoId, page, pageSize],
    queryFn: () => apiClient.getComments(videoId, page, pageSize),
    enabled: !!videoId,
  });
};

export const useCommentsByUser = (userId: string, page: number = 1, pageSize: number = 10) => {
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
      const previousAgg: any = queryClient.getQueryData(['aggregate-rating', videoId]);
      const previousVideo: any = queryClient.getQueryData(['videos', videoId]);

      // Build a new optimistic aggregate rating object
      const totalCount = previousAgg?.totalRatingsCount ?? 0;
      const newAgg = previousAgg
        ? {
            ...previousAgg,
            currentUserRating: rating,
            averageRating: previousAgg.averageRating
              ? ((previousAgg.averageRating * totalCount - (previousAgg.currentUserRating || 0) + rating) / totalCount)
              : rating,
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
export const useSearchVideos = (params: any) => {
  return useQuery({
    queryKey: ['search', 'videos', params],
    queryFn: () => apiClient.searchVideos(params),
    enabled: !!params.query,
  });
};

export const useTagSuggestions = (query: string, limit: number = 10) => {
  return useQuery({
    queryKey: ['tags', 'suggestions', query, limit],
    queryFn: () => apiClient.getTagSuggestions(query, limit),
    enabled: !!query && query.length > 0,
  });
};

// Recommendation hooks
export const useRelatedVideos = (videoId: string, limit: number = 5) => {
  return useQuery({
    queryKey: ['recommendations', 'related', videoId, limit],
    queryFn: () => apiClient.getRelatedVideos(videoId, limit),
    enabled: !!videoId,
  });
};

export const usePersonalizedRecommendations = (page: number = 1, pageSize: number = 10) => {
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
  const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('auth_token');

  return useQuery({
    queryKey: ['user', 'profile'],
    queryFn: () => apiClient.getProfile(),
    enabled: hasToken,
    staleTime: Infinity,       // never become stale automatically
    gcTime: Infinity,          // keep in cache for the entire session
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useLogin = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (credentials: UserLoginRequest) =>
      apiClient.login(credentials),
    onSuccess: (data: any) => {
      if (data.token) {
        apiClient.setToken(data.token);
        // Prime cache and localStorage with the new user
        if (data.user) {
          localStorage.setItem('auth_user', JSON.stringify(data.user));
          queryClient.setQueryData(['user', 'profile'], data.user);
        } else {
          queryClient.invalidateQueries({ queryKey: ['user', 'profile'] });
        }
        apiClient.setUserId(data.userId);
      }
    },
  });
};

export const useRegister = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (userInfo: UserCreateRequest) =>
      apiClient.register(userInfo),
    onSuccess: (data: any) => {
      if (data.token) {
        apiClient.setToken(data.token);
        if (data.user) {
          localStorage.setItem('auth_user', JSON.stringify(data.user));
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
    queryKey: ['flags', status, page, pageSize],
    queryFn: () => apiClient.getModerationFlags(status, page, pageSize),
  });
};

export const useGetFlagDetails = (flagId: string) => {
  return useQuery({
    queryKey: ['moderation', 'flags', flagId],
    queryFn: () => apiClient.getFlagDetails(flagId),
    enabled: !!flagId,
  });
};

export const useActionFlag = (flagId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { status: "open" | "under_review" | "approved" | "rejected"; moderatorNotes?: string }) =>
      apiClient.actionFlag(flagId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flags'] });
      queryClient.invalidateQueries({ queryKey: ['flag', flagId] });
    },
  });
};

export const useFlagContent = () => {
  return useMutation({
    mutationFn: (data: any) => apiClient.flagContent(data),
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
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};

