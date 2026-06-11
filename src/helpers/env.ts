// Centralized env-var reading + auth-mode flags.
// Both modes are independent; either or both can be configured.

// Ultipa Cloud — control plane + data-plane access against any account instance via `id`
export const API_KEY = process.env.ULTIPA_CLOUD_API_KEY;
export const BASE_URL =
  process.env.ULTIPA_CLOUD_BASE_URL ?? "https://dbaas.ultipa.com";

// Direct instance — data plane only, against the env-configured GQLDB instance
export const INSTANCE_HOST = process.env.ULTIPA_HOST;
export const INSTANCE_USER = process.env.ULTIPA_USERNAME;
export const INSTANCE_PASSWORD = process.env.ULTIPA_PASSWORD;
export const DEFAULT_GRAPH = process.env.ULTIPA_GRAPH;

export const hasModeA = !!API_KEY;
export const hasModeB = !!(INSTANCE_HOST && INSTANCE_USER && INSTANCE_PASSWORD);
