# Ultipa GQLDB MCP

Model Context Protocol server for [Ultipa Cloud](https://dbaas.ultipa.com) and any self-managed Ultipa GQLDB instance. Lets MCP clients provision and operate instances, run GQL queries, manage backups, view metrics, and more, all through natural language.

## Install

How you add Ultipa GQLDB MCP depends on your client:

- **Claude Desktop** → [Connectors directory](#claude-desktop) (easiest), or [manual config](#manual-config-any-stdio-client)
- **Claude Code** → [`claude mcp add`](#claude-code)
- **Claude Web (claude.ai)** → [remote connector](#claude-web) — no install, OAuth-based, Ultipa Cloud only
- **Cursor, Windsurf, VS Code, other stdio clients** → [manual config](#manual-config-any-stdio-client)

Stdio installs need one Ultipa target — either an **Ultipa Cloud** API key or a **Direct instance** (host + username + password). See [Auth](#auth). The Claude Web connector uses OAuth and needs no env config.

### Claude Desktop

The simplest path is the **Connectors** directory:

1. Open Claude Desktop → **New Chat → + icon → Connectors → Add connector → Browse connectors**.
2. Search for **Ultipa** and click **Install**. Then click **Config**.
3. When prompted, enter **either** your Ultipa Cloud API key **or** the direct instance host + username + password, then **Save**.

If Ultipa isn't visible in your Connectors directory (older Claude Desktop, enterprise-managed install), you can install the `.mcpb` extension file directly:

1. Download `gqldb-mcp.mcpb` from [here](https://www.ultipa.com/download).
2. Open it, or drag it into **Settings → Extensions** in Claude Desktop.
3. When prompted, enter your credentials (same as above).

### Claude Code

Add the server with `claude mcp add` (it runs the published npm package via `npx`):

```bash
# Cloud-managed instances: Ultipa Cloud API key
claude mcp add ultipa-cloud --scope user \
  --env ULTIPA_CLOUD_API_KEY=uc_... \
  -- npx -y @ultipa-graph/gqldb-mcp

# Self-managed / direct instance
claude mcp add ultipa --scope user \
  --env ULTIPA_HOST=<host>:<port> \
  --env ULTIPA_USERNAME=<username> \
  --env ULTIPA_PASSWORD=<password> \
  --env ULTIPA_GRAPH=<optional_default_graph_name> \
  -- npx -y @ultipa-graph/gqldb-mcp
```

Verify with `claude mcp list`.

### Claude Web

Claude Web supports Ultipa as a remote MCP server. Each user authenticates via OAuth against their own Ultipa Cloud account, so there's no API key to manage and every user only sees their own instances.

1. Open Claude Web → **Settings → Connectors → Add custom connector**.
2. Fill in:
   - **Name:** `Ultipa` (or any label you prefer)
   - **Remote MCP server URL:** `https://mcp.ultipa.com`
   - **OAuth Client ID:** `oac_b67435362986`
   - **OAuth Client Secret:** leave blank
3. Click **Add** to close the modal, then click **Connect**. You'll be redirected to `account.ultipa.com` to sign in (or create an account) and approve access.
4. Once authorized, Claude can use any of the Ultipa Cloud tools as your account.

To review or revoke access at any time, visit [account.ultipa.com/connected-apps](https://account.ultipa.com/connected-apps).

> Self-managed (Direct) instances aren't reachable via Claude Web. There's no per-user way to inject `ULTIPA_HOST`/`USERNAME`/`PASSWORD` over OAuth. For Direct instances, use Claude Desktop, Claude Code, or stdio clients (below).

### Manual config (any stdio client)

Add an entry under `mcpServers` in your MCP client's config. The same JSON shape works in any stdio MCP client; only the file path differs:

| Client | Config file |
|---|---|
| Claude Desktop | `claude_desktop_config.json` (Settings → Developer → Edit Config) |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| VS Code MCP extensions | extension-specific (see the extension's docs) |

#### One target

For an Ultipa Cloud account:

```json
{
  "mcpServers": {
    "ultipa-cloud": {
      "command": "npx",
      "args": ["-y", "@ultipa-graph/gqldb-mcp"],
      "env": {
        "ULTIPA_CLOUD_API_KEY": "uc_..."
      }
    }
  }
}
```

For a direct instance:

```json
{
  "mcpServers": {
    "ultipa-direct": {
      "command": "npx",
      "args": ["-y", "@ultipa-graph/gqldb-mcp"],
      "env": {
        "ULTIPA_HOST": "<host>:<port>",
        "ULTIPA_USERNAME": "<username>",
        "ULTIPA_PASSWORD": "<password>",
        "ULTIPA_GRAPH": "<optional_default_graph_name>"
      }
    }
  }
}
```

Restart your client after editing.

#### Multiple targets

Each MCP server entry points at one Ultipa target. Add as many entries as you need, with descriptive names. Claude (or any agent) sees each entry as its own toolset and picks based on what you ask (e.g. "query staging" routes to the `ultipa-staging` entry).

```json
{
  "mcpServers": {
    "ultipa-cloud": {
      "command": "npx",
      "args": ["-y", "@ultipa-graph/gqldb-mcp"],
      "env": {
        "ULTIPA_CLOUD_API_KEY": "uc_..."
      }
    },
    "ultipa-staging": {
      "command": "npx",
      "args": ["-y", "@ultipa-graph/gqldb-mcp"],
      "env": {
        "ULTIPA_HOST": "staging.internal:60061",
        "ULTIPA_USERNAME": "admin",
        "ULTIPA_PASSWORD": "..."
      }
    },
    "ultipa-prod": {
      "command": "npx",
      "args": ["-y", "@ultipa-graph/gqldb-mcp"],
      "env": {
        "ULTIPA_HOST": "prod.internal:60061",
        "ULTIPA_USERNAME": "admin",
        "ULTIPA_PASSWORD": "..."
      }
    }
  }
}
```

Restart your client after editing.

## Auth

**Claude Web** uses OAuth — you sign into Ultipa during the connector setup. No env config needed. See [Claude Web](#claude-web).

**Stdio clients** (Claude Desktop, Claude Code, Cursor, etc.) authenticate via env vars. Pick one path per server entry:

| Path | Env vars |
|---|---|
| **Ultipa Cloud** | `ULTIPA_CLOUD_API_KEY` — create at [dbaas.ultipa.com](https://dbaas.ultipa.com) → Settings → API Keys |
| **Direct instance** | `ULTIPA_HOST` + `ULTIPA_USERNAME` + `ULTIPA_PASSWORD` (+ optional `ULTIPA_GRAPH`) |

Need both, or multiple Direct instances? Add more entries — see [Multiple targets](#multiple-targets).

**Cloud API key scopes** to grant when creating the key:

| Scope | Needed for |
|---|---|
| `instances:read` | Any read-only tool |
| `instances:write` | State changes (create, pause, restart, upgrade, …) |
| `instances:delete` | `delete_instance`, `delete_backup` |
| `instances:credentials` | All data-plane tools in Cloud mode (they fetch per-call creds) |
| `billing:read` | Billing tools |

## Tools

### Control plane

**Auth required:** Ultipa Cloud — either `ULTIPA_CLOUD_API_KEY` (stdio clients) or a Claude Web OAuth session. Direct instances cannot use these tools.

#### Account

| Tool | What it does |
|---|---|
| `get_account` | Authenticated account profile (email, name, balance flags). |

#### Instance lifecycle

| Tool | What it does |
|---|---|
| `list_instances` | List all instances on the account. |
| `get_instance` | Fetch one instance by ID. |
| `list_deleted_instances` | List deleted instances (not returned by `list_instances`). |
| `create_instance` | Provision a new instance (name, region, sizeId). |
| `rename_instance` | Change an instance's display name. |
| `pause_instance` | Pause a running instance. |
| `resume_instance` | Resume a paused instance. |
| `restart_instance` | Restart the instance. |
| `upgrade_version` | Upgrade to the latest GQLDB version. |
| `delete_instance` | Delete an instance. Requires the instance name as confirmation. |
| `get_instance_credentials` | Fetch admin username and password of the instance. |
| `reset_admin_password` | Rotate the admin DB password. Breaks existing connections. |
| `list_regions` | List supported regions and their Manager URLs. |
| `list_instance_sizes` | List available sizes and pricing. |
| `get_latest_version` | Latest available GQLDB version. |
| `get_trial_status` | Free-trial eligibility. Pre-check before creating a free-trial instance. |
| `get_enterprise_status` | Enterprise-tier eligibility. Pre-check before creating an enterprise instance. |
| `get_operations_lock` | Whether instance ops are globally locked (maintenance / freeze). |
| `wait_for_instance_status` | Explicit polling helper. Rarely needed. |

#### Metrics, Logs & Alerts

| Tool | What it does |
|---|---|
| `get_live_metrics` | Current CPU / memory / disk / network snapshot. |
| `get_metrics_history` | Historical metrics over the last N minutes (default 60, max 14 days). |
| `get_instance_logs` | Recent container logs (default 100 lines, max 1000). |
| `set_log_level` | Set GQLDB log level (debug / info / warn / error). |
| `list_alerts` | All alerts across the account's instances. |
| `list_instance_alerts` | Alerts for a single instance. |

#### Firewall

| Tool | What it does |
|---|---|
| `get_my_ip` | Public IP of the machine running Ultipa MCP (pair with `add_firewall_rule` to allow `${ip}/32`). |
| `list_firewall_rules` | IP-allowlist rules for an instance. |
| `add_firewall_rule` | Add a CIDR to the allowlist. |
| `remove_firewall_rule` | Remove a rule by its CIDR. |

#### Backups

| Tool | What it does |
|---|---|
| `list_backups` | List backups for an instance. |
| `create_backup` | Trigger an on-demand backup (default 10-min timeout). |
| `restore_backup` | Restore from a completed backup. **Destructive: overwrites current data.** |
| `delete_backup` | Permanently delete a backup snapshot. |
| `set_backup_schedule` | Set/update an automated backup schedule. |
| `clear_backup_schedule` | Remove the schedule (existing backups kept). |

#### Billing

| Tool | What it does |
|---|---|
| `get_balance` | Current account balance and billing flags. |
| `list_transactions` | Balance transactions (top-ups, charges, refunds). |
| `get_usage` | Monthly usage-based billing summary. |
| `get_payment_method` | Saved card info. |
| `get_auto_reload` | Current auto-reload settings. |

### Data plane

| Tool | What it does |
|---|---|
| `test_connection` | Quick health check on the target GQLDB instance. |
| `run_gql_query` | Execute a GQL query and return results. |
| `explain_query` | Return the execution plan without running the query. |
| `run_algo` | Run a built-in graph algorithm. Centrality, community detection, similarity, pathfinding, graph embeddings, etc. Same execution as `run_gql_query`; separate so the agent surfaces the algorithm catalog for analytical questions. |
| `list_graphs` | List all graphs on the instance. |
| `describe_schema` | Detect graph mode (OPEN / CLOSED / ONTOLOGY) and run schema introspection. |
| `create_graph` | Create a new graph (OPEN / CLOSED / ONTOLOGY). |
| `delete_graph` | Drop a graph. |
| `write_data` | Run a GQL DML statement the agent composes by hand. For files on the user's machine, use `import_data` instead. |
| `import_data` | Bulk-write structured nodes / edges via the driver's gRPC bulk-insert path. Highly recommend to provide filepath to the CSV, JSON, or JSONL files. |
| `write_procedure` | Create a stored procedure. |
| `get_db_version` | Live GQLDB version reported by the instance. |
| `get_db_license` | GQLDB Edition + license info. |
| `reload_db_stats` | Rebuild the instance's stored statistics. |

### Docs

| Tool | What it does |
|---|---|
| `lookup_docs` | Fetch Ultipa documentation pages by topic. Useful for the agent to ground GQLDB features and GQL composition in authoritative reference. |

## Troubleshooting

For agent-side trace debugging, set `ULTIPA_MCP_DEBUG=1` in the MCP env to log every tool call name + latency to stderr.

## Privacy

Ultipa MCP is a thin client to Ultipa Cloud and/or the GQLDB instance you configure. It collects no analytics or telemetry. It can run in two shapes:

- **Stdio mode** — Claude Desktop, Claude Code, Cursor, etc. The server runs locally as a subprocess of your MCP client.
- **Remote mode** — Claude Web. Connects to `mcp.ultipa.com`, an Ultipa-operated HTTP MCP server that authenticates each request via OAuth against `account.ultipa.com`.

Either way:

- **Credentials** — In stdio mode, env vars (`ULTIPA_CLOUD_API_KEY`, or `ULTIPA_HOST` / `ULTIPA_USERNAME` / `ULTIPA_PASSWORD`) are read from your MCP client's configuration and used only to authenticate requests to the Ultipa target you configure. They are never logged or persisted. In remote mode, your Ultipa Cloud account session (a short-lived OAuth bearer token) is forwarded request-by-request to Ultipa Cloud and never stored on the MCP server beyond the request lifetime.
- **Queries and data** you act on (GQL you run, records you import, etc.) are transmitted only to that configured Ultipa Cloud account or GQLDB instance, to carry out the tool call you invoked. Results are returned to your MCP client and are not retained by this server.
- **No conversation data** is accessed or collected — the server never reads your chat history, memory, or local files, except file paths you explicitly pass to `import_data`.
- **Third parties:** data sent to Ultipa Cloud / your instance is handled under Ultipa's [Privacy Policy](https://www.ultipa.com/legal/privacy). The `lookup_docs` tool fetches public documentation pages from GitHub (`ultipa/ultipa-docs`).
- **Diagnostics:** `ULTIPA_MCP_DEBUG=1` logs tool names + latency to stderr (local only); off by default.
- **Retention:** none by this server. **Questions:** open an issue at [github.com/ultipa/gqldb-mcp/issues](https://github.com/ultipa/gqldb-mcp/issues).

Full Ultipa privacy policy: <https://www.ultipa.com/legal/privacy>

## License

ISC
