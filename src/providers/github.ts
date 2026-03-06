import { Octokit } from '@octokit/rest';
import type { VCSProvider } from './types.js';
import type {
  ReviewRequest,
  ChangeSet,
  ChangedFile,
  ReviewOutput,
  ReviewFinding,
  ExistingComment,
} from '../types.js';

export class GitHubProvider implements VCSProvider {
  readonly name = 'github' as const;
  private octokit: Octokit;

  constructor(tokenOrOctokit: string | Octokit) {
    this.octokit =
      typeof tokenOrOctokit === 'string'
        ? new Octokit({ auth: tokenOrOctokit })
        : tokenOrOctokit;
  }

  async fetchChangeSet(request: ReviewRequest): Promise<ChangeSet> {
    const { owner, name: repo } = request.repo;
    const prNumber = request.changeRequest.id;

    const files = await this.octokit.paginate(
      this.octokit.rest.pulls.listFiles,
      { owner, repo, pull_number: prNumber, per_page: 100 },
    );

    const changedFiles: ChangedFile[] = files.map((f) => ({
      path: f.filename,
      previousPath: f.previous_filename,
      status: this.mapFileStatus(f.status),
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? '',
    }));

    const stats = changedFiles.reduce(
      (acc, f) => ({
        additions: acc.additions + f.additions,
        deletions: acc.deletions + f.deletions,
        changedFiles: acc.changedFiles + 1,
      }),
      { additions: 0, deletions: 0, changedFiles: 0 },
    );

    return { files: changedFiles, stats };
  }

  async fetchFileContent(
    repo: { owner: string; name: string },
    path: string,
    ref: string,
  ): Promise<string> {
    const { data } = await this.octokit.rest.repos.getContent({
      owner: repo.owner,
      repo: repo.name,
      path,
      ref,
    });

    if ('content' in data && data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    throw new Error(`Cannot read file content for ${path} at ${ref}`);
  }

  async fetchExistingComments(
    request: ReviewRequest,
  ): Promise<ExistingComment[]> {
    const { owner, name: repo } = request.repo;
    const prNumber = request.changeRequest.id;

    const comments = await this.octokit.paginate(
      this.octokit.rest.pulls.listReviewComments,
      { owner, repo, pull_number: prNumber, per_page: 100 },
    );

    return comments.map((c) => ({
      id: c.id,
      body: c.body,
      path: c.path,
      line: c.line ?? undefined,
      author: c.user?.login ?? 'unknown',
    }));
  }

  async publishReview(
    request: ReviewRequest,
    output: ReviewOutput,
  ): Promise<void> {
    const { owner, name: repo } = request.repo;
    const prNumber = request.changeRequest.id;
    const commitId = request.changeRequest.headSha;

    const inlineFindings = output.findings.filter((f) => f.line);
    const generalFindings = output.findings.filter((f) => !f.line);

    const comments = inlineFindings.map((f) => ({
      path: f.file,
      line: f.line!,
      body: this.formatInlineComment(f),
    }));

    const summaryBody = this.formatSummary(output, generalFindings);

    try {
      await this.octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: commitId,
        body: summaryBody,
        event: 'COMMENT',
        comments,
      });
    } catch {
      // Fallback: post summary-only without inline comments
      await this.octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: commitId,
        body:
          summaryBody +
          '\n\n> *Some inline comments could not be posted due to line reference issues.*',
        event: 'COMMENT',
        comments: [],
      });
    }
  }

  async reactToTrigger(
    request: ReviewRequest,
    emoji: string,
  ): Promise<void> {
    if (!request.trigger.commentId) return;

    const { owner, name: repo } = request.repo;
    const reactionContent = (
      emoji === 'rocket' ? 'rocket' : emoji === '+1' ? '+1' : 'eyes'
    ) as '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes';

    if (request.trigger.type === 'mention' && request.trigger.commentId) {
      await this.octokit.rest.reactions.createForIssueComment({
        owner,
        repo,
        comment_id: request.trigger.commentId,
        content: reactionContent,
      });
    } else {
      await this.octokit.rest.reactions.createForPullRequestReviewComment({
        owner,
        repo,
        comment_id: request.trigger.commentId,
        content: reactionContent,
      });
    }
  }

  async fetchUserEmail(username: string): Promise<string | null> {
    try {
      const { data: user } = await this.octokit.rest.users.getByUsername({
        username,
      });
      return user.email ?? null;
    } catch {
      return null;
    }
  }

  private formatInlineComment(finding: ReviewFinding): string {
    const severityLabel = this.severityIcon(finding.severity);
    const parts: string[] = [
      `${severityLabel} **${finding.title}**`,
      '',
      finding.message,
    ];

    if (finding.evidence) {
      parts.push('', `**Why this matters:** ${finding.evidence}`);
    }

    if (finding.suggestion) {
      parts.push('', '**Suggestion:**', '```suggestion', finding.suggestion, '```');
    }

    parts.push('', `\`${finding.ruleId}\` | ${finding.confidence} confidence`);

    return parts.join('\n');
  }

  private formatSummary(
    output: ReviewOutput,
    generalFindings: ReviewFinding[],
  ): string {
    const parts: string[] = [
      '## Shield Review',
      '',
      output.summary,
      '',
      `**Risk Score:** ${this.riskBar(output.riskScore)}`,
    ];

    if (output.positives.length > 0) {
      parts.push('', '### What looks good', '');
      for (const p of output.positives) {
        parts.push(`- ${p}`);
      }
    }

    if (generalFindings.length > 0) {
      parts.push('', '### General observations', '');
      for (const f of generalFindings) {
        const icon = this.severityIcon(f.severity);
        parts.push(`- ${icon} **${f.title}** — ${f.message}`);
      }
    }

    const criticalCount = output.findings.filter(
      (f) => f.severity === 'critical',
    ).length;
    const warningCount = output.findings.filter(
      (f) => f.severity === 'warning',
    ).length;
    const suggestionCount = output.findings.filter(
      (f) => f.severity === 'suggestion' || f.severity === 'nitpick',
    ).length;

    parts.push(
      '',
      '---',
      `${criticalCount} critical | ${warningCount} warnings | ${suggestionCount} suggestions`,
      '',
      '*Generated by [Shield](https://github.com/adityachowdhry/shield) — AI Code Reviewer*',
    );

    return parts.join('\n');
  }

  private severityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return '🔴';
      case 'warning': return '🟡';
      case 'suggestion': return '🔵';
      case 'nitpick': return '⚪';
      default: return '⚪';
    }
  }

  private riskBar(score: number): string {
    const filled = Math.min(score, 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    const label =
      score <= 3 ? 'Low' : score <= 6 ? 'Moderate' : score <= 8 ? 'High' : 'Critical';
    return `\`${bar}\` ${score}/10 (${label})`;
  }

  private mapFileStatus(
    status: string,
  ): 'added' | 'modified' | 'deleted' | 'renamed' {
    switch (status) {
      case 'added': return 'added';
      case 'removed': return 'deleted';
      case 'renamed': return 'renamed';
      default: return 'modified';
    }
  }
}
