// Centralized env-var reading + auth-mode flags.
// Both modes are independent; either or both can be configured.

// Read an env var, treating an unset OR empty-string value as undefined. One-click
// installers (e.g. Claude Desktop .mcpb extensions) inject "" for optional config
// fields the user left blank; collapsing "" → undefined keeps auth-mode detection and
// the `?? DEFAULT_GRAPH` fallbacks (src/tools/dataplane.ts) behaving as designed.
const env = (name: string): string | undefined => {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
};

// Ultipa Cloud — control plane + data-plane access against any account instance via `id`
export const API_KEY = env("ULTIPA_CLOUD_API_KEY");
export const BASE_URL = env("ULTIPA_CLOUD_BASE_URL") ?? "https://dbaas.ultipa.com";

// Direct instance — data plane only, against the env-configured GQLDB instance
export const INSTANCE_HOST = env("ULTIPA_HOST");
export const INSTANCE_USER = env("ULTIPA_USERNAME");
export const INSTANCE_PASSWORD = env("ULTIPA_PASSWORD");
export const DEFAULT_GRAPH = env("ULTIPA_GRAPH");

export const hasModeA = !!API_KEY;
export const hasModeB = !!(INSTANCE_HOST && INSTANCE_USER && INSTANCE_PASSWORD);

// Debug logging — when ULTIPA_MCP_DEBUG is truthy ("1", "true", etc.), every
// tool call's name + latency + error (if any) goes to stderr. Useful for
// agent-trace debugging without slowing down normal operation.
export const DEBUG = (() => {
  const v = process.env.ULTIPA_MCP_DEBUG?.toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes" || v === "on";
})();
