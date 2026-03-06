import { consoleLogger } from '../logger.js';
import { processWebhook, type EnvVars } from './shared.js';

export default {
  async fetch(request: Request, env: EnvVars): Promise<Response> {
    const log = consoleLogger;

    try {
      const headers: Record<string, string | undefined> = {
        'x-hub-signature-256': request.headers.get('x-hub-signature-256') ?? undefined,
        'x-github-event': request.headers.get('x-github-event') ?? undefined,
      };

      const body = request.method === 'POST' ? await request.text() : '';
      const result = await processWebhook(request.method, headers, body, env, log);

      return new Response(result.body, { status: result.status });
    } catch (error) {
      log.error(`Webhook error: ${error instanceof Error ? error.message : String(error)}`);
      return new Response('Internal error', { status: 500 });
    }
  },
};
