import { Star } from 'lucide-react';
import { useState } from 'react';
import { EducationalTooltip } from '@/components/educational/EducationalTooltip';

interface StarRatingProps {
  value: number; // current rating (0-5)
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: number; // icon size in px
}

const StarRating = ({ value, onChange, readOnly = false, size = 20 }: StarRatingProps) => {
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const displayValue = hoverValue !== null ? hoverValue : value;

  const handleClick = (val: number) => {
    if (readOnly || !onChange) return;
    onChange(val);
  };

  return (
    <EducationalTooltip id="counter-ratings" side="top">
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            className={`text-gray-300 hover:text-accent transition-colors ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
            onMouseEnter={() => !readOnly && setHoverValue(star)}
            onMouseLeave={() => !readOnly && setHoverValue(null)}
            onClick={() => handleClick(star)}
            aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
          >
            <Star
              className={`w-[${size}px] h-[${size}px] ${star <= displayValue ? 'fill-accent text-accent' : ''}`}
            />
          </button>
        ))}
      </div>
    </EducationalTooltip>
  );
};

export default StarRating; 