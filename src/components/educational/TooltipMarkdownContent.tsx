import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/utils';
import 'highlight.js/styles/github-dark.css';

interface TooltipMarkdownContentProps {
  content: string;
  title?: string;
  className?: string;
}

const TooltipMarkdownContent = ({
  content,
  title,
  className,
}: TooltipMarkdownContentProps) => {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      {title && <h4 className="font-semibold text-sm mb-2">{title}</h4>}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Open external links in new tab
          a: ({ node, children, href, ...props }) => {
            const isExternal = href?.startsWith('http');
            return (
              <a
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="text-blue-500 hover:underline"
                {...props}
              >
                {children}
                {isExternal && <span className="ml-1">→</span>}
              </a>
            );
          },
          // Style code blocks
          code: ({ node, inline, className, children, ...props }) => {
            if (inline) {
              return (
                <code
                  className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={cn('text-sm', className)} {...props}>
                {children}
              </code>
            );
          },
          // Style headings
          h1: ({ node, children, ...props }) => (
            <h1 className="text-lg font-bold mt-4 mb-2" {...props}>
              {children}
            </h1>
          ),
          h2: ({ node, children, ...props }) => (
            <h2 className="text-base font-semibold mt-3 mb-2" {...props}>
              {children}
            </h2>
          ),
          h3: ({ node, children, ...props }) => (
            <h3 className="text-sm font-semibold mt-2 mb-1" {...props}>
              {children}
            </h3>
          ),
          // Style lists
          ul: ({ node, children, ...props }) => (
            <ul className="list-disc pl-4 space-y-1 text-sm" {...props}>
              {children}
            </ul>
          ),
          ol: ({ node, children, ...props }) => (
            <ol className="list-decimal pl-4 space-y-1 text-sm" {...props}>
              {children}
            </ol>
          ),
          // Style paragraphs
          p: ({ node, children, ...props }) => (
            <p className="text-sm leading-relaxed mb-2" {...props}>
              {children}
            </p>
          ),
          // Style blockquotes
          blockquote: ({ node, children, ...props }) => (
            <blockquote
              className="border-l-4 border-blue-500 pl-4 italic text-sm my-2"
              {...props}
            >
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default TooltipMarkdownContent;
