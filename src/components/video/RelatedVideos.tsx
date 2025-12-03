import {
  useRelatedVideos,
  useVideoRating 
} from '@/hooks/useApi';
import { EducationalTooltip } from '@/components/educational/EducationalTooltip';
import VideoCard from './VideoCard';

interface RelatedVideosProps {
  videoId: string;
  limit?: number;
}

const RelatedVideos = ({ videoId, limit = 5 }: RelatedVideosProps) => {
  const { data: related, isLoading, isError } = useRelatedVideos(videoId, limit);

  if (isLoading) return <p>Loading related videos…</p>;
  if (isError || !related?.length) return <p>No related videos found.</p>;

  return (
    <div className="space-y-4">
      <EducationalTooltip id="vector-search-recommendations" showIcon side="right">
        <h3 className="font-sora font-semibold text-xl text-gray-900 mb-4">
          Related Videos
        </h3>
      </EducationalTooltip>

      {related.map((item) => (
        <VideoCard
          key={item.videoId}
          id={item.videoId}
          title={item.title}
          creator={''}
          thumbnail={item.thumbnailUrl ?? ''}
          duration={''}
          views={item.views ?? 0}
          rating={item.averageRating ?? 0}
          tags={[]}
          uploadDate={item.uploadDate ?? ''}
        />
      ))}
    </div>
  );
};

export default RelatedVideos; 