import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, json } from "../helpers/api.js";

export function registerBillingTools(server: McpServer) {
  server.tool(
    "get_balance",
    "Get the account's current Ultipa Cloud balance and related billing flags. Useful as a pre-check before `create_instance` on paid sizes — a paid-tier create with `balance <= 0` will be rejected with HTTP 402.",
    {},
    { title: "Get account balance", readOnlyHint: true },
    async () => json(await api("/v1/billing/balance")),
  );

  server.tool(
    "list_transactions",
    "List the account's balance transactions (top-ups, charges, refunds, adjustments). Ordered by date.",
    {},
    { title: "List billing transactions", readOnlyHint: true },
    async () => json(await api("/v1/billing/transactions")),
  );

  server.tool(
    "get_usage",
    "Return the usage-based billing summary for a month (per-instance breakdown of compute, storage, and data-transfer charges). Default: current month.",
    {
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional()
        .describe(
          "Month in `YYYY-MM` format, e.g. '2026-06'. Omit for current month.",
        ),
    },
    { title: "Get usage summary", readOnlyHint: true },
    async ({ month }) =>
      json(await api(`/v1/billing/usage${month ? `?month=${month}` : ""}`)),
  );

  server.tool(
    "get_payment_method",
    "Return the saved payment method on file (card brand, last4, expiry), or `null` if none. To add or change a card, the user must go to https://dbaas.ultipa.com → Billing — the Stripe card flow requires client-side Stripe.js and can't be driven via MCP.",
    {},
    { title: "Get saved payment method", readOnlyHint: true },
    async () => json(await api("/v1/billing/payment-method")),
  );

  server.tool(
    "get_auto_reload",
    "Return the account's auto-reload settings: `{ enabled, thresholdCents, targetCents }`. When enabled, the account auto-tops-up to `targetCents` whenever balance drops below `thresholdCents`, charging the saved payment method.",
    {},
    { title: "Get auto-reload settings", readOnlyHint: true },
    async () => json(await api("/v1/billing/auto-reload")),
  );
}
