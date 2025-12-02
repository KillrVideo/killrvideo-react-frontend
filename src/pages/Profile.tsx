
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCommentsByUser } from '@/hooks/useApi';
import Layout from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { User, MessageSquare } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { CommentResponse } from '@/types/api';

const Profile = () => {
  const { user, isLoading } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch user's comments
  const { data: commentsData, isLoading: commentsLoading } = useCommentsByUser(
    user?.userId || '', 1, 20
  );

  const handleSave = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      await apiClient.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      
      setIsEditing(false);
      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFirstName(user?.firstName || '');
    setLastName(user?.lastName || '');
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center">
            <div className="text-lg">Loading profile...</div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Please log in to view your profile.
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">My Profile</h1>
          <p className="text-muted-foreground">
            Manage your account information and view your activity
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Profile Information
            </TabsTrigger>
            <TabsTrigger value="comments" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              My Comments
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your personal information here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    {isEditing ? (
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Enter your first name"
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">{user.firstName}</div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    {isEditing ? (
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Enter your last name"
                      />
                    ) : (
                      <div className="p-2 bg-muted rounded-md">{user.lastName}</div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <div className="p-2 bg-muted rounded-md text-muted-foreground">
                    {user.email}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Email cannot be changed
                  </p>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Account Status</Label>
                    <div className="p-2 bg-muted rounded-md capitalize">
                      {user.accountStatus}
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-muted-foreground">Member Since</Label>
                    <div className="p-2 bg-muted rounded-md">
                      {new Date(user.createdDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {user.roles.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground">Roles</Label>
                    <div className="p-2 bg-muted rounded-md">
                      {user.roles.join(', ')}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  {isEditing ? (
                    <>
                      <Button 
                        onClick={handleSave} 
                        disabled={isSaving}
                      >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={handleCancel}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setIsEditing(true)}>
                      Edit Profile
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="comments">
            <Card>
              <CardHeader>
                <CardTitle>My Comments</CardTitle>
                <CardDescription>
                  All comments you've made on videos
                </CardDescription>
              </CardHeader>
              <CardContent>
                {commentsLoading ? (
                  <div className="text-center py-8">
                    <div className="text-muted-foreground">Loading comments...</div>
                  </div>
                ) : commentsData?.data?.length ? (
                  <div className="space-y-4">
                    {commentsData.data.map((comment: CommentResponse, index: number) => (
                      <div key={comment.commentid || index} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-sm text-muted-foreground">
                            Video ID: {comment.videoid}
                          </div>
                        </div>
                        <p className="text-sm mb-2">{comment.comment}</p>
                        {comment.sentiment_score && (
                          <div className="text-xs text-muted-foreground">
                            Sentiment Score: {comment.sentiment_score.toFixed(2)}
                          </div>
                        )}
                      </div>
                    ))}
                    {commentsData.pagination && (
                      <div className="text-sm text-muted-foreground text-center pt-4">
                        Showing {commentsData.data.length} of {commentsData.pagination.totalItems} comments
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      You haven't made any comments yet.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Profile;
