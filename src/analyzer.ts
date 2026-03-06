import Anthropic from '@anthropic-ai/sdk';
import type {
  ChangeSet,
  ChangedFile,
  ReviewRequest,
  ReviewOutput,
  ReviewFinding,
  ExistingComment,
  Severity,
  Confidence,
} from './types.js';
import type { ReviewRule } from './rules/types.js';
import { buildRubricPrompt } from './rules/registry.js';
import type { ShieldConfig } from './config.js';
import { severityAtLeast } from './config.js';

const MAX_DIFF_CHARS = 100_000; // ~25k tokens

export class Analyzer {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model ?? 'claude-sonnet-4-20250514';
  }

  async review(
    request: ReviewRequest,
    changeSet: ChangeSet,
    rules: ReviewRule[],
    config: ShieldConfig,
    existingComments: ExistingComment[],
  ): Promise<ReviewOutput> {
    const rubric = buildRubricPrompt(rules);
    const diffContent = this.buildDiffContent(changeSet.files);
    const existingFeedback = this.summarizeExisting(existingComments);

    const systemPrompt = this.buildSystemPrompt(rubric);
    const userPrompt = this.buildUserPrompt(
      request,
      diffContent,
      changeSet.stats,
      existingFeedback,
      config,
    );

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    return this.parseResponse(text, config);
  }

  private buildSystemPrompt(rubric: string): string {
    return `You are Shield, an expert code reviewer. You review pull requests with precision, empathy, and actionable feedback.

## Your personality
- Polite and constructive — you're a colleague, not a gatekeeper
- Direct and concise — respect the developer's time
- Evidence-based — always explain WHY something matters with concrete impact
- Pragmatic — don't nitpick trivial style issues or demand perfection
- Encouraging — acknowledge what's done well, not just what's wrong

## Your rubric

${rubric}

## Output format

You MUST respond with valid JSON matching this exact schema:

\`\`\`json
{
  "summary": "2-3 sentence overview of the changes and overall assessment",
  "riskScore": 4,
  "positives": ["Thing done well 1", "Thing done well 2"],
  "findings": [
    {
      "ruleId": "security/basics",
      "severity": "critical",
      "confidence": "high",
      "category": "Security",
      "file": "src/api/handler.ts",
      "line": 42,
      "endLine": 45,
      "title": "SQL injection via string concatenation",
      "message": "User input is concatenated directly into the SQL query. This allows an attacker to execute arbitrary SQL.",
      "suggestion": "db.query('SELECT * FROM users WHERE id = $1', [userId])",
      "evidence": "An attacker could pass \\"; DROP TABLE users; --\\" as the userId parameter."
    }
  ]
}
\`\`\`

## Rules for findings
- \`line\` must reference a line number that exists in the diff (from the @@ hunk headers or + lines)
- \`suggestion\` should be the replacement code for the specific line(s), not a full rewrite
- Each finding must have concrete \`evidence\` explaining production impact
- Prefer fewer, higher-quality findings over many low-value ones
- If you're not confident about an issue, set confidence to "low"
- Group related issues into a single finding rather than multiple overlapping ones
- Do NOT repeat issues already covered in existing review comments

RESPOND WITH ONLY THE JSON OBJECT. No markdown fences, no explanation outside the JSON.`;
  }

  private buildUserPrompt(
    request: ReviewRequest,
    diff: string,
    stats: { additions: number; deletions: number; changedFiles: number },
    existingFeedback: string,
    config: ShieldConfig,
  ): string {
    const parts: string[] = [
      `## Pull Request`,
      `**Title:** ${request.changeRequest.title}`,
      `**Author:** ${request.changeRequest.author}`,
      `**Description:** ${request.changeRequest.description || '(no description)'}`,
      `**Stats:** +${stats.additions} -${stats.deletions} across ${stats.changedFiles} files`,
      '',
    ];

    if (existingFeedback) {
      parts.push(
        `## Existing review feedback (DO NOT repeat these)`,
        existingFeedback,
        '',
      );
    }

    parts.push(
      `## Diff`,
      '',
      diff,
      '',
      `## Instructions`,
      `- Max ${config.maxComments} inline findings`,
      `- Minimum severity to report: ${config.minSeverity}`,
      `- If the PR looks good, say so! An empty findings array with positive summary is perfectly fine.`,
      `- Focus on what changed, not pre-existing issues in surrounding context.`,
    );

    return parts.join('\n');
  }

  private buildDiffContent(files: ChangedFile[]): string {
    let content = '';
    for (const file of files) {
      if (!file.patch) continue;
      const header = `\n=== ${file.status.toUpperCase()} ${file.path} ===\n`;
      if (content.length + header.length + file.patch.length > MAX_DIFF_CHARS) {
        content += `\n=== ${file.path} (truncated — too large) ===\n`;
        continue;
      }
      content += header + file.patch + '\n';
    }
    return content;
  }

  private summarizeExisting(comments: ExistingComment[]): string {
    if (comments.length === 0) return '';
    return comments
      .slice(0, 20) // cap to avoid bloating the prompt
      .map(
        (c) =>
          `- ${c.path ? `${c.path}:${c.line ?? '?'}` : 'general'}: ${c.body.slice(0, 200)}`,
      )
      .join('\n');
  }

  private parseResponse(text: string, config: ShieldConfig): ReviewOutput {
    // Strip markdown fences if present
    const cleaned = text
      .replace(/^```json?\s*/m, '')
      .replace(/```\s*$/m, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as ReviewOutput;

      // Validate and filter findings
      const confidenceOrder: Record<string, number> = {
        low: 0,
        medium: 1,
        high: 2,
      };
      const minConf = confidenceOrder[config.minConfidence] ?? 1;

      parsed.findings = (parsed.findings ?? [])
        .filter((f): f is ReviewFinding => {
          if (!f.ruleId || !f.file || !f.title || !f.message) return false;
          if (!severityAtLeast(f.severity, config.minSeverity)) return false;
          if ((confidenceOrder[f.confidence] ?? 0) < minConf) return false;
          return true;
        })
        .slice(0, config.maxComments);

      parsed.summary = parsed.summary ?? 'Review complete.';
      parsed.riskScore = Math.min(10, Math.max(1, parsed.riskScore ?? 5));
      parsed.positives = parsed.positives ?? [];

      return parsed;
    } catch {
      // If parsing fails, return a minimal review
      return {
        summary: 'Shield encountered an issue parsing the review. Raw output is available in logs.',
        findings: [],
        riskScore: 5,
        positives: [],
      };
    }
  }
}
