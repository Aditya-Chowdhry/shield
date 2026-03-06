import type { Notifier } from './types.js';
import type { ReviewRequest, ReviewOutput, ReviewFinding } from '../types.js';

export class SlackNotifier implements Notifier {
  readonly name = 'slack';
  private webhookUrl?: string;
  private botToken?: string;

  constructor(opts: { webhookUrl?: string; botToken?: string }) {
    this.webhookUrl = opts.webhookUrl;
    this.botToken = opts.botToken;
  }

  async notifyChannel(
    request: ReviewRequest,
    output: ReviewOutput,
    channel: string,
  ): Promise<void> {
    const blocks = this.buildBlocks(request, output);

    if (this.botToken) {
      await this.postViaAPI(channel, blocks);
    } else if (this.webhookUrl) {
      await this.postViaWebhook(blocks);
    }
  }

  async notifyUser(
    request: ReviewRequest,
    output: ReviewOutput,
    userId: string,
  ): Promise<void> {
    if (!this.botToken) {
      throw new Error(
        'Slack bot token is required for DMs. Webhook URLs only support channel posts.',
      );
    }

    // Open a DM conversation with the user
    const dmChannel = await this.openDM(userId);
    const blocks = this.buildBlocks(request, output);
    await this.postViaAPI(dmChannel, blocks);
  }

  /**
   * Look up a Slack user ID by their email address.
   * Returns null if no matching user is found.
   */
  async lookupUserByEmail(email: string): Promise<string | null> {
    if (!this.botToken) return null;

    const response = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.botToken}` },
      },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      ok: boolean;
      user?: { id: string };
      error?: string;
    };

    if (!data.ok || !data.user) return null;
    return data.user.id;
  }

  private buildBlocks(
    request: ReviewRequest,
    output: ReviewOutput,
  ): SlackBlock[] {
    const prUrl = request.changeRequest.url;
    const riskLabel = output.riskScore <= 3 ? 'Low' : output.riskScore <= 6 ? 'Moderate' : output.riskScore <= 8 ? 'High' : 'Critical';
    const riskEmoji = output.riskScore <= 3 ? ':large_green_circle:' : output.riskScore <= 6 ? ':large_yellow_circle:' : ':red_circle:';

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Shield Review: ${request.changeRequest.title}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `*PR:* <${prUrl}|#${request.changeRequest.id}>`,
            `*Author:* ${request.changeRequest.author}`,
            `*Risk:* ${riskEmoji} ${output.riskScore}/10 (${riskLabel})`,
          ].join('\n'),
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Summary*\n${output.summary}`,
        },
      },
    ];

    // Positives
    if (output.positives.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '*What looks good*\n' +
            output.positives.map((p) => `• ${p}`).join('\n'),
        },
      });
    }

    // Top findings (max 5 for Slack readability)
    const topFindings = output.findings.slice(0, 5);
    if (topFindings.length > 0) {
      blocks.push(
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              '*Key Findings*\n' +
              topFindings.map((f) => this.formatFinding(f)).join('\n'),
          },
        },
      );
    }

    // Stats footer
    const criticals = output.findings.filter((f) => f.severity === 'critical').length;
    const warnings = output.findings.filter((f) => f.severity === 'warning').length;
    const suggestions = output.findings.filter(
      (f) => f.severity === 'suggestion' || f.severity === 'nitpick',
    ).length;

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${criticals} critical | ${warnings} warnings | ${suggestions} suggestions | <${prUrl}|View on GitHub>`,
        },
      ],
    });

    return blocks;
  }

  private formatFinding(finding: ReviewFinding): string {
    const icon =
      finding.severity === 'critical'
        ? ':red_circle:'
        : finding.severity === 'warning'
          ? ':large_yellow_circle:'
          : ':large_blue_circle:';
    return `${icon} *${finding.title}* — \`${finding.file}${finding.line ? ':' + finding.line : ''}\`\n   ${finding.message.slice(0, 150)}`;
  }

  private async postViaAPI(
    channel: string,
    blocks: SlackBlock[],
  ): Promise<void> {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel, blocks }),
    });

    if (!response.ok) {
      throw new Error(`Slack HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }
  }

  private async postViaWebhook(blocks: SlackBlock[]): Promise<void> {
    const response = await fetch(this.webhookUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook error: ${response.status}`);
    }
  }

  private async openDM(userId: string): Promise<string> {
    const response = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: userId }),
    });

    if (!response.ok) {
      throw new Error(`Slack HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      ok: boolean;
      channel?: { id: string };
      error?: string;
    };
    if (!data.ok || !data.channel) {
      throw new Error(`Failed to open Slack DM: ${data.error}`);
    }
    return data.channel.id;
  }
}

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text: string;
  }>;
}
