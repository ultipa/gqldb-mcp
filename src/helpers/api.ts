import { API_KEY, BASE_URL } from "./env.js";
import { getBearerToken } from "./requestContext.js";

export async function api(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
) {
  // Two auth paths:
  //   - HTTP transport: forward the caller's Authorization: Bearer JWT, which
  //     Cloud delegates to user-center /api/auth/validate. Real per-user identity.
  //   - stdio transport: use the env-configured ULTIPA_CLOUD_API_KEY (the
  //     existing single-user pattern for Claude Desktop / Cursor / etc.).
  const bearer = getBearerToken();
  let authHeaders: Record<string, string>;
  if (bearer) {
    authHeaders = { Authorization: `Bearer ${bearer}` };
  } else if (API_KEY) {
    authHeaders = { "X-API-Key": API_KEY };
  } else {
    throw new Error(
      "No Ultipa Cloud credentials available — set ULTIPA_CLOUD_API_KEY (stdio mode) or run under HTTP transport with a Bearer token.",
    );
  }

  const { body, ...rest } = init;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(rest.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
