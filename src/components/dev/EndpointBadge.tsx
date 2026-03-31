const methodColors: Record<string, string> = {
  GET: 'text-kv-teal',
  POST: 'text-kv-orange',
  PUT: 'text-kv-orange',
  DELETE: 'text-red-400',
};

export const EndpointBadge = ({ endpoint }: { endpoint: string }) => {
  const [method, ...pathParts] = endpoint.split(' ');
  const path = pathParts.join(' ');
  const color = methodColors[method] || 'text-kv-text-light';

  return (
    <code className="text-xs font-mono bg-kv-surface px-2 py-1 rounded">
      <span className={color}>{method}</span>{' '}
      <span className="text-kv-text-muted">{path}</span>
    </code>
  );
};
