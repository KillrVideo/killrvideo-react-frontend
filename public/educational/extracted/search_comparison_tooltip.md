# Semantic vs Keyword Search

KillrVideo supports two search modes optimized for different use cases:

| Aspect | Semantic Search | Keyword Search |
|--------|-----------------|----------------|
| **Matching** | Meaning-based | Exact text |
| **Example Query** | "learn coding" | "python tutorial" |
| **Matches** | "Programming Basics", "Software Dev" | "Python Tutorial" only |
| **Technology** | Vector embeddings + ANN | Text index + regex |
| **Speed** | ~50-200ms | ~10-50ms |
| **Accuracy** | Better for natural language | Better for exact terms |
| **Storage** | +16KB per video (vector) | Minimal |

**When to use**:
- **Semantic**: Natural language queries, concept-based discovery, "find videos like this"
- **Keyword**: Exact term matching, tag filtering, fast autocomplete

Both modes use Storage-Attached Indexes (SAI) for efficient querying without denormalized tables.
