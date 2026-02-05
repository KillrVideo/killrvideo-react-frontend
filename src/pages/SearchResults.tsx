import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import VideoCard from '@/components/video/VideoCard';
import { Button } from '@/components/ui/button';
import { Search, Loader2 } from 'lucide-react';
import { useSearchVideos, useUserNames } from '@/hooks/useApi';
import SearchBar from '@/components/search/SearchBar';
import { EducationalTooltip } from '@/components/educational/EducationalTooltip';
import { PAGINATION } from '@/lib/constants';

const EMPTY_TAGS: string[] = [];

const SearchResults = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  const { data: searchResults, isLoading, error } = useSearchVideos({
    query,
    page: PAGINATION.DEFAULT_PAGE,
    pageSize: PAGINATION.LARGE,
  });

  // Prefetch user names to avoid N+1 queries in VideoCard
  const userIds = useMemo(
    () => searchResults?.data?.map(v => v.userId) || [],
    [searchResults?.data]
  );
  const { userMap } = useUserNames(userIds);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        {/* Search Bar (page-level, always visible) */}
        <div className="max-w-2xl mx-auto mb-8">
          <SearchBar initialQuery={query} className="w-full" />
        </div>

        {/* Search Results */}
        {query && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Search Results for "{query}"
            </h1>
            {searchResults && (
              <EducationalTooltip id="search-results-ranking" showIcon side="right">
                <p className="text-gray-600">
                  {searchResults.pagination.totalItems} results found
                </p>
              </EducationalTooltip>
            )}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-gray-600">Searching videos...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">Failed to search videos</p>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Search Results Grid */}
        {searchResults && searchResults.data.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {searchResults.data.map((video) => (
              <VideoCard
                key={video.videoId}
                id={video.videoId}
                title={video.title}
                creator={video.userId}
                creatorName={userMap[video.userId]}
                thumbnail={video.thumbnailUrl || '/placeholder.svg'}
                duration="--:--"
                views={video.viewCount}
                rating={video.averageRating}
                tags={EMPTY_TAGS}
                uploadDate={video.submittedAt}
              />
            ))}
          </div>
        )}

        {/* No Results */}
        {searchResults && searchResults.data.length === 0 && query && !isLoading && (
          <div className="text-center py-12">
            <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No videos found
            </h3>
            <p className="text-gray-600 mb-6">
              Try adjusting your search terms or browse our trending videos instead.
            </p>
            <Button 
              onClick={() => window.location.href = '/trending'} 
              variant="outline"
            >
              Browse Trending Videos
            </Button>
          </div>
        )}

        {/* Empty State (no search query) */}
        {!query && (
          <div className="text-center py-12">
            <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Start your search
            </h3>
            <p className="text-gray-600">
              Enter a search term above to find videos, creators, or topics.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default SearchResults;
