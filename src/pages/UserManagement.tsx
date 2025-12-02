
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useSearchUsers, useAssignModerator, useRevokeModerator } from '@/hooks/useApi';
import { User } from '@/types/api';
import { Search, Shield, ShieldOff, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import { EducationalTooltip } from '@/components/educational/EducationalTooltip';

export default function UserManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const navigate = useNavigate();

  const { data: usersData, isLoading } = useSearchUsers(debouncedQuery);
  const assignModeratorMutation = useAssignModerator();
  const revokeModeratorMutation = useRevokeModerator();

  // Type the users data properly
  const users = (usersData as User[]) || [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedQuery(searchQuery.trim());
  };

  const handleAssignModerator = async (userId: string) => {
    try {
      await assignModeratorMutation.mutateAsync(userId);
      toast.success('Moderator role assigned successfully');
    } catch (error: any) {
      toast.error(error.detail || 'Failed to assign moderator role');
    }
  };

  const handleRevokeModerator = async (userId: string) => {
    try {
      await revokeModeratorMutation.mutateAsync(userId);
      toast.success('Moderator role revoked successfully');
    } catch (error: any) {
      toast.error(error.detail || 'Failed to revoke moderator role');
    }
  };

  const isModerator = (user: User) => {
    return user.roles?.includes('moderator');
  };

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/moderation')} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Moderation
          </Button>
          <h1 className="text-3xl font-bold mb-2">User Management</h1>
          <p className="text-muted-foreground">Search and manage user accounts and moderator roles</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Search Users</CardTitle>
            <CardDescription>Search for users by name or email to manage their accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <EducationalTooltip id="user-search-sai" side="bottom">
              <form onSubmit={handleSearch} className="flex space-x-2">
                <div className="flex-1 relative">
                  <Input
                    type="text"
                    placeholder="Search users by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                </div>
                <Button type="submit" disabled={isLoading}>
                  Search
                </Button>
              </form>
            </EducationalTooltip>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {users.map((user: User) => (
            <Card key={user.userId}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-semibold">
                        {user.firstName} {user.lastName}
                      </h3>
                      {isModerator(user) && (
                        <Badge variant="secondary" className="flex items-center space-x-1">
                          <Shield className="h-3 w-3" />
                          <span>Moderator</span>
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span>User ID: {user.userId}</span>
                      <span>Created: {new Date(user.createdDate).toLocaleDateString()}</span>
                      <span>Status: {user.accountStatus}</span>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    {isModerator(user) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevokeModerator(user.userId)}
                        disabled={revokeModeratorMutation.isPending}
                      >
                        <ShieldOff className="h-4 w-4 mr-2" />
                        Revoke Moderator
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAssignModerator(user.userId)}
                        disabled={assignModeratorMutation.isPending}
                      >
                        <Shield className="h-4 w-4 mr-2" />
                        Make Moderator
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {users.length === 0 && debouncedQuery && (
            <Card>
              <CardContent className="text-center py-8">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No users found for "{debouncedQuery}"</p>
              </CardContent>
            </Card>
          )}

          {!debouncedQuery && (
            <Card>
              <CardContent className="text-center py-8">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Enter a search term to find users</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
