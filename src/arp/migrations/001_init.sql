-- Every number carries provenance: kind, source, as_of, marketplace.
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY, filename TEXT NOT NULL, kind TEXT NOT NULL,
  source_label TEXT NOT NULL, marketplace TEXT NOT NULL, uploaded_at TEXT NOT NULL,
  rows_ok INTEGER NOT NULL DEFAULT 0, rows_skipped INTEGER NOT NULL DEFAULT 0, notes TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, asin TEXT NOT NULL, marketplace TEXT NOT NULL CHECK (marketplace IN ('CA','US')),
  title TEXT, brand TEXT, category TEXT, first_seen TEXT NOT NULL, UNIQUE (asin, marketplace)
);
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  metric TEXT NOT NULL, value_num REAL, value_text TEXT, unit TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('observed','calculated','estimated','user_supplied','sample')),
  source TEXT NOT NULL, as_of TEXT NOT NULL, marketplace TEXT NOT NULL, import_id INTEGER REFERENCES imports(id)
);
CREATE INDEX IF NOT EXISTS ix_obs_prod_metric ON observations(product_id, metric, as_of);
CREATE TABLE IF NOT EXISTS watchlists (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS watchlist_items (
  watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, added_at TEXT NOT NULL,
  PRIMARY KEY (watchlist_id, product_id)
);
CREATE TABLE IF NOT EXISTS alert_rules (
  id INTEGER PRIMARY KEY, watchlist_id INTEGER REFERENCES watchlists(id) ON DELETE CASCADE,
  metric TEXT NOT NULL, op TEXT NOT NULL CHECK (op IN ('lt','gt','change_pct_gt')),
  threshold REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY, rule_id INTEGER NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, metric TEXT NOT NULL,
  value REAL, previous REAL, message TEXT NOT NULL, triggered_at TEXT NOT NULL, observation_id INTEGER,
  acknowledged INTEGER NOT NULL DEFAULT 0, UNIQUE (rule_id, product_id, observation_id)
);
CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY, marketplace TEXT NOT NULL CHECK (marketplace IN ('CA','US')),
  phrase TEXT NOT NULL, UNIQUE (marketplace, phrase)
);
CREATE TABLE IF NOT EXISTS keyword_observations (
  id INTEGER PRIMARY KEY, keyword_id INTEGER NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  metric TEXT NOT NULL, value_num REAL, asin TEXT, kind TEXT NOT NULL, source TEXT NOT NULL,
  as_of TEXT NOT NULL, import_id INTEGER REFERENCES imports(id)
);
CREATE INDEX IF NOT EXISTS ix_kwobs ON keyword_observations(keyword_id, metric, as_of);
CREATE TABLE IF NOT EXISTS fee_profiles (
  marketplace TEXT PRIMARY KEY CHECK (marketplace IN ('CA','US')), data TEXT NOT NULL,
  verified_at TEXT, source_note TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, notes TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_items (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, note TEXT,
  PRIMARY KEY (project_id, product_id)
);
CREATE TABLE IF NOT EXISTS calc_runs (
  id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, label TEXT,
  marketplace TEXT NOT NULL, inputs TEXT NOT NULL, outputs TEXT NOT NULL, created_at TEXT NOT NULL
);
