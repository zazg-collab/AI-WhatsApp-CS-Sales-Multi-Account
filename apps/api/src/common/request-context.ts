import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request ambient context, propagated via AsyncLocalStorage so any log line
 * (even deep inside a service) can be correlated to the request that triggered
 * it — without threading `requestId` through every function signature.
 */
export interface RequestContext {
  requestId?: string;
  userId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Current request's context, or an empty object outside a request (jobs, boot). */
export function currentContext(): RequestContext {
  return requestContext.getStore() ?? {};
}
