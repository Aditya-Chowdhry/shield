import type { ReviewRule } from './types.js';

export const pragmaticRule: ReviewRule = {
  id: 'design/pragmatic',
  name: 'Pragmatic Programmer Principles',
  category: 'Design',
  defaultSeverity: 'suggestion',
  enabledByDefault: true,
  applicability: {},
  requiredContext: 'diff',
  prompt: `Evaluate code against Pragmatic Programmer principles.

Look for:
- Methods doing too many things — should be short and focused
- DRY violations that will cause real maintenance pain (not cosmetic duplication)
- YAGNI violations — over-engineering, premature abstraction, building for hypothetical futures
- Wrong abstraction that makes code harder to change than duplication would
- God objects or god functions that accumulate unrelated responsibilities
- Deeply nested logic that could be flattened with early returns or extraction
- Magic numbers/strings that should be named constants

Be pragmatic about pragmatism — three similar lines are fine.
Only flag DRY when duplication will genuinely cause bugs when one copy is updated and another isn't.
Only flag abstraction when the cost of NOT abstracting is concrete and near-term.`,
};
