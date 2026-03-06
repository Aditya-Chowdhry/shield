import type { ReviewRule } from './types.js';

export const performanceRule: ReviewRule = {
  id: 'perf/hotspots',
  name: 'Performance & Scalability',
  category: 'Performance',
  defaultSeverity: 'warning',
  enabledByDefault: true,
  applicability: {},
  requiredContext: 'diff',
  prompt: `Identify performance and scalability concerns.

Look for:
- O(n^2) or worse algorithms where O(n) or O(n log n) is straightforward
- Unbounded loops or recursion without limits
- Memory leaks (growing caches without eviction, event listener accumulation)
- Blocking I/O on hot paths
- Missing caching for expensive repeated computations
- Large payload transfers (fetching entire collections when only a subset is needed)
- Synchronous operations that should be async
- Missing pagination on list endpoints
- Unnecessary re-renders or re-computations (frontend)
- Cold start concerns in serverless contexts

Only flag when there's a realistic scale where the issue matters.
"This is O(n^2) but n is always < 10" is not worth flagging.`,
};
