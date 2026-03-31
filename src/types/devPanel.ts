/** The three display modes for the query area. */
export type QueryMode = "cql" | "dataapi" | "tableapi";

/** The language options for the code snippet tab bar. */
export type LanguageName = "python" | "java" | "nodejs" | "csharp" | "go";

/** The operation category shown in the type badge. */
export type QueryType = "READ" | "WRITE" | "DELETE";

/** The role a column plays in the Cassandra primary key. */
export type KeyType = "partition" | "clustering" | "none";

/** Sort direction for clustering columns. */
export type SortDirection = "asc" | "desc";

/**
 * A single database operation: the CQL statement, its Data API equivalent,
 * and the metadata shown in the metadata bar.
 */
export interface DevPanelQuery {
  /** CQL statement with bind variable placeholders shown as ?. */
  cql: string;

  /** Equivalent Data API operation as a JavaScript method chain string. */
  dataApiMethodChain: string;

  /** Full Data API JSON request body. */
  dataApiBody: Record<string, unknown>;

  /** Equivalent Table API operation as a JavaScript method chain string. */
  tableApiMethodChain: string;

  /** Full Table API JSON request body. */
  tableApiBody: Record<string, unknown>;

  /** READ, WRITE, or DELETE — controls the type badge color. */
  type: QueryType;

  /** REST endpoint that triggers this database operation. */
  endpoint: string;

  /** Frontend source file and line where the hook is defined. */
  sourceFile: string;
}

/**
 * A single column in a Cassandra table schema.
 */
export interface SchemaColumn {
  name: string;
  type: string;
  keyType: KeyType;
  sortDirection?: SortDirection;
}

/**
 * The full schema for a Cassandra table.
 */
export interface TableSchema {
  tableName: string;
  columns: SchemaColumn[];
  description: string;
}

/**
 * Idiomatic driver code for one language.
 */
export interface LanguageExample {
  language: LanguageName;
  code: string;
}

/**
 * A complete dev panel entry combining query, schema, and language examples.
 */
export interface DevPanelEntry {
  key: string;
  label: string;
  query: DevPanelQuery;
  schema: TableSchema;
  languageExamples: LanguageExample[];
}

/**
 * The full static dataset: all entries and the route-to-key mapping.
 */
export interface DevPanelDataset {
  entries: Record<string, DevPanelEntry>;
  routeMap: Record<string, string[]>;
  tableOperations: Record<string, string[]>;
}
