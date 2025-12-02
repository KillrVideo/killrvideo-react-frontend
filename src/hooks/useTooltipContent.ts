import { useState, useEffect } from 'react';
import tooltipsManifest from '@/data/educational/tooltips-manifest.json';

interface TooltipMetadata {
  id: string;
  title: string;
  contentFile: string;
  section?: string;
  explainerSource?: {
    file: string;
    lines: number[] | null;
    sections?: string[];
    note?: string;
  };
  component: string;
  priority: string;
  category: string;
}

interface TooltipContent {
  metadata: TooltipMetadata | null;
  content: string;
  isLoading: boolean;
  error: Error | null;
}

// Cache for loaded markdown content
const contentCache = new Map<string, string>();

export const useTooltipContent = (tooltipId: string): TooltipContent => {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Find tooltip metadata in manifest
  const metadata = tooltipsManifest.tooltips.find(
    (t: TooltipMetadata) => t.id === tooltipId
  ) || null;

  useEffect(() => {
    if (!metadata) {
      setError(new Error(`Tooltip ID "${tooltipId}" not found in manifest`));
      return;
    }

    const cacheKey = `${metadata.contentFile}#${metadata.section}`;

    // Check cache first
    if (contentCache.has(cacheKey)) {
      setContent(contentCache.get(cacheKey)!);
      return;
    }

    // Load markdown file
    setIsLoading(true);
    setError(null);

    fetch(`/educational/${metadata.contentFile}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${metadata.contentFile}: ${response.statusText}`);
        }
        return response.text();
      })
      .then((markdown) => {
        let extractedContent = markdown;

        // If section is specified and not "main", extract that section
        if (metadata.section && metadata.section !== 'main') {
          extractedContent = extractSection(markdown, metadata.section);
        }

        // Cache the content
        contentCache.set(cacheKey, extractedContent);
        setContent(extractedContent);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error loading tooltip content:', err);
        setError(err);
        setIsLoading(false);
      });
  }, [tooltipId, metadata]);

  return {
    metadata,
    content,
    isLoading,
    error,
  };
};

/**
 * Extract a specific section from markdown content using anchor ID
 * @param markdown Full markdown content
 * @param sectionId Anchor ID (e.g., "autocomplete" for ## Tag Autocomplete {#autocomplete})
 * @returns Extracted section content
 */
function extractSection(markdown: string, sectionId: string): string {
  const lines = markdown.split('\n');
  const anchorPattern = new RegExp(`\\{#${sectionId}\\}\\s*$`);

  let startIndex = -1;
  let endIndex = lines.length;
  let sectionLevel = 0;

  // Find the section start
  for (let i = 0; i < lines.length; i++) {
    if (anchorPattern.test(lines[i])) {
      startIndex = i;
      // Determine heading level (count # characters)
      const match = lines[i].match(/^(#{1,6})\s/);
      sectionLevel = match ? match[1].length : 2;
      break;
    }
  }

  if (startIndex === -1) {
    return markdown; // Section not found, return full content
  }

  // Find the section end (next heading of same or higher level)
  for (let i = startIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s/);
    if (match && match[1].length <= sectionLevel) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join('\n');
}

/**
 * Get all tooltips for a specific category
 */
export const useTooltipsByCategory = (category: string) => {
  return tooltipsManifest.tooltips.filter(
    (t: TooltipMetadata) => t.category === category
  );
};

/**
 * Get all tooltip categories
 */
export const getTooltipCategories = (): string[] => {
  const categories = new Set<string>();
  tooltipsManifest.tooltips.forEach((t: TooltipMetadata) => {
    categories.add(t.category);
  });
  return Array.from(categories);
};
