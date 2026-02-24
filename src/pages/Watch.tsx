import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  useVideo,
  useRecordView,
  useRecordWatchTime,
  useAggregateRating,
  useRateVideo,
  useUser,
} from '@/hooks/useApi';
import Layout from '@/components/layout/Layout';
import { Star, Eye, Clock, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CommentsSection from '@/components/comments/CommentsSection';
import StarRating from '@/components/StarRating';
import RelatedVideos from '@/components/video/RelatedVideos';
import { useAuth } from '@/hooks/useAuth';
import ReportFlagDialog from '@/components/moderation/ReportFlagDialog';
import { EducationalTooltip } from '@/components/educational/EducationalTooltip';
import { STORAGE_KEYS } from '@/lib/constants';

const WATCH_TIME_HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

// Utilities
const formatNumber = (raw?: number | null) => {
  const num = raw ?? 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
};

const Watch = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);

  // Queries / mutations -------------------------------------------
  const {
    data: video,
    isLoading: videoLoading,
  } = useVideo(id || '');

  const recordView = useRecordView();
  const recordWatchTime = useRecordWatchTime();

  // Rating queries / mutations - consolidated to single endpoint
  const { data: aggregateRating } = useAggregateRating(id || '');
  const rateVideo = useRateVideo(id || '');

  const userRating = aggregateRating?.currentUserRating ?? 0;
  const averageRatingDisplay = aggregateRating?.averageRating ?? video?.averageRating ?? 0;

  // Note: This creates a sequential waterfall - user fetch waits for video.
  // This is a data dependency (we need video.userId) that can only be eliminated
  // by having the backend embed uploader info in the video response.
  // Caching (CACHE_STRATEGY.USER_PUBLIC = 1hr) mitigates repeat visit latency.
  const { data: uploader } = useUser(video?.userId ?? '');

  // ---------------------------------------------------------------

  // Record a view exactly once per mount after video data is available
  const hasRecordedRef = useRef(false);
  const recordViewMutate = recordView.mutate;

  useEffect(() => {
    if (!hasRecordedRef.current && video && id) {
      hasRecordedRef.current = true;
      recordViewMutate(id);
    }
  }, [video, id, recordViewMutate]);

  // Watch-time tracking -----------------------------------------------
  // Tracks elapsed seconds while the page is visible and the video is
  // available. Timer pauses when the tab is hidden. Reports every 30 s
  // (heartbeat), on visibility-hidden, and on page unload.

  // Accumulated seconds not yet sent to the server
  const elapsedSecondsRef = useRef(0);
  // Timestamp of the last "tick" start; null when the timer is paused
  const tickStartRef = useRef<number | null>(null);
  const recordWatchTimeMutate = recordWatchTime.mutate;

  // Flush accumulated watch time to the API. Resets the counter on success.
  // keepalive=true is used on unload so the request survives tab/window close.
  const flushWatchTime = useCallback(
    (videoId: string, keepalive: boolean = false) => {
      // Accumulate any in-progress tick before flushing
      if (tickStartRef.current !== null) {
        const now = Date.now();
        elapsedSecondsRef.current += Math.floor((now - tickStartRef.current) / 1000);
        tickStartRef.current = now; // keep ticking after flush
      }

      const seconds = elapsedSecondsRef.current;
      if (seconds <= 0) return;

      // Reset immediately so a second flush (e.g. heartbeat racing unload) doesn't double-count
      elapsedSecondsRef.current = 0;

      if (keepalive) {
        // On unload we use fetch with keepalive + auth header so the request
        // is not dropped when the page is being torn down. sendBeacon cannot
        // carry auth headers so we prefer keepalive fetch.
        const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        fetch(`/api/v1/videos/id/${videoId}/watch-time`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ watch_duration_seconds: seconds }),
          keepalive: true,
        }).catch(() => {
          // best-effort; ignore errors on unload
        });
      } else {
        recordWatchTimeMutate({ videoId, durationSeconds: seconds });
      }
    },
    [recordWatchTimeMutate],
  );

  // Start / resume the elapsed-time accumulation tick
  const startTick = useCallback(() => {
    if (tickStartRef.current === null) {
      tickStartRef.current = Date.now();
    }
  }, []);

  // Pause the tick, accumulating elapsed seconds into the ref
  const pauseTick = useCallback(() => {
    if (tickStartRef.current !== null) {
      elapsedSecondsRef.current += Math.floor((Date.now() - tickStartRef.current) / 1000);
      tickStartRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Only track once the video data is loaded and we have a valid video ID
    if (!video || !id) return;

    const videoId = id;

    // Start tracking as soon as the video is available and tab is visible
    if (document.visibilityState === 'visible') {
      startTick();
    }

    // Heartbeat: flush every 30 s of accumulated active time
    const heartbeatInterval = setInterval(() => {
      flushWatchTime(videoId, false);
    }, WATCH_TIME_HEARTBEAT_INTERVAL_MS);

    // Visibility change: pause when hidden, resume when visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pauseTick();
        flushWatchTime(videoId, false);
      } else {
        startTick();
      }
    };

    // Page unload: best-effort keepalive flush
    const handleBeforeUnload = () => {
      pauseTick();
      flushWatchTime(videoId, true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      // Component unmount: flush remaining time and clean up
      pauseTick();
      flushWatchTime(videoId, false);
      clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, id]);
  // ---------------------------------------------------------------

  return (
    <Layout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Video Section */}
          <div className="lg:col-span-2">
            {/* Video Player */}
            <div className="aspect-video mb-6 bg-black rounded-lg overflow-hidden flex items-center justify-center">
              {videoLoading ? (
                <div className="w-full h-full bg-gray-200 animate-pulse" />
              ) : video?.youtubeVideoId ? (
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${video.youtubeVideoId}`}
                  title={video.title ?? 'Video player'}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                ></iframe>
              ) : (
                <p className="text-white text-center p-4">Video unavailable.</p>
              )}
            </div>

            {/* Video Info */}
            <div className="mb-6">
              <EducationalTooltip id="partition-keys-explained" showIcon side="right">
                <h1 className="font-sora text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                  {video?.title ?? (videoLoading ? 'Loading…' : 'Video not found')}
                </h1>
              </EducationalTooltip>
              
              <div className="flex flex-wrap items-center justify-between mb-4">
                <div className="flex items-center space-x-6 text-gray-600 font-noto">
                  <EducationalTooltip id="counter-views" side="top">
                    <span className="flex items-center">
                      <Eye className="w-4 h-4 mr-1" />
                      {video ? formatNumber(video.views) + ' views' : ''}
                    </span>
                  </EducationalTooltip>
                  <span className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {/* Duration not available in API yet */}
                    {video && <span>-</span>}
                  </span>
                  <EducationalTooltip id="ratings-data-model" side="top">
                    <span className="flex items-center">
                      <Star className="w-4 h-4 mr-1 fill-accent text-accent" />
                      {averageRatingDisplay} rating
                    </span>
                  </EducationalTooltip>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    if (!isAuthenticated) {
                      navigate('/auth');
                    } else {
                      setReportOpen(true);
                    }
                  }}>
                    <Flag className="w-4 h-4 mr-1" />
                    Report
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-b border-gray-200 py-4">
                <div>
                  <h3 className="font-sora font-semibold text-lg text-gray-900">
                    {video ? `Uploaded by: ${uploader ? `${uploader.firstName} ${uploader.lastName}`.trim() : video.userId.substring(0,8)}` : ''}
                  </h3>
                  <p className="font-noto text-gray-600">
                    {video && `Uploaded on ${new Date(video.submittedAt).toLocaleDateString()}`}
                  </p>
                </div>
                
                <StarRating
                  value={userRating}
                  onChange={(val) => rateVideo.mutate(val)}
                />
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mt-4">
                {video?.tags?.map((tag) => (
                  <Badge 
                    key={tag} 
                    variant="secondary" 
                    className="bg-primary/10 text-primary hover:bg-primary/20"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>

              {/* Description */}
              <div className="mt-6">
                <h3 className="font-sora font-semibold text-lg text-gray-900 mb-2">
                  Description
                </h3>
                <p className="font-noto text-gray-700 leading-relaxed">
                  {video?.description}
                </p>
              </div>
            </div>

            <CommentsSection videoId={id || ''} />
            <ReportFlagDialog
              open={reportOpen}
              onOpenChange={setReportOpen}
              videoId={id || ''}
            />
          </div>

          {/* Sidebar */}
          <div>
            <RelatedVideos videoId={id || ''} />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Watch;
