# Vector Search

**Vector search** finds videos based on semantic similarity rather than exact text matches.

## How it works

Text is converted to a vector (array of 4096 numbers), then Cassandra measures how similar vectors are using cosine similarity:

```
Query: "learn coding"
Results ranked by similarity:
  1. "Programming Tutorial" (0.92)
  2. "Software Development Basics" (0.89)
  3. "How to Code" (0.85)
```

Notice: None match exactly, but all are semantically related! This enables natural language queries like "funny cat videos" to match "Hilarious Feline Compilation" even with no shared words.

**Technology**: Astra DB's `vector<float, 4096>` data type with SAI indexes using COSINE similarity function.

**Performance**: Typical query time 50-200ms for semantic search vs 10-50ms for keyword search.
