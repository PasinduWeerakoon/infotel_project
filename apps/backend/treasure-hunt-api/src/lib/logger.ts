/**
 * Structured JSON logger (Powertools). Never log names, tokens or other personal data.
 */
import { Logger } from '@aws-lambda-powertools/logger';

export const logger = new Logger({
  serviceName: process.env.SERVICE_NAME ?? 'lkdr-service',
  logLevel: (process.env.LOG_LEVEL as 'INFO' | 'DEBUG' | 'WARN' | 'ERROR' | undefined) ?? 'INFO',
});

/** Admin changes are logged with `audit: true` so they can be filtered in CloudWatch. */
export function audit(action: string, actor: string, details: Record<string, unknown> = {}): void {
  logger.info(action, { audit: true, actor, ...details });
}
