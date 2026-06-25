// Server factory — builds a fully-configured McpServer with all tools
// registered. Called once for stdio (one server lives for the process lifetime)
// and per-session for the HTTP transport (one McpServer per session, since
// McpServer.connect binds a single transport).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DEBUG, hasModeA, hasModeB, hasHttpAuth } from "./helpers/env.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { registerAccountTools } from "./tools/account.js";
import { registerInstanceTools } from "./tools/instances.js";
import { registerMetricsTools } from "./tools/metrics.js";
import { registerLogTools } from "./tools/logs.js";
import { registerAlertTools } from "./tools/alerts.js";
import { registerFirewallTools } from "./tools/firewall.js";
import { registerBillingTools } from "./tools/billing.js";
import { registerBackupTools } from "./tools/backups.js";
import { registerDataPlaneTools } from "./tools/dataplane.js";
import { registerDocsTools } from "./tools/docs.js";

// Read package version at runtime so it stays in sync with package.json.
// Works in both dev (tsx, src/server.ts) and prod (dist/server.js) — package.json
// sits two levels up from either.
const PKG_VERSION = (() => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(here, "..", "package.json"), "utf-8"),
    );
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "gqldb-mcp", version: PKG_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  // ULTIPA_MCP_DEBUG=1: log every tool call name + latency + error to stderr.
  // Wrap server.tool() so every registered tool's handler is instrumented.
  if (DEBUG) {
    const originalTool = server.tool.bind(server);
    (server as any).tool = (...args: any[]) => {
      const handlerIdx = args.length - 1;
      const handler = args[handlerIdx];
      if (typeof handler === "function") {
        const name = args[0] as string;
        args[handlerIdx] = async (...callArgs: any[]) => {
          const start = Date.now();
          try {
            const result = await handler(...callArgs);
            console.error(`[gqldb-mcp] ${name} ok ${Date.now() - start}ms`);
            return result;
          } catch (e: any) {
            console.error(
              `[gqldb-mcp] ${name} err ${Date.now() - start}ms ${e?.message ?? String(e)}`,
            );
            throw e;
          }
        };
      }
      return originalTool(...(args as Parameters<typeof originalTool>));
    };
  }

  // Ultipa Cloud tools (control plane). Available when either:
  //   - env has ULTIPA_CLOUD_API_KEY (stdio mode), OR
  //   - HTTP transport is on, so the per-request Bearer token authenticates
  //     to Cloud via user-center delegation.
  const cloudAvailable = hasModeA || hasHttpAuth;
  if (cloudAvailable) {
    registerAccountTools(server);
    registerInstanceTools(server);
    registerMetricsTools(server);
    registerLogTools(server);
    registerAlertTools(server);
    registerFirewallTools(server);
    registerBillingTools(server);
    registerBackupTools(server);
  }

  // Data-plane tools + GQL docs lookup. Both gated by the same guard:
  // lookup_docs is only useful when the agent can actually compose and run
  // queries, which requires a data-plane target (Direct instance, env-configured
  // Cloud, or HTTP transport with a Bearer).
  if (cloudAvailable || hasModeB) {
    registerDataPlaneTools(server);
    registerDocsTools(server);
  }

  return server;
}
