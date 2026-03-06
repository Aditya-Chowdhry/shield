import type { VCSProvider } from './providers/types.js';
import type { Notifier } from './notifier/types.js';
import type { ReviewRequest, ReviewOutput, ChangedFile } from './types.js';
import { loadConfig, type ShieldConfig } from './config.js';
import { resolveRules } from './rules/registry.js';
import { Analyzer } from './analyzer.js';
import type { Logger } from './logger.js';
import { consoleLogger } from './logger.js';

export interface ReviewOptions {
  provider: VCSProvider;
  request: ReviewRequest;
  anthropicKey: string;
  model?: string;
  notifiers?: Notifier[];
  log?: Logger;
}

/**
 * Core review engine — provider-agnostic orchestration.
 * Coordinates: config loading, file filtering, rule resolution, analysis, publishing.
 */
export async function runReview(opts: ReviewOptions): Promise<void> {
  const { provider, request, anthropicKey, model, notifiers } = opts;
  const log = opts.log ?? consoleLogger;

  // 1. Acknowledge the trigger
  await provider.reactToTrigger(request, 'eyes').catch(() => {});

  log.info(
    `Starting review for ${request.repo.owner}/${request.repo.name}#${request.changeRequest.id}`,
  );

  // 2. Load repo config
  const config = await loadConfig(provider, request, log);
  log.info(
    `Config loaded: max ${config.maxComments} comments, min severity: ${config.minSeverity}`,
  );

  // 3. Fetch changeset
  const changeSet = await provider.fetchChangeSet(request);
  log.info(
    `Fetched ${changeSet.stats.changedFiles} files (+${changeSet.stats.additions} -${changeSet.stats.deletions})`,
  );

  // 4. Filter out ignored files
  const filteredFiles = filterFiles(changeSet.files, config);
  if (filteredFiles.length === 0) {
    log.info('No reviewable files after filtering. Skipping review.');
    return;
  }
  log.info(`${filteredFiles.length} files to review after filtering`);

  const filteredChangeSet = {
    files: filteredFiles,
    stats: {
      additions: filteredFiles.reduce((sum, f) => sum + f.additions, 0),
      deletions: filteredFiles.reduce((sum, f) => sum + f.deletions, 0),
      changedFiles: filteredFiles.length,
    },
  };

  // 5. Resolve applicable rules
  const rules = resolveRules(config, filteredFiles);
  log.info(`${rules.length} rules applicable: ${rules.map((r) => r.id).join(', ')}`);

  // 6. Fetch existing comments for dedup
  const existingComments = await provider.fetchExistingComments(request);
  log.info(`${existingComments.length} existing review comments found`);

  // 7. Run analysis
  const analyzer = new Analyzer(anthropicKey, model);
  const output = await analyzer.review(
    request,
    filteredChangeSet,
    rules,
    config,
    existingComments,
  );

  log.info(
    `Analysis complete: ${output.findings.length} findings, risk score: ${output.riskScore}/10`,
  );

  // 8. Publish
  if (output.findings.length === 0) {
    log.info('No findings to post. PR looks clean!');
  }

  await provider.publishReview(request, output);
  log.info('Review published successfully.');

  // 9. Send notifications (Slack DM + channel)
  if (notifiers && notifiers.length > 0) {
    await sendNotifications(provider, notifiers, request, output, config, log);
  }

  // 10. React with rocket to show completion
  await provider.reactToTrigger(request, 'rocket').catch(() => {});
}

async function sendNotifications(
  provider: VCSProvider,
  notifiers: Notifier[],
  request: ReviewRequest,
  output: ReviewOutput,
  config: ShieldConfig,
  log: Logger,
): Promise<void> {
  const slackConfig = config.notifications?.slack;

  // Resolve PR author's email → Slack user ID for auto-DM
  const authorEmail = await provider
    .fetchUserEmail(request.changeRequest.author)
    .catch(() => null);

  for (const notifier of notifiers) {
    try {
      // Post to channel
      if (slackConfig?.channel) {
        await notifier.notifyChannel(request, output, slackConfig.channel);
        log.info(`Notification sent to channel: ${slackConfig.channel}`);
      }

      // DM the PR author via email lookup
      if (authorEmail) {
        const slackUserId = await notifier.lookupUserByEmail(authorEmail);
        if (slackUserId) {
          await notifier.notifyUser(request, output, slackUserId);
          log.info(
            `DM sent to PR author: ${request.changeRequest.author} (${authorEmail})`,
          );
        } else {
          log.info(
            `Could not find Slack user for email: ${authorEmail}. Skipping author DM.`,
          );
        }
      } else {
        log.info(
          `No public email for GitHub user: ${request.changeRequest.author}. Skipping author DM.`,
        );
      }

      // DM additional explicit users from config
      if (slackConfig?.dmUsers) {
        for (const userId of slackConfig.dmUsers) {
          await notifier.notifyUser(request, output, userId);
          log.info(`DM sent to configured user: ${userId}`);
        }
      }
    } catch (error) {
      log.warning(
        `Failed to send ${notifier.name} notification: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function filterFiles(
  files: ChangedFile[],
  config: ShieldConfig,
): ChangedFile[] {
  return files.filter((file) => {
    if (file.status === 'deleted') return false;
    if (!file.patch) return false;
    if (matchesAnyPattern(file.path, config.ignorePaths)) return false;
    return true;
  });
}

function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchGlob(filePath, pattern)) return true;
  }
  return false;
}

function matchGlob(filePath: string, pattern: string): boolean {
  if (pattern.startsWith('*.') && !pattern.includes('/')) {
    return filePath.endsWith(pattern.slice(1));
  }
  if (!pattern.includes('*')) {
    return filePath === pattern || filePath.endsWith('/' + pattern);
  }
  if (pattern.endsWith('/**')) {
    const dir = pattern.slice(0, -3);
    return filePath.startsWith(dir + '/') || filePath === dir;
  }
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');
  return new RegExp(`^${regex}$`).test(filePath);
}
