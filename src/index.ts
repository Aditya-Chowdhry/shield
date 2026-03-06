import { handleWebhook, verifyWebhookSignature, type AppConfig } from './webhook.js';
import { consoleLogger } from './logger.js';

export interface Env {
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  ANTHROPIC_API_KEY: string;
  CLAUDE_MODEL?: string;
  TRIGGER_PHRASE?: string;
  WEBHOOK_SECRET?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_WEBHOOK_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Shield is running. POST GitHub webhooks here.', {
        status: 200,
      });
    }

    const log = consoleLogger;

    try {
      const body = await request.text();

      // Verify webhook signature if secret is configured
      if (env.WEBHOOK_SECRET) {
        const signature = request.headers.get('x-hub-signature-256') ?? '';
        const valid = await verifyWebhookSignature(
          body,
          signature,
          env.WEBHOOK_SECRET,
        );
        if (!valid) {
          log.warning('Invalid webhook signature');
          return new Response('Invalid signature', { status: 401 });
        }
      }

      const eventName = request.headers.get('x-github-event') ?? '';
      if (!eventName) {
        return new Response('Missing x-github-event header', { status: 400 });
      }

      // Ping event — GitHub sends this when the webhook is first configured
      if (eventName === 'ping') {
        return new Response('pong', { status: 200 });
      }

      // Only handle comment events
      if (
        eventName !== 'issue_comment' &&
        eventName !== 'pull_request_review_comment'
      ) {
        return new Response('Event not handled', { status: 200 });
      }

      const payload = JSON.parse(body);

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

      // Run the review in the background so we respond to GitHub quickly.
      // Cloudflare Workers ctx.waitUntil would be ideal here, but
      // we need to handle it at the caller level. For now, we await
      // since Workers have a 30s CPU limit (sufficient for most reviews).
      const handled = await handleWebhook(eventName, payload, config, log);

      return new Response(
        handled ? 'Review triggered' : 'Skipped (not a trigger event)',
        { status: 200 },
      );
    } catch (error) {
      log.error(
        `Webhook error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return new Response('Internal error', { status: 500 });
    }
  },
};
