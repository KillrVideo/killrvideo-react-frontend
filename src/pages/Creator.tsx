import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Video, BarChart3, Clock, Eye, Star } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { 
  useSubmitVideo, 
  useVideosByUser, 
  useProfile,
  useVideo,
  useUpdateVideo,
  useVideoStatus
} from '@/hooks/useApi';
import { VideoDetailResponse, PaginatedResponse } from '@/types/api';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';

export default function Creator() {
  const { user } = useAuth();
  const [videoUrl, setVideoUrl] = useState('');
  const [editingVideo, setEditingVideo] = useState<VideoDetailResponse | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    tags: ''
  });

  const { data: profile } = useProfile();
  const { data: videosData, isLoading } = useVideosByUser(user?.userId || '', 1, 20);
  const submitVideoMutation = useSubmitVideo();
  const updateVideoMutation = useUpdateVideo();

  const [pendingVideoId, setPendingVideoId] = useState<string | null>(null);
  const { data: fullVideo } = useVideo(pendingVideoId || '');

  // When full video arrives, initialize edit form
  useEffect(() => {
    if (fullVideo) {
      setEditingVideo(fullVideo as VideoDetailResponse);
      setEditForm({
        title: fullVideo.title,
        description: fullVideo.description || '',
        tags: (fullVideo.tags ?? []).join(', ')
      });
      setPendingVideoId(null);
    }
  }, [fullVideo]);

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const videos = (videosData as PaginatedResponse<VideoDetailResponse>)?.data || [];

  const handleSubmitVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;

    try {
      await submitVideoMutation.mutateAsync({ youtubeUrl: videoUrl });
      setVideoUrl('');
      toast.success('Video submitted successfully!');
    } catch (error: any) {
      toast.error(error.detail || 'Failed to submit video');
    }
  };

  const handleEditVideo = (videoSummary: any) => {
    setPendingVideoId(videoSummary.videoId);
  };

  const handleUpdateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVideo) return;

    try {
      await updateVideoMutation.mutateAsync({
        videoId: editingVideo.videoId,
        data: {
          title: editForm.title,
          description: editForm.description,
          tags: editForm.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        }
      });
      setEditingVideo(null);
      toast.success('Video updated successfully!');
    } catch (error: any) {
      toast.error(error.detail || 'Failed to update video');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'READY': return 'bg-green-500';
      case 'PROCESSING': return 'bg-yellow-500';
      case 'PENDING': return 'bg-blue-500';
      case 'ERROR': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  // Calculate stats
  const totalViews = videos.reduce((sum, video) => sum + (((video as any).views ?? (video as any).viewCount) as number), 0);
  const totalVideos = videos.length;
  const avgRating = videos.reduce((sum, video) => sum + (video.averageRating || 0), 0) / totalVideos || 0;

  return (
    <Layout>
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Creator Dashboard</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Video className="h-4 w-4 text-muted-foreground" />
                <div className="ml-2">
                  <p className="text-2xl font-bold">{totalVideos}</p>
                  <p className="text-xs text-muted-foreground">Total Videos</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <div className="ml-2">
                  <p className="text-2xl font-bold">{totalViews.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Views</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Star className="h-4 w-4 text-muted-foreground" />
                <div className="ml-2">
                  <p className="text-2xl font-bold">{avgRating.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Avg Rating</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <div className="ml-2">
                  <p className="text-2xl font-bold">
                    {videos.filter(v => v.status === 'READY').length}
                  </p>
                  <p className="text-xs text-muted-foreground">Published</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList>
            <TabsTrigger value="upload">Upload Video</TabsTrigger>
            <TabsTrigger value="manage">Manage Videos</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Submit New Video
                </CardTitle>
                <CardDescription>
                  Submit a YouTube URL to add a video to your channel
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitVideo} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="youtube-url">YouTube URL</Label>
                    <Input
                      id="youtube-url"
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      required
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={submitVideoMutation.isPending}
                    className="w-full"
                  >
                    {submitVideoMutation.isPending ? 'Submitting...' : 'Submit Video'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manage" className="space-y-4">
            {editingVideo && (
              <Card>
                <CardHeader>
                  <CardTitle>Edit Video</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleUpdateVideo} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-title">Title</Label>
                      <Input
                        id="edit-title"
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-description">Description</Label>
                      <Textarea
                        id="edit-description"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        rows={4}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-tags">Tags (comma-separated)</Label>
                      <Input
                        id="edit-tags"
                        value={editForm.tags}
                        onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                        placeholder="gaming, tutorial, entertainment"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={updateVideoMutation.isPending}>
                        {updateVideoMutation.isPending ? 'Updating...' : 'Update Video'}
                      </Button>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setEditingVideo(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4">
              {isLoading ? (
                <p>Loading videos...</p>
              ) : videos.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-muted-foreground">No videos uploaded yet</p>
                  </CardContent>
                </Card>
              ) : (
                videos.map((video) => (
                  <Card key={video.videoId}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-2">{video.title}</h3>
                          {video.description && (
                            <p className="text-muted-foreground mb-2">{video.description}</p>
                          )}
                          {video.tags && video.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                              {video.tags.map((tag, index) => (
                                <Badge key={index} variant="secondary">{tag}</Badge>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Eye className="h-4 w-4" />
                              {((video as any).views ?? (video as any).viewCount) as number} views
                            </div>
                            {video.averageRating && (
                              <div className="flex items-center gap-1">
                                <Star className="h-4 w-4" />
                                {video.averageRating.toFixed(1)}
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {new Date(video.submittedAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge className={getStatusColor(video.status)}>
                            {video.status}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditVideo(video)}
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
    </Layout>
  );
}
