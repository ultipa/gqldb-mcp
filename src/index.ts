#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { hasModeA, hasModeB } from "./helpers/env.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { closeAllDataPlaneClients } from "./helpers/dataplane.js";
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

// ── Fail-fast — neither mode configured ──────────────────────────────────
if (!hasModeA && !hasModeB) {
  console.error(
    [
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
    ].join("\n"),
  );
  process.exit(1);
}

// ── Cleanup data-plane gRPC connections on shutdown ──────────────────────
process.on("SIGINT", () => {
  closeAllDataPlaneClients().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  closeAllDataPlaneClients().finally(() => process.exit(0));
});

// ── Server setup ─────────────────────────────────────────────────────────
const server = new McpServer(
  { name: "ultipa-mcp", version: "0.0.1" },
  { instructions: SERVER_INSTRUCTIONS },
);

// ── Ultipa Cloud tools (control plane) ───────────────────────────────────
if (hasModeA) {
  registerAccountTools(server);
  registerInstanceTools(server);
  registerMetricsTools(server);
  registerLogTools(server);
  registerAlertTools(server);
  registerFirewallTools(server);
  registerBillingTools(server);
  registerBackupTools(server);
}

// ── Data-plane tools + GQL docs lookup ───────────────────────────────────
// Both gated by the same guard: lookup_docs is only useful when the
// agent can actually compose and run queries, which requires a data-plane
// target (either Direct instance or Ultipa Cloud with `id`).
if (hasModeA || hasModeB) {
  registerDataPlaneTools(server);
  registerDocsTools(server);
}

const transport = new StdioServerTransport();
await server.connect(transport);
