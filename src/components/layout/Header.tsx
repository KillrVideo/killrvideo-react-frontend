import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api';
import { STORAGE_KEYS, EVENTS } from '@/lib/constants';
import { User, BookOpen } from 'lucide-react';
import SearchBar from '@/components/search/SearchBar';

const Header = () => {
  const { user, isAuthenticated, guidedTourEnabled, toggleGuidedTour } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      apiClient.clearToken();
      localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
      window.dispatchEvent(new Event(EVENTS.AUTH_CHANGE));
      navigate('/');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const getUserInitials = () => {
    if (!user) return 'U';
    return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';
  };

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">

      <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">KV</span>
            </div>
            <span className="font-bold text-xl">KillrVideo</span>
        </Link>
        
        <nav className="hidden md:flex items-center space-x-6">
          <Link to="/" className="text-foreground/60 hover:text-foreground transition-colors">
            Home
          </Link>
          <Link to="/trending" className="text-foreground/60 hover:text-foreground transition-colors">
            Trending
          </Link>
          {isAuthenticated && (
            <Link to="/creator" className="text-foreground/60 hover:text-foreground transition-colors">
              Creator Studio
            </Link>
          )}
        </nav>

        {/* Search bar (desktop) */}
        <div className="hidden md:block flex-1 mx-6 max-w-xl">
          <SearchBar compact initialQuery="" className="w-full" />
        </div>

        <div className="flex items-center space-x-4">
          {/* Guided Tour Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-accent transition-colors">
                <BookOpen className="h-4 w-4 text-blue-500" />
                <Label htmlFor="guided-tour-switch" className="text-sm font-medium cursor-pointer">
                  Guided Tour
                </Label>
                <Switch
                  id="guided-tour-switch"
                  checked={guidedTourEnabled}
                  onCheckedChange={toggleGuidedTour}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-sm">
                {guidedTourEnabled ? 'Tour is active' : 'Enable to see educational tooltips'}
              </p>
              <p className="text-xs text-muted-foreground">
                Learn about Cassandra/Astra features
              </p>
            </TooltipContent>
          </Tooltip>

          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    {user?.firstName && user?.lastName && (
                      <p className="font-medium">{user.firstName} {user.lastName}</p>
                    )}
                    <p className="w-[200px] truncate text-sm text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                {isAuthenticated && (
                  <DropdownMenuItem asChild>
                    <Link to="/creator">
                      Creator Studio
                    </Link>
                  </DropdownMenuItem>
                )}
                {user?.roles?.includes('moderator') && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/moderation">
                        Moderation
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="text-red-600 focus:text-red-600"
                >
                  {isLoggingOut ? 'Logging out...' : 'Log out'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth">
              <Button>Sign In</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
