import VideoCard from '@/components/video/VideoCard';
import { useLatestVideos } from '@/hooks/useApi';
import { VideoSummary } from '@/types/api';

const PLACEHOLDER_THUMB = 'https://via.placeholder.com/400x225';

const FeaturedVideos = () => {
  const { data: videosResp, isLoading, error } = useLatestVideos(1, 5);
  const videos: VideoSummary[] = (videosResp?.data as VideoSummary[]) || [];

  if (isLoading) {
    return (
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="font-sora text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Loading videos...
            </h2>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    console.error('Featured videos error:', error);
    return (
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="font-sora text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Error loading videos
            </h2>
            <p className="text-red-600">
              {error instanceof Error ? error.message : 'An error occurred while loading videos'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!videos.length) {
    return (
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="font-sora text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              No videos available
            </h2>
            <p className="text-gray-600">
              Check back later for new content
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="font-sora text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Featured Videos
          </h2>
          <p className="font-noto text-lg text-gray-600 max-w-2xl mx-auto">
            Discover the latest and most popular content from our community of developers and creators
          </p>
        </div>

        {isLoading ? (
          <p className="text-center">Loading...</p>
        ) : error ? (
          <p className="text-center text-red-500">Failed to load videos.</p>
        ) : videos.length === 0 ? (
          <p className="text-center text-muted-foreground">No videos available.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((video) => (
              <VideoCard
                key={video.videoId}
                id={video.videoId}
                title={video.title}
                creator={video.userId}
                thumbnail={video.thumbnailUrl || PLACEHOLDER_THUMB}
                duration=""
                views={video.viewCount}
                rating={video.averageRating ?? 0}
                tags={[]} // Tags not available in summary
                uploadDate={video.submittedAt}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default FeaturedVideos;
