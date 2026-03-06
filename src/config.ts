import { parse as parseYaml } from 'yaml';
import type { VCSProvider } from './providers/types.js';
import type { ReviewRequest, Severity } from './types.js';
import type { ReviewRule } from './rules/types.js';
import type { Logger } from './logger.js';

export interface SlackConfig {
  /** Post review summary to this channel */
  channel?: string;
  /** DM the review to this Slack user ID (or comma-separated list) */
  dmUsers?: string[];
}

export interface NotificationsConfig {
  slack?: SlackConfig;
}

export interface ShieldConfig {
  /** Max inline comments to post (prevents noise) */
  maxComments: number;
  /** Minimum severity to post as inline comment */
  minSeverity: Severity;
  /** Minimum confidence to post */
  minConfidence: 'high' | 'medium' | 'low';
  /** File patterns to always skip */
  ignorePaths: string[];
  /** Rule overrides */
  rules?: {
    enabled?: string[];
    disabled?: string[];
  };
  /** Custom rules defined in config (no code changes needed) */
  customRules?: CustomRuleConfig[];
  /** Notification channels */
  notifications?: NotificationsConfig;
}

export interface CustomRuleConfig {
  id: string;
  name: string;
  category?: string;
  severity?: Severity;
  prompt: string;
  languages?: string[];
}

/**
 * Convert a custom rule config into a full ReviewRule.
 */
export function customRuleToReviewRule(config: CustomRuleConfig): ReviewRule {
  return {
    id: config.id,
    name: config.name,
    category: config.category ?? 'Custom',
    defaultSeverity: config.severity ?? 'suggestion',
    enabledByDefault: true,
    applicability: {
      languages: config.languages,
    },
    requiredContext: 'diff',
    prompt: config.prompt,
  };
}

const DEFAULT_CONFIG: ShieldConfig = {
  maxComments: 10,
  minSeverity: 'suggestion',
  minConfidence: 'medium',
  ignorePaths: [
    '*.lock',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '*.min.js',
    '*.min.css',
    '*.generated.*',
    '*.g.dart',
    'dist/**',
    'build/**',
    'vendor/**',
    'node_modules/**',
    '*.pb.go',
    '*_generated.go',
  ],
};

const SEVERITY_ORDER: Record<Severity, number> = {
  nitpick: 0,
  suggestion: 1,
  warning: 2,
  critical: 3,
};

export function severityAtLeast(
  severity: Severity,
  minimum: Severity,
): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[minimum];
}

/**
 * Load .shield.yml from the repo root. Falls back to defaults if not found.
 */
export async function loadConfig(
  provider: VCSProvider,
  request: ReviewRequest,
  log: Logger,
): Promise<ShieldConfig> {
  try {
    const content = await provider.fetchFileContent(
      request.repo,
      '.shield.yml',
      request.changeRequest.headSha,
    );
    const parsed = parseYaml(content) as Partial<ShieldConfig>;
    const config = {
      ...DEFAULT_CONFIG,
      ...parsed,
      ignorePaths: [
        ...DEFAULT_CONFIG.ignorePaths,
        ...(parsed.ignorePaths ?? []),
      ],
    };
    log.info('.shield.yml loaded from repo');
    return config;
  } catch {
    log.info('No .shield.yml found, using defaults');
    return DEFAULT_CONFIG;
  }
}
