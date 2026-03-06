// Provider port — the interface that all VCS providers must implement.
// This is the seam that makes GitHub/GitLab/etc swappable.

import type {
  ReviewRequest,
  ChangeSet,
  ReviewOutput,
  ExistingComment,
} from '../types.js';

export interface VCSProvider {
  readonly name: 'github' | 'gitlab';

  /**
   * Fetch the diff, changed files, and metadata for a change request.
   */
  fetchChangeSet(request: ReviewRequest): Promise<ChangeSet>;

  /**
   * Fetch full file content at a specific ref.
   * Used when a rule needs more than just the diff.
   */
  fetchFileContent(
    repo: { owner: string; name: string },
    path: string,
    ref: string,
  ): Promise<string>;

  /**
   * Fetch existing review comments to avoid duplication.
   */
  fetchExistingComments(request: ReviewRequest): Promise<ExistingComment[]>;

  /**
   * Publish the review: summary comment + inline comments.
   */
  publishReview(request: ReviewRequest, output: ReviewOutput): Promise<void>;

  /**
   * React to the trigger comment (e.g., add "eyes" emoji to show we're working).
   */
  reactToTrigger(request: ReviewRequest, emoji: string): Promise<void>;

  /**
   * Fetch a user's public email from the VCS platform.
   * Returns null if the user has no public email.
   */
  fetchUserEmail(username: string): Promise<string | null>;
}
