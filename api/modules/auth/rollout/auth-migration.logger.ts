import { apiLogger } from '../../../observability/logger.js';

export type AuthMigrationEventName =
  | 'auth.migration.login'
  | 'auth.migration.refresh'
  | 'auth.migration.logout'
  | 'auth.migration.rollback';

export type AuthMigrationEvent = {
  event: AuthMigrationEventName;
  requestId?: string;
  userId?: number;
  mode: 'legacy' | 'v1-web';
  outcome: 'success' | 'failed';
  reason?: string;
};

export type AuthMigrationEventSink = (event: AuthMigrationEvent & { timestamp: string }) => void;

export class AuthMigrationLogger {
  constructor(private readonly sink: AuthMigrationEventSink = (event) => {
    apiLogger.info({
      requestId: event.requestId,
      userId: event.userId,
      module: 'auth',
      operation: event.event,
      mode: event.mode,
      outcome: event.outcome,
    }, 'api.auth.migration_event');
  }) {}

  record(event: AuthMigrationEvent): void {
    this.sink({ ...event, timestamp: new Date().toISOString() });
  }
}

export const authMigrationLogger = new AuthMigrationLogger();
