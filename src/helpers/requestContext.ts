// Per-request context propagated to tool handlers via AsyncLocalStorage.
//
// Why ALS: tool handlers (src/tools/*.ts) call api() from helpers/api.ts to hit
// Ultipa Cloud. In HTTP transport mode, the Authorization: Bearer token from
// the incoming request must be forwarded to those Cloud calls — but we don't
// want to thread `token` as an explicit param through every tool's signature.
// ALS makes the token implicitly available wherever the request stack runs,
// without touching tool code.
//
// In stdio mode, no ALS context is established — api() falls back to the
// env-configured ULTIPA_CLOUD_API_KEY. That keeps Claude Desktop / Claude
// Code installs working unchanged.

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  bearerToken: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getBearerToken(): string | undefined {
  return requestContext.getStore()?.bearerToken;
}
