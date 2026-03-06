import type { ReviewRule } from './types.js';

export const correctnessRule: ReviewRule = {
  id: 'correctness/logic-bugs',
  name: 'Correctness & Logic Bugs',
  category: 'Correctness',
  defaultSeverity: 'critical',
  enabledByDefault: true,
  applicability: {},
  requiredContext: 'diff',
  prompt: `Look for correctness and logic bugs — this is the highest-value feedback you can give.

Focus on:
- Off-by-one errors, boundary conditions, edge cases
- Null/undefined dereferences that will crash at runtime
- Race conditions, TOCTOU issues
- Incorrect boolean logic, flipped conditions, wrong operators
- Missing return statements or unreachable code
- Type coercion bugs (especially in JS/TS)
- Wrong variable used (copy-paste errors)
- Broken error propagation (swallowed errors, wrong error type)
- State mutations that break invariants
- Incorrect assumptions about data shape or API contracts

Only flag issues you have HIGH confidence are actual bugs.
State the exact failure scenario: what input triggers it, what goes wrong.`,
};
