import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  useVideo,
  useRecordView,
  useAggregateRating,
  useRateVideo,
  useVideoRating,
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

  // Rating queries / mutations
  const { data: aggregateRating } = useAggregateRating(id || '');
  const rateVideo = useRateVideo(id || '');
  const { data: ratingSummary } = useVideoRating(id || '');

  const userRating = aggregateRating?.currentUserRating ?? 0;
  const averageRatingDisplay =
    ratingSummary?.averageRating ?? aggregateRating?.averageRating ?? video?.averageRating ?? 0;

  const { data: uploader } = useUser(video?.userId ?? '');

  // ---------------------------------------------------------------

  // Record a view exactly once per mount after video data is available
  const hasRecordedRef = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!hasRecordedRef.current && video && id) {
      hasRecordedRef.current = true;
      recordView.mutate(id);
    }
  }, [video, id]);

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
              <h1 className="font-sora text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                {video?.title ?? (videoLoading ? 'Loading…' : 'Video not found')}
              </h1>
              
              <div className="flex flex-wrap items-center justify-between mb-4">
                <div className="flex items-center space-x-6 text-gray-600 font-noto">
                  <span className="flex items-center">
                    <Eye className="w-4 h-4 mr-1" />
                    {video ? formatNumber((video as any).views ?? (video as any).viewCount) + ' views' : ''}
                  </span>
                  <span className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {/* Duration not available in API yet */}
                    {video && <span>-</span>}
                  </span>
                  <span className="flex items-center">
                    <Star className="w-4 h-4 mr-1 fill-accent text-accent" />
                    {averageRatingDisplay.toFixed(1)} rating
                  </span>
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
            <h3 className="font-sora font-semibold text-xl text-gray-900 mb-4">
              Related Videos
            </h3>
            
            <RelatedVideos videoId={id || ''} />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Watch;
