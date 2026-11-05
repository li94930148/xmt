import { Router, type RequestHandler, type Router as ExpressRouter } from 'express';

const routerRegistrationMethods = new Set([
  'all', 'delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'use', 'param',
]);
const routeRegistrationMethods = new Set(['all', 'delete', 'get', 'head', 'options', 'patch', 'post', 'put']);
const wrappedHandlers = new WeakSet<(...args: unknown[]) => unknown>();

function forwardHandlerResult(
  handler: (...args: unknown[]) => unknown,
  receiver: unknown,
  args: IArguments | unknown[],
  nextIndex: number,
) {
  const values = Array.from(args);
  const next = values[nextIndex];
  try {
    const result = handler.apply(receiver, values);
    if (!result || typeof result !== 'object' && typeof result !== 'function'
      || typeof (result as { then?: unknown }).then !== 'function'
      || typeof next !== 'function') return result;
    return Promise.resolve(result).catch((error: unknown) => (next as (reason: unknown) => unknown)(error));
  } catch (error) {
    if (typeof next === 'function') return (next as (reason: unknown) => unknown)(error);
    throw error;
  }
}

function wrapHandler(value: unknown, method: string): unknown {
  if (typeof value !== 'function') return value;
  const handler = value as (...args: unknown[]) => unknown;
  if (wrappedHandlers.has(handler)) return handler;
  let wrapped: (...args: unknown[]) => unknown;

  if (method === 'param') {
    wrapped = function asyncParamHandler(this: unknown, req: unknown, res: unknown, next: unknown, value: unknown, ...extra: unknown[]) {
      return forwardHandlerResult(handler, this, [req, res, next, value, ...extra], 2);
    };
  } else if (handler.length === 4) {
    wrapped = function asyncErrorHandler(this: unknown, error: unknown, req: unknown, res: unknown, next: unknown) {
      return forwardHandlerResult(handler, this, [error, req, res, next], 3);
    };
  } else {
    wrapped = function asyncRequestHandler(this: unknown, req: unknown, res: unknown, next: unknown) {
      return forwardHandlerResult(handler, this, [req, res, next], 2);
    };
  }
  wrappedHandlers.add(wrapped);
  return wrapped;
}

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return wrapHandler(handler, 'use') as RequestHandler;
}

function wrapNestedHandlers(value: unknown, method: string): unknown {
  return Array.isArray(value) ? value.map((item) => wrapNestedHandlers(item, method)) : wrapHandler(value, method);
}

function wrapRegistrar<T extends object>(target: T, methods: ReadonlySet<string>): T {
  const proxy = new Proxy(target, {
    get(registrar, property) {
      const value = Reflect.get(registrar, property, registrar) as unknown;
      if (property === 'route' && typeof value === 'function') {
        return (...args: unknown[]) => {
          const route = Reflect.apply(value, registrar, args);
          return wrapRegistrar(route as object, routeRegistrationMethods);
        };
      }
      if (typeof property === 'string' && methods.has(property) && typeof value === 'function') {
        return (...args: unknown[]) => {
          const wrappedArgs = args.map((arg) => wrapNestedHandlers(arg, property));
          const result = Reflect.apply(value, registrar, wrappedArgs) as unknown;
          return result === registrar ? proxy : result;
        };
      }
      return typeof value === 'function' ? value.bind(registrar) : value;
    },
  });
  return proxy;
}

/**
 * Express 4 does not forward rejected route-handler promises to error middleware.
 * This router facade wraps callbacks at public route-registration calls and forwards
 * returned thenables to Express error middleware without patching Express internals.
 */
export function createAsyncRouter(): ExpressRouter {
  return wrapRegistrar(Router(), routerRegistrationMethods) as ExpressRouter;
}
