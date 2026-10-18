# Migrations
`../schema.sql` always holds the full, current schema and is safe to re-run on an existing project (everything is `if not exists`).
Numbered files here are the incremental steps, for projects created from an older schema.sql:
- `0002_reviews_provider_results.sql`: review analysis rows and saved provider results (adds RLS "own rows" policies).
- (0001 is the original `schema.sql` content: 15 tables + suppliers.)
After any migration run `../tests/rls_check.sql`; every line must say ok = true.
- `0003_niches.sql`: niche report imports (for example Amazon Opportunity Explorer exports you download yourself).
