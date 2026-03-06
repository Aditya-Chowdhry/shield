/**
 * Simple logger interface — decouples from @actions/core
 * so we can run in any environment (Worker, CLI, Action).
 */
export interface Logger {
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export const consoleLogger: Logger = {
  info: (msg) => console.log(`[shield] ${msg}`),
  warning: (msg) => console.warn(`[shield] WARN: ${msg}`),
  error: (msg) => console.error(`[shield] ERROR: ${msg}`),
};
