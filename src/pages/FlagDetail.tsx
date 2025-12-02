import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useGetFlagDetails, useActionFlag } from '@/hooks/useApi';
import { FlagResponse } from '@/types/api';
import { AlertTriangle, CheckCircle, XCircle, Clock, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';

export default function FlagDetail() {
  const { flagId } = useParams<{ flagId: string }>();
  const navigate = useNavigate();
  const [moderatorNotes, setModeratorNotes] = useState('');
  
  const { data: flagData, isLoading } = useGetFlagDetails(flagId!);
  const actionFlagMutation = useActionFlag(flagId!);

  // Type the flag data properly
  const flag = flagData as FlagResponse;

  const handleFlagAction = async (status: "open" | "under_review" | "approved" | "rejected") => {
    if (!flagId) return;
    
    try {
      await actionFlagMutation.mutateAsync({ 
        status, 
        moderatorNotes: moderatorNotes.trim() || undefined 
      });
      toast.success(`Flag ${status} successfully`);
      navigate('/moderation');
    } catch (error: unknown) {
      const apiError = error as { detail?: string };
      toast.error(apiError.detail || 'Failed to update flag');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'under_review':
        return <Clock className="h-5 w-5 text-blue-500" />;
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertTriangle className="h-5 w-5" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'under_review':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto py-8 px-4">
          <div className="text-center">Loading flag details...</div>
        </div>
      </Layout>
    );
  }

  if (!flag) {
    return (
      <Layout>
        <div className="container mx-auto py-8 px-4">
          <div className="text-center">Flag not found</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/moderation')} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Moderation
          </Button>
          <h1 className="text-3xl font-bold">Flag Details</h1>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  {getStatusIcon(flag.status)}
                  <span>Flag #{flag.flagId.slice(0, 8)}</span>
                </CardTitle>
                <Badge className={getStatusColor(flag.status)}>
                  {flag.status.replace('_', ' ')}
                </Badge>
              </div>
              <CardDescription>
                {flag.contentType} flagged for {flag.reasonCode}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Content Type</p>
                  <p className="text-sm text-muted-foreground capitalize">{flag.contentType}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Content ID</p>
                  <p className="text-sm text-muted-foreground">{flag.contentId}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Reason Code</p>
                  <p className="text-sm text-muted-foreground capitalize">{flag.reasonCode}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Reported Date</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(flag.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {flag.reasonText && (
                <div>
                  <p className="text-sm font-medium">Reporter's Additional Details</p>
                  <p className="text-sm text-muted-foreground mt-1">{flag.reasonText}</p>
                </div>
              )}

              {flag.moderatorNotes && (
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm font-medium">Previous Moderator Notes</p>
                  <p className="text-sm text-muted-foreground mt-1">{flag.moderatorNotes}</p>
                  {flag.moderatorId && (
                    <p className="text-xs text-muted-foreground mt-2">
                      By moderator: {flag.moderatorId}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {flag.status !== 'approved' && flag.status !== 'rejected' && (
            <Card>
              <CardHeader>
                <CardTitle>Take Action</CardTitle>
                <CardDescription>Review the flagged content and take appropriate action</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="moderatorNotes">Moderator Notes</Label>
                  <Textarea
                    id="moderatorNotes"
                    placeholder="Add notes about your decision..."
                    value={moderatorNotes}
                    onChange={(e) => setModeratorNotes(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div className="flex space-x-2">
                  <Button
                    onClick={() => handleFlagAction('under_review')}
                    disabled={actionFlagMutation.isPending}
                    variant="outline"
                  >
                    Mark Under Review
                  </Button>
                  <Button
                    onClick={() => handleFlagAction('approved')}
                    disabled={actionFlagMutation.isPending}
                    variant="destructive"
                  >
                    Approve Flag & Remove Content
                  </Button>
                  <Button
                    onClick={() => handleFlagAction('rejected')}
                    disabled={actionFlagMutation.isPending}
                    variant="outline"
                  >
                    Reject Flag
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
