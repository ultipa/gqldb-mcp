// OAuth 2.1 Resource Server — verifies bearer tokens against the Authorization
// Server's JWKS before letting requests reach the MCP transport. Implements the
// flow defined by the MCP authorization spec (2025-06-18 revision) and RFC 9728:
//
//   - Missing/malformed Authorization header → 401 with WWW-Authenticate pointing
//     at /.well-known/oauth-protected-resource so clients can discover the AS.
//   - Token signature mismatch / expired / wrong issuer / wrong audience / missing
//     required scope → 401 with WWW-Authenticate carrying error="invalid_token".
//   - Valid token → returns AuthInfo for downstream attachment to req.auth, which
//     the SDK's StreamableHTTPServerTransport surfaces to tool handlers.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  OAUTH_ISSUER,
  OAUTH_AUDIENCE,
  OAUTH_REQUIRED_SCOPE,
} from "../helpers/env.js";

// JWKS is fetched lazily on first request and refreshed on cache miss (e.g.,
// after AS key rotation). jose handles all of this — we just need one set per
// issuer, kept alive for the process lifetime.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!OAUTH_ISSUER) {
    throw new Error("OAUTH_ISSUER is not configured");
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL("/.well-known/jwks.json", OAUTH_ISSUER),
    );
  }
  return jwks;
}

// Public so server.ts can build the WWW-Authenticate header. The metadata URL
// is canonicalized off OAUTH_AUDIENCE — that's THIS server's identity, which is
// what clients dereference per the MCP authorization discovery flow.
export function resourceMetadataUrl(): string {
  if (!OAUTH_AUDIENCE) return "";
  return new URL(
    "/.well-known/oauth-protected-resource",
    OAUTH_AUDIENCE,
  ).toString();
}

function buildWWWAuthenticate(error?: string, description?: string): string {
  const parts = [`Bearer realm="ultipa-mcp"`];
  const url = resourceMetadataUrl();
  if (url) parts.push(`resource_metadata="${url}"`);
  if (error) parts.push(`error="${error}"`);
  if (description) parts.push(`error_description="${description}"`);
  return parts.join(", ");
}

export type AuthResult =
  | { ok: true; auth: AuthInfo }
  | { ok: false; status: number; wwwAuthenticate: string; body: string };

// Verify a single Authorization header. Returns either an AuthInfo (success) or
// a structured error the caller writes to the HTTP response.
export async function verifyBearer(
  authHeader: string | undefined,
): Promise<AuthResult> {
  if (!authHeader) {
    return {
      ok: false,
      status: 401,
      wwwAuthenticate: buildWWWAuthenticate(),
      body: JSON.stringify({
        error: "unauthorized",
        error_description: "Missing Authorization header.",
      }),
    };
  }

  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const token = match?.[1];
  if (!token) {
    return {
      ok: false,
      status: 401,
      wwwAuthenticate: buildWWWAuthenticate(
        "invalid_request",
        "Authorization header must use the Bearer scheme.",
      ),
      body: JSON.stringify({ error: "invalid_request" }),
    };
  }

  if (!OAUTH_ISSUER || !OAUTH_AUDIENCE) {
    return {
      ok: false,
      status: 500,
      wwwAuthenticate: buildWWWAuthenticate(
        "server_error",
        "OAuth is not configured on this server.",
      ),
      body: JSON.stringify({ error: "server_error" }),
    };
  }

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, getJWKS(), {
      issuer: OAUTH_ISSUER,
      audience: OAUTH_AUDIENCE,
      algorithms: ["RS256"],
    });
    payload = result.payload;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 401,
      wwwAuthenticate: buildWWWAuthenticate("invalid_token", msg),
      body: JSON.stringify({
        error: "invalid_token",
        error_description: msg,
      }),
    };
  }

  // `scope` is a single space-delimited string per RFC 6749 §3.3. Some ASes
  // additionally emit `scopes` as an array — accept both.
  const scopesRaw = (payload as Record<string, unknown>)["scope"];
  const scopesArr = (payload as Record<string, unknown>)["scopes"];
  const scopes: string[] = (() => {
    if (typeof scopesRaw === "string") return scopesRaw.split(/\s+/).filter(Boolean);
    if (Array.isArray(scopesArr)) return scopesArr.filter((s): s is string => typeof s === "string");
    return [];
  })();

  if (OAUTH_REQUIRED_SCOPE && !scopes.includes(OAUTH_REQUIRED_SCOPE)) {
    return {
      ok: false,
      status: 403,
      wwwAuthenticate: buildWWWAuthenticate(
        "insufficient_scope",
        `Required scope "${OAUTH_REQUIRED_SCOPE}" not granted.`,
      ),
      body: JSON.stringify({
        error: "insufficient_scope",
        scope: OAUTH_REQUIRED_SCOPE,
      }),
    };
  }

  // Surface a stable clientId for downstream logging. oidc-provider emits
  // client_id; some ASes use azp instead. Fall back to "unknown" so this
  // never blocks a valid token — tools should treat clientId as advisory.
  const clientId =
    (typeof payload.client_id === "string" && payload.client_id) ||
    (typeof (payload as Record<string, unknown>)["azp"] === "string" &&
      ((payload as Record<string, unknown>)["azp"] as string)) ||
    "unknown";

  const extra: Record<string, unknown> = {};
  if (typeof payload.sub === "string") extra.sub = payload.sub;
  if (typeof payload.iss === "string") extra.iss = payload.iss;

  return {
    ok: true,
    auth: {
      token,
      clientId,
      scopes,
      expiresAt: payload.exp,
      resource: new URL(OAUTH_AUDIENCE),
      extra,
    },
  };
}
