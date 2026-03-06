import { handleWebhook, verifyWebhookSignature, type AppConfig } from '../webhook.js';
import type { Logger } from '../logger.js';

export interface WebhookResult {
  status: number;
  body: string;
}

/**
 * Shared webhook processing — used by all handlers (Worker, Lambda, etc.)
 * Takes raw HTTP primitives, returns a simple status + body.
 */
export async function processWebhook(
  method: string,
  headers: Record<string, string | undefined>,
  rawBody: string,
  env: EnvVars,
  log: Logger,
): Promise<WebhookResult> {
  if (method !== 'POST') {
    return { status: 200, body: 'Shield is running. POST GitHub webhooks here.' };
  }

  // Verify signature
  if (env.WEBHOOK_SECRET) {
    const signature = headers['x-hub-signature-256'] ?? '';
    const valid = await verifyWebhookSignature(rawBody, signature, env.WEBHOOK_SECRET);
    if (!valid) {
      log.warning('Invalid webhook signature');
      return { status: 401, body: 'Invalid signature' };
    }
  }

  const eventName = headers['x-github-event'] ?? '';
  if (!eventName) {
    return { status: 400, body: 'Missing x-github-event header' };
  }

  if (eventName === 'ping') {
    return { status: 200, body: 'pong' };
  }

  if (eventName !== 'issue_comment' && eventName !== 'pull_request_review_comment') {
    return { status: 200, body: 'Event not handled' };
  }

  const payload = JSON.parse(rawBody);

  const config: AppConfig = {
    githubAppId: env.GITHUB_APP_ID,
    githubPrivateKey: env.GITHUB_PRIVATE_KEY,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    model: env.CLAUDE_MODEL,
    triggerPhrase: env.TRIGGER_PHRASE ?? '@shield',
    webhookSecret: env.WEBHOOK_SECRET,
    slackBotToken: env.SLACK_BOT_TOKEN,
    slackWebhookUrl: env.SLACK_WEBHOOK_URL,
  };

  const handled = await handleWebhook(eventName, payload, config, log);

  return {
    status: 200,
    body: handled ? 'Review triggered' : 'Skipped (not a trigger event)',
  };
}

export interface EnvVars {
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  ANTHROPIC_API_KEY: string;
  CLAUDE_MODEL?: string;
  TRIGGER_PHRASE?: string;
  WEBHOOK_SECRET?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_WEBHOOK_URL?: string;
}
