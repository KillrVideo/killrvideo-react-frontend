import { useState, useMemo, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import VideoCard from '@/components/video/VideoCard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Compass, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLatestVideos, useUserNames } from '@/hooks/useApi';
import { VideoSummary } from '@/types/api';

const PAGE_SIZE = 12;
const EMPTY_TAGS: string[] = [];
const PLACEHOLDER_THUMB = 'https://via.placeholder.com/400x225';

const ExploreVideos = () => {
  const [page, setPage] = useState(1);

  const { data: videosResp, isLoading, error } = useLatestVideos(page, PAGE_SIZE);
  const videos: VideoSummary[] = useMemo(
    () => (videosResp?.data as VideoSummary[]) || [],
    [videosResp?.data]
  );
  const pagination = videosResp?.pagination;

  const userIds = useMemo(() => videos.map(v => v.userId), [videos]);
  const { userMap } = useUserNames(userIds);

  useEffect(() => { window.scrollTo(0, 0); }, [page]);

  const totalPages = pagination?.totalPages ?? 1;
  const totalItems = pagination?.totalItems ?? 0;

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [page, totalPages]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <Compass className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Explore Videos</h1>
              <p className="text-gray-600 mt-1">Discover the latest videos from our community</p>
            </div>
          </div>
          {!isLoading && totalItems > 0 && (
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalItems)} of {totalItems} videos
            </p>
          )}
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-video bg-gray-200" />
                <CardContent className="p-4">
                  <div className="h-4 bg-gray-200 rounded mb-2" />
                  <div className="h-3 bg-gray-200 rounded mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {error && (
          <Card className="p-8 text-center">
            <CardContent>
              <p className="text-red-600 mb-2">Failed to load videos</p>
              <p className="text-gray-500 text-sm">Please try again later</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && videos.length === 0 && (
          <Card className="p-8 text-center">
            <CardContent>
              <Compass className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No videos found</h3>
              <p className="text-gray-500">Check back soon for new content</p>
            </CardContent>
          </Card>
        )}

        {videos.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {videos.map((video) => (
                <VideoCard
                  key={video.videoId}
                  id={video.videoId}
                  title={video.title}
                  creator={video.userId}
                  creatorName={userMap[video.userId]}
                  thumbnail={video.thumbnailUrl || PLACEHOLDER_THUMB}
                  views={video.views}
                  rating={video.averageRating ?? 0}
                  tags={EMPTY_TAGS}
                  uploadDate={video.submittedAt}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                {pageNumbers[0] > 1 && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setPage(1)}>1</Button>
                    {pageNumbers[0] > 2 && <span className="text-gray-400 px-1">...</span>}
                  </>
                )}

                {pageNumbers.map(p => (
                  <Button
                    key={p}
                    variant={p === page ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}

                {pageNumbers[pageNumbers.length - 1] < totalPages && (
                  <>
                    {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
                      <span className="text-gray-400 px-1">...</span>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setPage(totalPages)}>
                      {totalPages}
                    </Button>
                  </>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default ExploreVideos;
