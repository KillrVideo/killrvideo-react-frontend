import { useState } from 'react';
import Layout from '@/components/layout/Layout';
import VideoCard from '@/components/video/VideoCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import { useTrendingVideos } from '@/hooks/useApi';

type TimePeriod = '1' | '7' | '30';

const Trending = () => {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('1');

  const { data: trendingData, isLoading, error } = useTrendingVideos(parseInt(timePeriod), 10);

  const getTimePeriodLabel = (period: TimePeriod) => {
    switch (period) {
      case '1': return 'Past 24 hours';
      case '7': return 'Past 7 days';
      case '30': return 'Past 30 days';
      default: return 'Past 24 hours';
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <TrendingUp className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Trending Videos</h1>
              <p className="text-gray-600 mt-1">Most viewed videos {getTimePeriodLabel(timePeriod).toLowerCase()}</p>
            </div>
          </div>
          
          <Select value={timePeriod} onValueChange={(value: TimePeriod) => setTimePeriod(value)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select time period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Past 24 hours</SelectItem>
              <SelectItem value="7">Past 7 days</SelectItem>
              <SelectItem value="30">Past 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-video bg-gray-200"></div>
                <CardContent className="p-4">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {error && (
          <Card className="p-8 text-center">
            <CardContent>
              <p className="text-red-600 mb-2">Failed to load trending videos</p>
              <p className="text-gray-500 text-sm">Please try again later</p>
            </CardContent>
          </Card>
        )}

        {trendingData && (
          <>
            {trendingData.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {trendingData.map((video, index) => (
                  <div key={video.videoId} className="relative">
                    <div className="absolute top-2 left-2 z-10 bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
                      #{index + 1}
                    </div>
                    <VideoCard
                      id={video.videoId}
                      title={video.title}
                      creator={video.userId}
                      thumbnail={video.thumbnailUrl}
                      duration="0:00"
                      views={video.viewCount}
                      rating={video.averageRating}
                      tags={[]}
                      uploadDate={video.submittedAt}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center">
                <CardContent>
                  <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No trending videos</h3>
                  <p className="text-gray-500">No videos found for the selected time period</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default Trending;
