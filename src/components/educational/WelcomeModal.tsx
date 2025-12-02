import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { BookOpen, Database, Search, Sparkles, TrendingUp } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export const WelcomeModal = () => {
  const [open, setOpen] = useState(false);
  const [enableTour, setEnableTour] = useState(false);
  const { guidedTourEnabled, toggleGuidedTour } = useAuth();

  useEffect(() => {
    // Check if user has been welcomed before
    const hasBeenWelcomed = localStorage.getItem('killrvideo_tour_welcomed');

    // Show modal if not welcomed and tour is not already enabled
    if (!hasBeenWelcomed && !guidedTourEnabled) {
      setOpen(true);
    }
  }, [guidedTourEnabled]);

  const handleStartTour = () => {
    if (enableTour && !guidedTourEnabled) {
      toggleGuidedTour();
    }
    localStorage.setItem('killrvideo_tour_welcomed', 'true');
    setOpen(false);
  };

  const handleMaybeLater = () => {
    localStorage.setItem('killrvideo_tour_welcomed', 'true');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <BookOpen className="w-6 h-6 text-blue-500" />
            Welcome to KillrVideo
          </DialogTitle>
          <DialogDescription className="text-base pt-2">
            An educational application demonstrating Astra DB and Apache Cassandra features
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            KillrVideo is designed to help you learn distributed database concepts through
            a real-world video sharing application. Throughout the app, you'll discover:
          </p>

          <div className="grid gap-3">
            <FeatureItem
              icon={<Search className="w-5 h-5" />}
              title="Storage-Attached Indexes (SAI)"
              description="Learn how SAI eliminates denormalized tables and enables flexible querying"
            />
            <FeatureItem
              icon={<Sparkles className="w-5 h-5" />}
              title="Vector Search & AI"
              description="Discover how vector embeddings power semantic search and recommendations"
            />
            <FeatureItem
              icon={<TrendingUp className="w-5 h-5" />}
              title="Distributed Counters"
              description="See how Cassandra handles view counts and ratings at scale"
            />
            <FeatureItem
              icon={<Database className="w-5 h-5" />}
              title="Time-Series Data"
              description="Understand partition key design for time-series queries"
            />
          </div>

          <div className="flex items-start space-x-3 bg-blue-50 dark:bg-blue-950 p-4 rounded-lg mt-4">
            <Checkbox
              id="enable-tour"
              checked={enableTour}
              onCheckedChange={(checked) => setEnableTour(checked === true)}
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="enable-tour"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Enable Guided Tour
              </label>
              <p className="text-sm text-muted-foreground">
                Show educational tooltips throughout the application explaining backend features
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleMaybeLater}>
            Maybe Later
          </Button>
          <Button onClick={handleStartTour} className="bg-blue-600 hover:bg-blue-700">
            {enableTour ? 'Start Tour' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface FeatureItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeatureItem = ({ icon, title, description }: FeatureItemProps) => {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-blue-500">{icon}</div>
      <div>
        <h4 className="font-medium text-sm">{title}</h4>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
};
