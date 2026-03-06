import type { ReviewRequest, ReviewOutput } from '../types.js';

/**
 * Notification channel — the interface for sending review results.
 * Extensible: Slack today, Teams/Discord/email tomorrow.
 */
export interface Notifier {
  readonly name: string;

  /**
   * Send review results to a channel (team visibility).
   */
  notifyChannel(
    request: ReviewRequest,
    output: ReviewOutput,
    channel: string,
  ): Promise<void>;

  /**
   * Send review results as a DM to a user by their platform user ID.
   */
  notifyUser(
    request: ReviewRequest,
    output: ReviewOutput,
    userId: string,
  ): Promise<void>;

  /**
   * Resolve a user's platform ID from their email.
   * Returns null if the user can't be found.
   */
  lookupUserByEmail(email: string): Promise<string | null>;
}
