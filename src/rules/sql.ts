import type { ReviewRule } from './types.js';

export const sqlRule: ReviewRule = {
  id: 'data/sql-access',
  name: 'SQL & Data Access',
  category: 'Data',
  defaultSeverity: 'warning',
  enabledByDefault: true,
  applicability: {
    languages: ['sql', 'ts', 'js', 'py', 'java', 'go', 'rb', 'rs'],
  },
  requiredContext: 'diff',
  prompt: `Evaluate SQL queries and data access patterns. Only apply if the diff contains
SQL queries, ORM usage, database migrations, or data access code.

Look for:
- SELECT * or fetching unnecessary columns/rows
- Missing pagination (no LIMIT on potentially large result sets)
- N+1 query patterns (loop that fires a query per iteration)
- Missing indexes for columns used in WHERE, JOIN, ORDER BY
- Full table scans on large tables
- SQL injection vulnerabilities (string concatenation instead of parameterized queries)
- Missing transactions where atomicity is needed
- Schema changes without rollback strategy
- Migrations that lock tables for too long (adding columns with defaults on large tables)
- Connection pool exhaustion risks (long-running queries, missing timeouts)

If no SQL or data access code is present in the diff, skip this rule entirely.`,
};
