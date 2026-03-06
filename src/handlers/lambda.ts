import { consoleLogger } from '../logger.js';
import { processWebhook, type EnvVars } from './shared.js';

interface LambdaEvent {
  httpMethod?: string;
  requestContext?: {
    http?: { method: string };
  };
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

interface LambdaResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

/**
 * AWS Lambda handler — works with both Function URLs and API Gateway.
 */
export async function handler(event: LambdaEvent): Promise<LambdaResponse> {
  const log = consoleLogger;

  try {
    // Normalize method — Function URL uses requestContext.http.method,
    // API Gateway v1 uses httpMethod
    const method =
      event.requestContext?.http?.method ?? event.httpMethod ?? 'GET';

    // Normalize headers to lowercase keys
    const rawHeaders = event.headers ?? {};
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(rawHeaders)) {
      headers[key.toLowerCase()] = value;
    }

    // Decode body if base64-encoded (API Gateway does this)
    let body = event.body ?? '';
    if (event.isBase64Encoded && body) {
      body = Buffer.from(body, 'base64').toString('utf-8');
    }

    const env = loadEnv();
    const result = await processWebhook(method, headers, body, env, log);

    return {
      statusCode: result.status,
      body: result.body,
      headers: { 'Content-Type': 'text/plain' },
    };
  } catch (error) {
    log.error(`Lambda error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      statusCode: 500,
      body: 'Internal error',
      headers: { 'Content-Type': 'text/plain' },
    };
  }
}

function loadEnv(): EnvVars {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
  };

  return {
    GITHUB_APP_ID: required('GITHUB_APP_ID'),
    GITHUB_PRIVATE_KEY: required('GITHUB_PRIVATE_KEY'),
    ANTHROPIC_API_KEY: required('ANTHROPIC_API_KEY'),
    CLAUDE_MODEL: process.env['CLAUDE_MODEL'],
    TRIGGER_PHRASE: process.env['TRIGGER_PHRASE'],
    WEBHOOK_SECRET: process.env['WEBHOOK_SECRET'],
    SLACK_BOT_TOKEN: process.env['SLACK_BOT_TOKEN'],
    SLACK_WEBHOOK_URL: process.env['SLACK_WEBHOOK_URL'],
  };
}
