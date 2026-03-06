import { Octokit } from '@octokit/rest';
import type { VCSProvider } from './types.js';
import { GitHubProvider } from './github.js';

export function createProvider(
  name: 'github' | 'gitlab',
  tokenOrOctokit: string | Octokit,
): VCSProvider {
  switch (name) {
    case 'github':
      return new GitHubProvider(tokenOrOctokit);
    case 'gitlab':
      throw new Error(
        'GitLab provider is not yet implemented. Contributions welcome!',
      );
    default:
      throw new Error(`Unknown VCS provider: ${name}`);
  }
}
