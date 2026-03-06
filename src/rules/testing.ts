import type { ReviewRule } from './types.js';

export const testingRule: ReviewRule = {
  id: 'quality/testing',
  name: 'Test Adequacy',
  category: 'Quality',
  defaultSeverity: 'suggestion',
  enabledByDefault: true,
  applicability: {},
  requiredContext: 'diff',
  prompt: `Evaluate test coverage and test quality for the changes.

Look for:
- New behavior without corresponding tests
- Critical paths (auth, payments, data mutations) that need test coverage
- Tests that test implementation details instead of behavior (will break on refactor)
- Missing edge case tests (empty inputs, boundaries, error paths)
- Excessive mocking that hides real bugs
- Flaky test patterns (timing dependencies, order-dependent tests, shared state)
- Test descriptions that don't describe the behavior being tested

Be pragmatic — not every line needs a test. Focus on:
1. Is the happy path tested?
2. Are error/edge cases that could cause production issues tested?
3. Will the tests survive a reasonable refactor?

Don't demand tests for trivial changes, config, or pure wiring code.`,
};
