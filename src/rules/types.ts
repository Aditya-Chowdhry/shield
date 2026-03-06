import type { Severity } from '../types.js';

export interface ReviewRule {
  /** Unique identifier, e.g. "security/input-validation" */
  id: string;
  name: string;
  category: string;
  defaultSeverity: Severity;
  enabledByDefault: boolean;

  /** When should this rule apply? */
  applicability: {
    /** File extensions (without dot), e.g. ["ts", "js", "py"] */
    languages?: string[];
    /** Glob patterns for files to include */
    pathPatterns?: string[];
    /** Glob patterns for files to exclude */
    excludePatterns?: string[];
  };

  /** How much context does this rule need? */
  requiredContext: 'diff' | 'full-file' | 'related-files';

  /**
   * The review prompt for this rule.
   * This is the rubric text sent to the LLM for evaluation.
   * Should describe what to look for and why it matters.
   */
  prompt: string;
}
