import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserActivity } from '@/hooks/useApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, MessageSquare, Star, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { UserActivity } from '@/types/api';
import { PAGINATION } from '@/lib/constants';

const PAGE_SIZE = PAGINATION.DEFAULT_PAGE_SIZE;

type ActivityFilter = 'all' | 'view' | 'comment' | 'rate';

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSeconds = Math.floor((now - then) / 1000);

  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
}

function activityIcon(type: UserActivity['activity_type']) {
  switch (type) {
    case 'view':
      return <Eye className="h-4 w-4" />;
    case 'comment':
      return <MessageSquare className="h-4 w-4" />;
    case 'rate':
      return <Star className="h-4 w-4" />;
  }
}

function activityBadgeVariant(type: UserActivity['activity_type']): 'default' | 'secondary' | 'outline' {
  switch (type) {
    case 'view':
      return 'secondary';
    case 'comment':
      return 'default';
    case 'rate':
      return 'outline';
  }
}

function activityLabel(type: UserActivity['activity_type']): string {
  switch (type) {
    case 'view':
      return 'Viewed';
    case 'comment':
      return 'Commented';
    case 'rate':
      return 'Rated';
  }
}

interface ActivityItemRowProps {
  activity: UserActivity;
}

const ActivityItemRow = ({ activity }: ActivityItemRowProps) => {
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-b-0">
      <div className="mt-0.5 flex-shrink-0 text-muted-foreground">
        {activityIcon(activity.activity_type)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={activityBadgeVariant(activity.activity_type)} className="text-xs">
            {activityLabel(activity.activity_type)}
          </Badge>
          <Link
            to={`/watch/${activity.videoid}`}
            className="text-sm font-medium text-primary hover:underline truncate"
          >
            Video: {activity.videoid}
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {formatRelativeTime(activity.activity_timestamp)}
        </p>
      </div>
    </div>
  );
};

interface ActivityListProps {
  userId: string;
  activityType?: string;
}

const ActivityList = ({ userId, activityType }: ActivityListProps) => {
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useUserActivity(
    userId,
    activityType,
    page,
    PAGE_SIZE,
  );

  const activities = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 animate-pulse">
            <div className="h-4 w-4 bg-muted rounded mt-0.5 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-3 bg-muted rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive text-sm">Failed to load activity. Please try again later.</p>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8">
        <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">No activity found.</p>
      </div>
    );
  }

  return (
    <div>
      <div>
        {activities.map((activity) => (
          <ActivityItemRow key={activity.activity_id} activity={activity} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page === totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {pagination && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, pagination.totalItems)} of {pagination.totalItems} activities
        </p>
      )}
    </div>
  );
};

interface ActivityTimelineProps {
  userId: string;
}

const ActivityTimeline = ({ userId }: ActivityTimelineProps) => {
  const [activeTab, setActiveTab] = useState<ActivityFilter>('all');

  const activityTypeParam = activeTab === 'all' ? undefined : activeTab;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Timeline</CardTitle>
        <CardDescription>
          Your recent video views, comments, and ratings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as ActivityFilter)}
          className="space-y-4"
        >
          <TabsList className="grid grid-cols-4 w-full sm:w-auto">
            <TabsTrigger value="all" className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              <span>All</span>
            </TabsTrigger>
            <TabsTrigger value="view" className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              <span>Views</span>
            </TabsTrigger>
            <TabsTrigger value="comment" className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Comments</span>
            </TabsTrigger>
            <TabsTrigger value="rate" className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5" />
              <span>Ratings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} key={activeTab}>
            <ActivityList userId={userId} activityType={activityTypeParam} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ActivityTimeline;
