import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Code2 } from 'lucide-react';
import { useDevPanel } from '@/hooks/useDevPanel';

export const DevModeToggle = () => {
  const { isDevMode, toggleDevMode } = useDevPanel();

  return (
    <div className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors">
      <Code2 className="h-4 w-4 text-kv-teal" />
      <Label htmlFor="dev-mode-switch" className="text-sm font-medium cursor-pointer">
        Dev Panel
      </Label>
      <Switch
        id="dev-mode-switch"
        checked={isDevMode}
        onCheckedChange={toggleDevMode}
      />
    </div>
  );
};
