import type { ReviewRule } from './types.js';
import { correctnessRule } from './correctness.js';
import { dddRule } from './ddd.js';
import { pragmaticRule } from './pragmatic.js';
import { unixRule } from './unix.js';
import { languageRule } from './language.js';
import { sqlRule } from './sql.js';
import { reliabilityRule } from './reliability.js';
import { securityRule } from './security.js';
import { testingRule } from './testing.js';
import { performanceRule } from './performance.js';
import { type ShieldConfig, customRuleToReviewRule } from '../config.js';
import type { ChangedFile } from '../types.js';

/** All built-in rules, ordered by review priority */
const BUILT_IN_RULES: ReviewRule[] = [
  correctnessRule,
  securityRule,
  dddRule,
  pragmaticRule,
  unixRule,
  languageRule,
  sqlRule,
  reliabilityRule,
  testingRule,
  performanceRule,
];

/**
 * Resolve which rules to apply based on config overrides and changed files.
 */
export function resolveRules(
  config: ShieldConfig,
  files: ChangedFile[],
): ReviewRule[] {
  const fileExtensions = new Set(
    files.map((f) => {
      const parts = f.path.split('.');
      return parts.length > 1 ? parts[parts.length - 1] : '';
    }),
  );

  // Merge built-in + custom rules from config
  const customRules = (config.customRules ?? []).map(customRuleToReviewRule);
  const allRules = [...BUILT_IN_RULES, ...customRules];

  return allRules.filter((rule) => {
    // Check config overrides
    if (config.rules?.disabled?.includes(rule.id)) return false;
    if (config.rules?.enabled?.includes(rule.id)) return true;
    if (!rule.enabledByDefault) return false;

    // Check language applicability
    if (rule.applicability.languages && rule.applicability.languages.length > 0) {
      const hasMatchingLang = rule.applicability.languages.some((lang) =>
        fileExtensions.has(lang),
      );
      if (!hasMatchingLang) return false;
    }

    return true;
  });
}

/**
 * Build the combined prompt from resolved rules.
 */
export function buildRubricPrompt(rules: ReviewRule[]): string {
  const sections = rules.map(
    (rule, i) => `### ${i + 1}. ${rule.name} [${rule.id}] (default: ${rule.defaultSeverity})\n\n${rule.prompt}`,
  );

  return sections.join('\n\n---\n\n');
}
