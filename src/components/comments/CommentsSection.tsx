import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { components } from '@/types/killrvideo-openapi-types';
import { useComments, useAddComment } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { EducationalTooltip } from '@/components/educational/EducationalTooltip';

type Comment = components['schemas']['CommentResponse'];

interface CommentsSectionProps {
  videoId: string;
}

const getSentimentBadgeClasses = (sentiment?: number | null) => {
  if (sentiment && sentiment > 0.1) return 'bg-green-100 text-green-800';
  if (sentiment && sentiment < -0.1) return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-800';
};

const CommentsSection = ({ videoId }: CommentsSectionProps) => {
  const { isAuthenticated } = useAuth();
  const [page, setPage] = useState(1);
  const [comments, setComments] = useState<Comment[]>([]);

  const {
    data: commentPage,
    isFetching,
  } = useComments(videoId, page);

  // Append new comments when page data arrives
  useEffect(() => {
    if (commentPage) {
      setComments((prev) =>
        page === 1 ? (commentPage.data as Comment[]) : [...prev, ...(commentPage.data as Comment[])]
      );
    }
  }, [commentPage, page]);

  // Mutation for adding comment
  const addComment = useAddComment(videoId);
  const [text, setText] = useState('');

  const handleSubmit = async () => {
    if (!text.trim()) return;
    try {
      await addComment.mutateAsync(text.trim());
      setText('');
      setPage(1); // reset pagination to load latest comments
    } catch (err: unknown) {
      // Simple client-side feedback; could be replaced with toast
      const apiError = err as { detail?: string };
      alert(apiError?.detail ?? 'Unable to add comment.');
    }
  };

  const totalPages = commentPage?.pagination.totalPages ?? 1;

  return (
    <div>
      {/* Comments Section Header */}
      <EducationalTooltip id="comments-timeuuid" showIcon side="right">
        <h2 className="font-sora text-xl font-semibold text-gray-900 mb-4">
          Comments
        </h2>
      </EducationalTooltip>

      {/* Comment form */}
      {isAuthenticated && (
        <div className="mb-6 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment..."
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={addComment.isPending} onClick={handleSubmit}>
              Comment
            </Button>
          </div>
        </div>
      )}

      {/* Comments list */}
      <div className="space-y-4">
        {comments.map((comment) => (
          <Card key={comment.commentid} className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <h4 className="font-noto font-semibold text-gray-900">
                    {/* Prefer backend-supplied name fields if available */}
                    {('firstName' in comment && (comment as Comment & { firstName?: string }).firstName)
                      ? `${(comment as Comment & { firstName?: string; lastName?: string }).firstName} ${(comment as Comment & { firstName?: string; lastName?: string }).lastName ?? ''}`.trim()
                      : comment.userid.substring(0, 8)}
                  </h4>
                  <Badge
                    className={`text-xs ${getSentimentBadgeClasses(comment.sentiment_score)}`}
                  >
                    {comment.sentiment_score?.toFixed(2) ?? 'neutral'}
                  </Badge>
                </div>
                {/* timestamp placeholder */}
              </div>
              <p className="font-noto text-gray-700">{comment.comment}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {page < totalPages && (
        <div className="flex justify-center mt-4">
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => setPage((p) => p + 1)}>
            {isFetching ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default CommentsSection; 