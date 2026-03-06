import type { ReviewRule } from './types.js';

export const languageRule: ReviewRule = {
  id: 'language/best-practices',
  name: 'Language-Specific Best Practices',
  category: 'Language',
  defaultSeverity: 'suggestion',
  enabledByDefault: true,
  applicability: {},
  requiredContext: 'diff',
  prompt: `Evaluate language-specific idioms and best practices.
Auto-detect the language from file extensions and code patterns.

Look for:
- Non-idiomatic patterns where a cleaner language feature exists
- Known footguns in the specific language:
  - JS/TS: == vs ===, any abuse, unhandled promise rejections, missing await
  - Python: mutable default args, bare except, missing with-statements
  - Go: unchecked errors, goroutine leaks, defer in loops
  - Rust: unnecessary clones, unwrap in production code
  - Java: raw types, checked exception misuse, mutable collections exposure
- Safer alternatives (e.g., Optional instead of null, Result instead of exceptions)
- Deprecated APIs or patterns with modern replacements
- Type safety holes (casting, type assertions, any/unknown misuse)

Adapt your review to the specific language. Don't apply rules from one language to another.`,
};
