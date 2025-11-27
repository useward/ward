import type Database from "better-sqlite3";

export const initializeSchema = (db: Database.Database): void => {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS spans (
      trace_id TEXT NOT NULL,
      span_id TEXT NOT NULL,
      parent_span_id TEXT,
      name TEXT NOT NULL,
      kind INTEGER NOT NULL,
      start_time_unix_nano TEXT NOT NULL,
      end_time_unix_nano TEXT NOT NULL,
      attributes TEXT NOT NULL,
      events TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (trace_id, span_id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_spans_trace_id 
      ON spans(trace_id);
    CREATE INDEX IF NOT EXISTS idx_spans_start_time 
      ON spans(start_time_unix_nano DESC);
    CREATE INDEX IF NOT EXISTS idx_spans_source 
      ON spans(source);
    CREATE INDEX IF NOT EXISTS idx_spans_name 
      ON spans(name);

    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      data_points TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_metrics_name 
      ON metrics(name);
    CREATE INDEX IF NOT EXISTS idx_metrics_created 
      ON metrics(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_metrics_source 
      ON metrics(source);
  `);
};
