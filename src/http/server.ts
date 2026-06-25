// HTTP transport entry point. Boots a Node http.Server on MCP_HTTP_PORT and
// routes requests:
//
//   GET  /.well-known/oauth-protected-resource   → metadata (no auth)
//   POST /mcp                                    → auth → MCP Streamable HTTP
//   GET  /mcp                                    → auth → MCP Streamable HTTP (SSE)
//   DELETE /mcp                                  → auth → MCP Streamable HTTP (terminate session)
//   *                                            → 404
//
// Sessions are kept in-memory: one McpServer + one StreamableHTTPServerTransport
// per session, keyed by the mcp-session-id header. Closing the transport (or
// process restart) drops the session — clients re-initialize transparently.

import http from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { HTTP_PORT } from "../helpers/env.js";
import { createMcpServer } from "../server.js";
import { requestContext } from "../helpers/requestContext.js";
import { verifyBearer } from "./auth.js";
import { writeProtectedResourceMetadata } from "./metadata.js";

interface Session {
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, Session>();

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    // Cap body size at 4 MB — MCP JSON-RPC messages are small; anything
    // larger is almost certainly an attack or a misconfigured client.
    if (chunks.reduce((n, c) => n + c.length, 0) > 4 * 1024 * 1024) {
      throw new Error("Request body too large");
    }
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return undefined;
  return JSON.parse(raw);
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...extraHeaders,
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function handleMcpRequest(
  req: http.IncomingMessage & { auth?: AuthInfo },
  res: http.ServerResponse,
): Promise<void> {
  // Auth first — every /mcp request needs a valid bearer.
  const authResult = await verifyBearer(req.headers["authorization"] as string | undefined);
  if (!authResult.ok) {
    res.writeHead(authResult.status, {
      "Content-Type": "application/json",
      "WWW-Authenticate": authResult.wwwAuthenticate,
    });
    res.end(authResult.body);
    return;
  }
  req.auth = authResult.auth;

  // Session lookup. The session ID lives in the mcp-session-id header on every
  // request after the initialize handshake. POST + initialize creates a fresh
  // session; any other request without a known session ID is rejected.
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  let session = sessionId ? sessions.get(sessionId) : undefined;
  let body: unknown;

  if (req.method === "POST") {
    try {
      body = await readJsonBody(req);
    } catch (e) {
      sendJson(res, 400, {
        error: "invalid_request",
        error_description: e instanceof Error ? e.message : String(e),
      });
      return;
    }
  }

  if (!session) {
    // New session must start with an initialize request. Anything else gets
    // 400 so the client knows to re-handshake.
    if (req.method !== "POST" || !isInitializeRequest(body)) {
      sendJson(res, 400, {
        error: "invalid_request",
        error_description:
          "No session yet. The first request must be a POST with a JSON-RPC `initialize` message.",
      });
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);

    session = { transport };
  }

  // Run the full request inside an AsyncLocalStorage scope so api() helpers
  // called from any tool handler can pull the bearer token from context and
  // forward it to Ultipa Cloud. The token is the SAME one that just passed
  // JWT verification a few lines up — Cloud will validate it via user-center.
  await requestContext.run(
    { bearerToken: authResult.auth.token },
    () => session!.transport.handleRequest(req, res, body),
  );
}

export function startHttpServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const url = req.url ?? "/";

      // CORS preflight — Claude Web will send these from the browser. Allow
      // every origin since the actual gate is the bearer token, not Origin.
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": req.headers.origin ?? "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type, Mcp-Session-Id",
          "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
          "Access-Control-Max-Age": "600",
        });
        res.end();
        return;
      }

      // Add CORS headers to every response (resource server lives cross-origin
      // from Claude Web). Bearer-token-only — Origin doesn't gate anything.
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Mcp-Session-Id, WWW-Authenticate",
      );

      if (req.method === "GET" && url === "/.well-known/oauth-protected-resource") {
        writeProtectedResourceMetadata(res);
        return;
      }

      // Cheap liveness check for load balancers / docker healthcheck.
      // Must come BEFORE the catch-all MCP route so `/healthz` doesn't get
      // routed into the MCP transport (which would 400 it).
      if (req.method === "GET" && url === "/healthz") {
        sendJson(res, 200, { ok: true });
        return;
      }

      // MCP transport: accept both "/mcp" (explicit) and "/" (root, Claude
      // Web's convention — the URL the user enters IS the MCP endpoint, no
      // path suffix). Anything else under those falls through to 404.
      if (
        url === "/mcp" ||
        url.startsWith("/mcp?") ||
        url === "/" ||
        url.startsWith("/?")
      ) {
        await handleMcpRequest(req, res);
        return;
      }

      sendJson(res, 404, { error: "not_found", path: url });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[gqldb-mcp http] unhandled error:", msg);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "server_error", error_description: msg });
      } else {
        res.end();
      }
    }
  });

  server.listen(HTTP_PORT, () => {
    console.error(`[gqldb-mcp] HTTP transport listening on :${HTTP_PORT}`);
  });

  return server;
}
