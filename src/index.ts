#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  INSTANCE_HOST,
  INSTANCE_PASSWORD,
  INSTANCE_USER,
  TRANSPORT,
  OAUTH_ISSUER,
  OAUTH_AUDIENCE,
  hasModeA,
  hasModeB,
  hasHttpAuth,
} from "./helpers/env.js";
import { closeAllDataPlaneClients } from "./helpers/dataplane.js";
import { createMcpServer } from "./server.js";

// ── Fail-fast: no auth path configured at all (and not in HTTP mode, where
// the Bearer token IS the auth path).
const partialDirect =
  !hasModeB && (!!INSTANCE_HOST || !!INSTANCE_USER || !!INSTANCE_PASSWORD);
if (!hasModeA && (!hasModeB || partialDirect) && !hasHttpAuth) {
  const lines: string[] = [];
  if (partialDirect) {
    const missing: string[] = [];
    if (!INSTANCE_HOST) missing.push("ULTIPA_HOST");
    if (!INSTANCE_USER) missing.push("ULTIPA_USERNAME");
    if (!INSTANCE_PASSWORD) missing.push("ULTIPA_PASSWORD");
    lines.push(
      `Direct instance config is incomplete — missing: ${missing.join(", ")}.`,
      "All three of ULTIPA_HOST, ULTIPA_USERNAME, ULTIPA_PASSWORD are required for Direct mode.",
      "",
    );
  }
  lines.push(
    "Ultipa MCP needs at least one auth mode configured:",
    "",
    "  Ultipa Cloud (manage instances and run GQL against any instance on the account):",
    "    ULTIPA_CLOUD_API_KEY=uc_...",
    "    Get a key at https://dbaas.ultipa.com → Settings → API Keys.",
    "",
    "  Direct instance (run GQL against one specific GQLDB instance, no Cloud account needed):",
    "    ULTIPA_HOST=host:port",
    "    ULTIPA_USERNAME=...",
    "    ULTIPA_PASSWORD=...",
    "    ULTIPA_GRAPH=...   (optional default graph)",
    "",
    "Either or both can be set. Set them in your MCP client's server config under `env`, or export them in the shell that launches the server.",
  );
  console.error(lines.join("\n"));
  process.exit(1);
}

// ── Cleanup data-plane gRPC connections on shutdown.
process.on("SIGINT", () => {
  closeAllDataPlaneClients().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  closeAllDataPlaneClients().finally(() => process.exit(0));
});

// ── Transport dispatch ────────────────────────────────────────────────────
// stdio: single long-lived server, one transport. Used by Claude Desktop /
//        Claude Code / Cursor (subprocess lifecycle).
// http:  one McpServer per session, gated by OAuth bearer tokens. Used by
//        Claude Web and any remote MCP client.
if (TRANSPORT === "http") {
  if (!OAUTH_ISSUER || !OAUTH_AUDIENCE) {
    console.error(
      "MCP_TRANSPORT=http requires both OAUTH_ISSUER (the Authorization Server's issuer URL, e.g. https://account.ultipa.com) and OAUTH_AUDIENCE (this MCP server's canonical URL, e.g. https://mcp.ultipa.com) to be set.",
    );
    process.exit(1);
  }
  // Dynamic import keeps the jose/http stack out of the stdio code path — the
  // local-subprocess install (Claude Desktop, etc.) never pays for it.
  const { startHttpServer } = await import("./http/server.js");
  startHttpServer();
} else if (TRANSPORT === "stdio" || TRANSPORT === undefined) {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  console.error(
    `Unknown MCP_TRANSPORT="${TRANSPORT}". Expected "stdio" (default) or "http".`,
  );
  process.exit(1);
}
