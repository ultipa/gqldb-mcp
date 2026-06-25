// OAuth 2.0 Protected Resource Metadata (RFC 9728).
//
// Served unauthenticated at GET /.well-known/oauth-protected-resource so that
// MCP clients (e.g. Claude Web) can discover which Authorization Server issues
// tokens for this resource, the scopes it understands, and the bearer scheme.
//
// This endpoint is the canonical handshake point — clients land here after
// receiving a 401 with `WWW-Authenticate: Bearer resource_metadata=<this url>`.

import type { ServerResponse } from "node:http";
import {
  OAUTH_ISSUER,
  OAUTH_AUDIENCE,
  OAUTH_REQUIRED_SCOPE,
} from "../helpers/env.js";

export function writeProtectedResourceMetadata(res: ServerResponse): void {
  if (!OAUTH_ISSUER || !OAUTH_AUDIENCE) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "server_error",
        error_description: "OAuth is not configured on this server.",
      }),
    );
    return;
  }

  const body = {
    resource: OAUTH_AUDIENCE,
    authorization_servers: [OAUTH_ISSUER],
    scopes_supported: [OAUTH_REQUIRED_SCOPE],
    bearer_methods_supported: ["header"],
  };

  res.writeHead(200, {
    "Content-Type": "application/json",
    // Allow caching for a short window — metadata is essentially static and
    // clients re-fetch on token failures anyway.
    "Cache-Control": "public, max-age=300",
  });
  res.end(JSON.stringify(body));
}
