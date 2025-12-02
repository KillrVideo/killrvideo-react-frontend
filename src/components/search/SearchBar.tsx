import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EducationalTooltip } from '@/components/educational/EducationalTooltip';

interface SearchBarProps {
  /** Query string that should pre-populate the input */
  initialQuery?: string;
  /** Additional tailwind classes for sizing / positioning */
  className?: string;
  /** If true, render a compact variant that hides the submit button on md+ screens */
  compact?: boolean;
}

const SearchBar = ({ initialQuery = '', className = '', compact = false }: SearchBarProps) => {
  const navigate = useNavigate();
  const [value, setValue] = useState(initialQuery);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (q) {
      navigate(`/search?q=${encodeURIComponent(q)}`);
    }
  };

  return (
    <EducationalTooltip id="search-vector-semantic" side="bottom">
      <form onSubmit={handleSubmit} className={`flex gap-4 ${className}`}>
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            type="text"
            placeholder="Search for videos, creators, or topics..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="pl-12 pr-4 py-3 h-12 text-gray-900"
          />
        </div>
        {!compact && (
          <Button type="submit" size="lg" className="h-12 px-8">
            Search
          </Button>
        )}
      </form>
    </EducationalTooltip>
  );
};

export default SearchBar; 