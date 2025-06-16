
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import VideoCard from '@/components/video/VideoCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2 } from 'lucide-react';
import { useSearchVideos } from '@/hooks/useApi';

const SearchResults = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const query = searchParams.get('q') || '';

  const { data: searchResults, isLoading, error } = useSearchVideos({
    query,
    page: 1,
    pageSize: 20
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchParams({ q: searchQuery.trim() });
    }
  };

  const formatViews = (views: number) => {
    if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
    if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
    return views.toString();
  };

  const getTimeAgo = (date: string) => {
    const now = new Date();
    const uploadTime = new Date(date);
    const diffTime = Math.abs(now.getTime() - uploadTime.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return `${Math.ceil(diffDays / 30)} months ago`;
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        {/* Search Bar */}
        <div className="max-w-2xl mx-auto mb-8">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                type="text"
                placeholder="Search for videos, creators, or topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-4 py-3 h-12 text-gray-900"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-8">
              Search
            </Button>
          </form>
        </div>

        {/* Search Results */}
        {query && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Search Results for "{query}"
            </h1>
            {searchResults && (
              <p className="text-gray-600">
                {searchResults.pagination.totalItems} results found
              </p>
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
                thumbnail={video.thumbnailUrl || '/placeholder.svg'}
                duration="5:32"
                views={video.viewCount}
                rating={video.averageRating}
                tags={[]}
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
