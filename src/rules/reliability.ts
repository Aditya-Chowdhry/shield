import type { ReviewRule } from './types.js';

export const reliabilityRule: ReviewRule = {
  id: 'ops/reliability',
  name: 'Reliability & Operability',
  category: 'Reliability',
  defaultSeverity: 'warning',
  enabledByDefault: true,
  applicability: {},
  requiredContext: 'diff',
  prompt: `Evaluate reliability, error handling, and operability.

Look for:
- Missing error handling on I/O, network calls, or external service interactions
- Swallowed errors (empty catch blocks, ignored error returns)
- Missing timeouts on HTTP calls, database queries, or external operations
- Non-idempotent operations that should be idempotent (payment processing, message handlers)
- Missing retry logic for transient failures (or retries without backoff/limits)
- Resource leaks (unclosed connections, file handles, streams)
- Logging that is noisy, missing context (no request_id, user_id), or logs PII
- Missing health checks or readiness probes for new services
- Deployability concerns (breaking changes without feature flags or rollback plan)
- Observability gaps (new failure paths without metrics/alerts)

Focus on production impact — what will break at 3 AM?`,
};
