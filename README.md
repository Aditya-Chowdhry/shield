# Shield

AI-powered code reviewer that runs as a GitHub App. Install once on your org, comment `@shield` on any PR, get a thorough review with inline comments and a summary.

Built on Claude. Deploy to Cloudflare Workers or AWS Lambda — bring your own cloud.

## What it does

- Reviews PRs against a 10-rule rubric covering correctness, security, DDD, reliability, performance, and more
- Posts inline comments on specific lines with severity, evidence, and suggested fixes
- Posts a summary with risk score, positives, and key findings
- Sends Slack notifications — DMs the PR author and posts to a channel
- Supports per-repo configuration via `.shield.yml`
- Custom rules without code changes

## Setup

### 1. Create a GitHub App

Go to **GitHub Settings > Developer Settings > GitHub Apps > New GitHub App**:

| Setting | Value |
|---|---|
| Webhook URL | Your deploy URL (set after step 2) |
| Webhook secret | Generate a random string |
| Pull requests | Read & Write |
| Contents | Read |
| Issues | Read |
| Subscribe to events | `Issue comment`, `Pull request review comment` |

Generate and download a **private key**.

### 2. Deploy

```bash
git clone https://github.com/Aditya-Chowdhry/shield.git
cd shield
npm install
```

#### Option A: Cloudflare Workers

Free tier, zero cold starts, no infra to manage.

```bash
# Set secrets
wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_PRIVATE_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put WEBHOOK_SECRET

# Optional
wrangler secret put SLACK_BOT_TOKEN

# Deploy
npm run deploy:worker
```

#### Option B: AWS Lambda

120s timeout, Function URL (no API Gateway needed), SAM for infra-as-code.

```bash
# Build the Lambda bundle
npm run build:lambda

# Deploy with SAM (first time — interactive, picks region/stack name)
sam deploy --guided

# Subsequent deploys
sam deploy
```

SAM will prompt for `GitHubAppId`, `GitHubPrivateKey`, `AnthropicApiKey`, and `WebhookSecret`.

For Slack, add env vars to `template.yaml` or set them in the Lambda console.

---

After deploying, update the GitHub App's **webhook URL** with the URL from the deploy output.

### 3. Install the App

Go to your GitHub App page > **Install App** > select your org or repos.

Done. No workflow files. No per-repo config needed.

### 4. Use it

Comment on any PR:

```
@shield
```

Re-review after pushing changes:

```
@shield recheck
```

## Review Rubric

Shield reviews against 10 built-in rules, ordered by priority:

| Rule | Category | Default Severity |
|---|---|---|
| Correctness & Logic Bugs | Correctness | Critical |
| Security Fundamentals | Security | Critical |
| Domain Modeling & DDD | Design | Warning |
| Pragmatic Programmer | Design | Suggestion |
| Unix Philosophy | Design | Suggestion |
| Language-Specific Best Practices | Language | Suggestion |
| SQL & Data Access | Data | Warning |
| Reliability & Operability | Reliability | Warning |
| Test Adequacy | Quality | Suggestion |
| Performance & Scalability | Performance | Warning |

## Per-repo Configuration

Add a `.shield.yml` to your repo root:

```yaml
# Max inline comments per review
maxComments: 12

# Minimum severity to post: critical | warning | suggestion | nitpick
minSeverity: suggestion

# Minimum confidence: high | medium | low
minConfidence: medium

# Additional file patterns to skip
ignorePaths:
  - "migrations/**"
  - "fixtures/**"

# Disable specific rules
rules:
  disabled:
    - "design/unix-philosophy"

# Slack notifications
notifications:
  slack:
    channel: "#code-reviews"

# Custom rules — no code changes needed
customRules:
  - id: "custom/api-versioning"
    name: "API Versioning"
    severity: warning
    prompt: |
      Check that new API endpoints follow versioning conventions.
      Look for endpoints without version prefix (/v1/, /v2/).
```

## Slack Integration

Shield can notify via Slack in two ways:

- **DM the PR author** — automatically resolves GitHub username > email > Slack user via `users.lookupByEmail`
- **Post to a channel** — configured in `.shield.yml`

Requires a Slack bot token with `chat:write`, `users:read.email`, and `conversations:open` scopes.

## Architecture

```
src/
├── index.ts              # Entry point (re-exports Worker handler)
├── handlers/
│   ├── shared.ts         # Shared webhook processing logic
│   ├── worker.ts         # Cloudflare Worker handler
│   └── lambda.ts         # AWS Lambda handler
├── webhook.ts            # GitHub event parsing + routing
├── auth.ts               # GitHub App JWT + installation tokens
├── engine.ts             # Provider-agnostic review orchestration
├── analyzer.ts           # Claude API integration
├── config.ts             # .shield.yml loader
├── logger.ts             # Logger interface
├── providers/
│   ├── types.ts          # VCSProvider interface
│   ├── github.ts         # GitHub adapter
│   └── factory.ts        # Provider factory
├── notifier/
│   ├── types.ts          # Notifier interface
│   └── slack.ts          # Slack adapter
└── rules/
    ├── types.ts          # Rule interface
    ├── registry.ts       # Rule resolution
    ├── correctness.ts    # Logic bugs
    ├── security.ts       # OWASP, injection, auth
    ├── ddd.ts            # Domain modeling
    ├── pragmatic.ts      # YAGNI, DRY, SRP
    ├── unix.ts           # Composability
    ├── language.ts       # Language-specific idioms
    ├── sql.ts            # N+1, injection, pagination
    ├── reliability.ts    # Error handling, idempotency
    ├── testing.ts        # Test adequacy
    └── performance.ts    # Scalability hotspots
```

Extensibility seams:

- **Add a cloud**: Implement a handler in `src/handlers/` — core logic is shared
- **Add GitLab**: Implement `VCSProvider` in `providers/gitlab.ts` — zero changes to engine/analyzer/rules
- **Add rules**: Define in `.shield.yml` or add a `.ts` file in `src/rules/`
- **Add notifiers**: Implement `Notifier` interface for Teams, Discord, email, etc.

## Local Development

```bash
npm run dev              # Start local Worker (wrangler)
npm run typecheck        # Type-check
npm run test             # Run tests
npm run build:lambda     # Build Lambda bundle
```

## License

MIT
