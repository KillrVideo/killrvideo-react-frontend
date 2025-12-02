# Educational Tooltip Content

This directory contains the educational content for KillrVideo's guided tour feature, explaining Astra DB and Cassandra features to help developers learn distributed database concepts.

## Directory Structure

```
educational/
├── README.md (this file)
├── tooltips-manifest.json - Index of all tooltips
├── features/
│   ├── sai-indexes.md - Storage-Attached Indexes
│   ├── vector-search.md - Vector similarity & AI recommendations
│   ├── search.md - Search implementation details
│   └── counters.md - Distributed counter columns (future)
└── schema/
    └── simplified-schema-reference.md - Schema highlights (future)
```

## How to Add New Tooltips

### 1. Create or Update Markdown Content

Add educational content to an existing file in `features/` or create a new one:

**File naming convention**: `kebab-case.md` (e.g., `time-series-modeling.md`)

**Content structure**:
```markdown
# Main Topic Title

Introduction paragraph explaining the feature at a high level.

## Section 1

Detailed explanation with examples.

### Code Examples

```cql
CREATE TABLE example (
  id UUID PRIMARY KEY,
  data text
);
\```

## Section 2 {#anchor-id}

Use anchor IDs for linking to specific sections.

## Learn More

- [Official Docs](https://docs.datastax.com)
- [Related Feature](./other-feature.md)
```

### 2. Register in Manifest

Add tooltip metadata to `tooltips-manifest.json`:

```json
{
  "id": "unique-tooltip-id",
  "title": "Tooltip Title",
  "contentFile": "features/your-file.md",
  "section": "anchor-id",
  "component": "ComponentName",
  "priority": "high|medium|low",
  "category": "search|recommendations|counters|etc"
}
```

**Fields explained**:
- `id`: Unique identifier used in code (e.g., `"search-sai-overview"`)
- `title`: Display title for the tooltip
- `contentFile`: Path to markdown file relative to `educational/`
- `section`: Anchor ID within the markdown file (use `"main"` for full file)
- `component`: React component where tooltip appears
- `priority`: Importance level
- `category`: Feature grouping for organization

### 3. Use in Components

Import and use the `EducationalTooltip` component:

```tsx
import { EducationalTooltip } from '@/components/educational/EducationalTooltip';

// Wrap any element
<EducationalTooltip id="your-tooltip-id">
  <YourComponent />
</EducationalTooltip>

// Or with an info icon
<EducationalTooltip id="your-tooltip-id" showIcon>
  <span>Feature Label</span>
</EducationalTooltip>
```

## Content Guidelines

### Writing Style

- **Be clear and concise**: Developers are busy, get to the point
- **Explain "why"**: Don't just describe what, explain why it matters
- **Show examples**: Include CQL code blocks, query patterns, data models
- **Link to more**: Provide links to official docs for deeper learning
- **Use real KillrVideo examples**: Reference actual tables/queries from the schema

### Technical Depth

- **Assume database knowledge**: Readers know SQL, understand JOINs, indexes
- **Don't assume Cassandra knowledge**: Explain distributed concepts clearly
- **Compare to traditional databases**: "In PostgreSQL you'd do X, in Cassandra you do Y"
- **Highlight tradeoffs**: Mention pros/cons, performance characteristics

### Code Blocks

Use CQL syntax highlighting:

````markdown
```cql
CREATE TABLE videos (
  videoid UUID PRIMARY KEY,
  name text,
  tags set<text>
);

CREATE INDEX videos_tags_idx ON videos(tags)
USING 'StorageAttachedIndex';
```
````

### Links

**Internal links** (to other markdown files):
```markdown
[Learn about SAI](./sai-indexes.md)
[Vector Search Section](./vector-search.md#recommendations)
```

**External links** (to official docs):
```markdown
[Astra DB Documentation](https://docs.datastax.com/en/astra-db-serverless/)
```

**Schema file links** (relative to repo root):
```markdown
[View Full Schema](../../../../../../../killrvideo-data/schema-astra.cql)
```

## Markdown Features Supported

The tooltip renderer supports GitHub Flavored Markdown (GFM):

- **Headers**: `# H1`, `## H2`, `### H3`
- **Bold**: `**text**`
- **Italic**: `*text*` or `_text_`
- **Code**: `` `inline` `` or triple backticks for blocks
- **Lists**: Unordered (`-`, `*`) and ordered (`1.`, `2.`)
- **Links**: `[text](url)`
- **Tables**: GFM table syntax
- **Strikethrough**: `~~text~~`
- **Syntax highlighting**: Code blocks with language tags

### Not Supported

- **Images**: Tooltips don't support images (keep content text-based)
- **HTML**: Rendered as plain text for security
- **Embeds**: No iframes, videos, or external embeds

## Schema Reference

When writing tooltips, reference these schema files for accurate examples:

- **Production schema**: `../../../../../killrvideo-data/schema-astra.cql`
- **Query examples**: `../../../../../killrvideo-data/examples/schema-v5-query-examples.cql`
- **Migration guide**: `../../../../../killrvideo-data/migrating/Migrating from 3.x to 5.0.md`

## Testing Content Changes

After editing markdown files:

1. **Save the file** - Changes load dynamically, no rebuild needed
2. **Refresh the browser** - Markdown is fetched fresh
3. **Enable guided tour** - Toggle in the header
4. **Hover over tooltips** - Verify content renders correctly

### Common Issues

**Tooltip not showing?**
- Check `tooltips-manifest.json` has correct `id` and `contentFile`
- Verify markdown file exists at specified path
- Ensure guided tour is enabled in header toggle

**Markdown not rendering?**
- Check for syntax errors (unmatched backticks, broken links)
- Verify code blocks use triple backticks with language tags
- Look for browser console errors

**Links not working?**
- Relative links must be correct from `educational/` directory
- External links must include `https://`
- Anchor links use `#section-id` format

## Content Organization Tips

### By Feature Area

Group related tooltips in the same markdown file:

- `sai-indexes.md` - All SAI-related tooltips
- `vector-search.md` - Vector similarity, embeddings, recommendations
- `counters.md` - View counts, ratings, aggregations
- `time-series.md` - Time-based partitioning, engagement metrics

### By Component

Alternatively, organize by UI location:

- `search.md` - SearchBar and SearchResults tooltips
- `video-watch.md` - Watch page tooltips
- `creator.md` - Video submission tooltips

Use the approach that makes maintenance easiest for your team.

## Portable Design

This directory is designed to be **portable across KillrVideo implementations**:

1. **Copy the entire `educational/` directory** to another project
2. **Update component names** in `tooltips-manifest.json`
3. **Adjust schema links** if file paths differ
4. **Reuse the React components** (`EducationalTooltip`, etc.)

The content is implementation-agnostic and focuses on Cassandra/Astra concepts rather than specific frontend frameworks.

## Contributing

When adding new tooltips:

1. **Research the feature** - Read schema, backend code, official docs
2. **Write for beginners** - Assume reader is learning Cassandra
3. **Show real examples** - Use actual KillrVideo tables/queries
4. **Test thoroughly** - Verify tooltips appear and render correctly
5. **Link to docs** - Provide paths for deeper learning

## Questions?

- See `CLAUDE.md` in repo root for architecture overview
- Check `../../../../../killrvideo-data/README.md` for schema versions
- Review official [Astra DB documentation](https://docs.datastax.com/en/astra-db-serverless/)

---

**Remember**: The goal is to help developers learn distributed database concepts through practical, working examples in KillrVideo. Focus on education, not just documentation.
