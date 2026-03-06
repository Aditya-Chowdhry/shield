import { createAppOctokit } from './auth.js';
import { createProvider } from './providers/factory.js';
import { SlackNotifier } from './notifier/slack.js';
import type { Notifier } from './notifier/types.js';
import { runReview } from './engine.js';
import type { ReviewRequest } from './types.js';
import type { Logger } from './logger.js';
import { consoleLogger } from './logger.js';

export interface AppConfig {
  githubAppId: string;
  githubPrivateKey: string;
  anthropicApiKey: string;
  model?: string;
  triggerPhrase: string;
  slackBotToken?: string;
  slackWebhookUrl?: string;
  webhookSecret?: string;
}

interface WebhookPayload {
  action?: string;
  comment?: {
    id: number;
    body: string;
    user?: { login: string };
  };
  issue?: {
    number: number;
    pull_request?: unknown;
  };
  pull_request?: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    user?: { login: string };
    head: { sha: string };
    base: { sha: string };
  };
  installation?: { id: number };
  repository?: {
    name: string;
    owner: { login: string };
  };
}

/**
 * Handle an incoming GitHub webhook event.
 * Returns true if the event was handled, false if skipped.
 */
export async function handleWebhook(
  eventName: string,
  payload: WebhookPayload,
  config: AppConfig,
  log: Logger = consoleLogger,
): Promise<boolean> {
  if (payload.action !== 'created') return false;

  const comment = payload.comment;
  if (!comment?.body?.includes(config.triggerPhrase)) return false;

  const repo = payload.repository;
  const installation = payload.installation;
  if (!repo || !installation) {
    log.warning('Missing repository or installation in webhook payload');
    return false;
  }

  // Route based on event type
  let request: ReviewRequest;

  if (eventName === 'issue_comment') {
    // Issue comment on a PR
    if (!payload.issue?.pull_request) return false; // Not a PR comment

    // Fetch full PR details (issue_comment doesn't include head/base SHA)
    const octokit = await createAppOctokit(
      config.githubAppId,
      config.githubPrivateKey,
      installation.id,
    );

    const { data: pr } = await octokit.rest.pulls.get({
      owner: repo.owner.login,
      repo: repo.name,
      pull_number: payload.issue.number,
    });

    request = buildReviewRequest(
      repo.owner.login,
      repo.name,
      pr.number,
      pr.title,
      pr.body ?? '',
      pr.user?.login ?? 'unknown',
      pr.base.sha,
      pr.head.sha,
      pr.html_url,
      comment,
    );
  } else if (eventName === 'pull_request_review_comment') {
    const pr = payload.pull_request;
    if (!pr) return false;

    request = buildReviewRequest(
      repo.owner.login,
      repo.name,
      pr.number,
      pr.title,
      pr.body ?? '',
      pr.user?.login ?? 'unknown',
      pr.base.sha,
      pr.head.sha,
      pr.html_url,
      comment,
    );
  } else {
    return false;
  }

  // Authenticate as the installation
  const octokit = await createAppOctokit(
    config.githubAppId,
    config.githubPrivateKey,
    installation.id,
  );

  const provider = createProvider('github', octokit);

  // Build notifiers
  const notifiers: Notifier[] = [];
  if (config.slackBotToken || config.slackWebhookUrl) {
    notifiers.push(
      new SlackNotifier({
        botToken: config.slackBotToken,
        webhookUrl: config.slackWebhookUrl,
      }),
    );
  }

  await runReview({
    provider,
    request,
    anthropicKey: config.anthropicApiKey,
    model: config.model,
    notifiers,
    log,
  });

  return true;
}

function buildReviewRequest(
  owner: string,
  repo: string,
  prNumber: number,
  title: string,
  description: string,
  author: string,
  baseSha: string,
  headSha: string,
  url: string,
  comment: { id: number; body: string; user?: { login: string } },
): ReviewRequest {
  const triggerType = comment.body.includes('recheck')
    ? ('recheck' as const)
    : ('mention' as const);

  return {
    provider: 'github',
    repo: { owner, name: repo },
    changeRequest: {
      id: prNumber,
      title,
      description,
      author,
      baseSha,
      headSha,
      url,
    },
    trigger: {
      type: triggerType,
      actor: comment.user?.login ?? 'unknown',
      commentId: comment.id,
    },
  };
}

/**
 * Verify the webhook signature from GitHub.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const computed =
    'sha256=' +
    Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  // Constant-time comparison
  if (computed.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}
