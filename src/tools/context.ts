import {
  DEFAULT_API_URL,
  getAccessToken,
  loadConfig,
  resolveApiUrl,
  resolveScope,
  type FlagifyConfig,
  type ResolvedScope,
} from "../auth/config.js";
import { FlagifyApiClient } from "../client/flagify-api.js";

export interface ToolContext {
  client: FlagifyApiClient;
  config: FlagifyConfig;
  scope: ResolvedScope;
  apiUrl: string;
}

export class MissingAuthError extends Error {
  constructor() {
    super(
      "No access token found. Run `flagify login` first so the MCP server can read ~/.flagify/config.json, or set FLAGIFY_ACCESS_TOKEN in the host config.",
    );
    this.name = "MissingAuthError";
  }
}

export class MissingScopeError extends Error {
  constructor(missing: "projectId" | "workspaceId") {
    super(
      `No ${missing} found. Run \`flagify projects pick\` to set a default project, or pass FLAGIFY_${missing === "projectId" ? "PROJECT_ID" : "WORKSPACE_ID"} in the host config.`,
    );
    this.name = "MissingScopeError";
  }
}

let cached: ToolContext | null = null;

/**
 * Lazy-loads the config, builds the API client, and resolves scope. Cached
 * per-process — the MCP server is short-lived and tokens rotate in-memory.
 * Callers that mutate scope (e.g. via per-tool arguments) should clone the
 * returned scope rather than mutating it.
 */
export async function getToolContext(): Promise<ToolContext> {
  if (cached) return cached;

  const config = await loadConfig();
  const accessToken = process.env.FLAGIFY_ACCESS_TOKEN || getAccessToken(config);
  if (!accessToken) throw new MissingAuthError();

  const apiUrl = resolveApiUrl(config);
  const scope = resolveScope(config);

  const client = new FlagifyApiClient({
    apiUrl,
    accessToken,
    refreshToken: config.refreshToken,
    cacheTtlSeconds: 30,
  });

  cached = { client, config, scope, apiUrl };
  return cached;
}

export function requireProjectId(scope: ResolvedScope): string {
  if (!scope.projectId) throw new MissingScopeError("projectId");
  return scope.projectId;
}

export function requireWorkspaceId(scope: ResolvedScope): string {
  if (!scope.workspaceId) throw new MissingScopeError("workspaceId");
  return scope.workspaceId;
}

// Exposed for tests — resets the per-process cache.
export function resetToolContext(): void {
  cached = null;
}

export { DEFAULT_API_URL };
