import type { ReviewRule } from './types.js';

export const unixRule: ReviewRule = {
  id: 'design/unix-philosophy',
  name: 'Unix Philosophy',
  category: 'Design',
  defaultSeverity: 'suggestion',
  enabledByDefault: true,
  applicability: {},
  requiredContext: 'diff',
  prompt: `Evaluate against Unix philosophy: small, composable, explicit.

Look for:
- Components that try to do too much — can they be split?
- Implicit dependencies or hidden coupling between modules
- Functions with unclear inputs/outputs (relying on global state, ambient context)
- Hard-to-test code due to tight coupling or side effects mixed with logic
- Failure modes that are silent instead of loud and early
- Monolithic functions that could be a pipeline of transformations

Only flag when the lack of composability is causing a real problem:
harder to test, harder to reuse, or harder to understand.`,
};
