export type ProcessFailureRecord = {
  level: 'fatal';
  module: 'server';
  operation: 'unhandled_rejection' | 'unhandled_rejection_shutdown_failed';
  error: { code: string; name: string };
};
const safeErrorNames = new Set([
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'AggregateError',
  'DatabaseError', 'ValidationError', 'HttpError', 'AbortError', 'TimeoutError',
]);

type UnhandledRejectionHooks = {
  markUnhealthy: (code: string) => void;
  log: (record: ProcessFailureRecord) => void;
  shutdown: () => Promise<void>;
  setExitCode: (code: number) => void;
};

function errorName(value: unknown) {
  return value instanceof Error && safeErrorNames.has(value.name) ? value.name : 'UnknownError';
}

export function createUnhandledRejectionHandler(hooks: UnhandledRejectionHooks) {
  let shutdownPromise: Promise<void> | null = null;

  return (reason: unknown): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    hooks.markUnhealthy('UNHANDLED_REJECTION');
    hooks.log({
      level: 'fatal',
      module: 'server',
      operation: 'unhandled_rejection',
      error: { code: 'UNHANDLED_REJECTION', name: errorName(reason) },
    });

    shutdownPromise = Promise.resolve()
      .then(hooks.shutdown)
      .catch((error: unknown) => {
        hooks.log({
          level: 'fatal',
          module: 'server',
          operation: 'unhandled_rejection_shutdown_failed',
          error: { code: 'FATAL_SHUTDOWN_FAILED', name: errorName(error) },
        });
      })
      .finally(() => hooks.setExitCode(1));
    return shutdownPromise;
  };
}
