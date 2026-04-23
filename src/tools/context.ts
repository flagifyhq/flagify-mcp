import {
  DEFAULT_API_URL,
  getAccessToken,
  loadLoadedConfig,
  persistRotatedTokensForProfile,
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
  /** The profile the MCP pinned at startup. "" when reading a v1 config or when tokens come from env. */
  profile: string;
  /** True when tokens were provided via FLAGIFY_ACCESS_TOKEN — refreshes never persist. */
  ephemeral: boolean;
}

export class MissingAuthError extends Error {
  constructor() {
    super(
      "No access token found. Run `flagify auth login` first so the MCP server can read ~/.flagify/config.json, or set FLAGIFY_ACCESS_TOKEN in the host config.",
    );
    this.name = "MissingAuthError";
  }
}

export class InvalidTokenError extends Error {
  constructor(prefix: string) {
    super(
      `Found a Flagify API key (${prefix}...) instead of a JWT. API keys can only evaluate flags, not manage them — every mutation will 403. Run \`flagify auth login\` to get a user JWT, or set FLAGIFY_ACCESS_TOKEN to an access token.`,
    );
    this.name = "InvalidTokenError";
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

export class UnknownProfileError extends Error {
  constructor(profile: string) {
    super(
      `FLAGIFY_PROFILE=${profile} was requested but no such profile exists in ~/.flagify/config.json. Run \`flagify auth login --profile ${profile}\` first, or choose an existing profile with \`flagify auth list\`.`,
    );
    this.name = "UnknownProfileError";
  }
}

let cached: ToolContext | null = null;

/**
 * Pin-at-start: the first tool call resolves a single profile (or an
 * ephemeral env token) and every later call reuses it. A `flagify auth switch`
 * in another terminal cannot silently change the account this MCP is acting
 * against — the user must restart the MCP to change profiles.
 */
export async function getToolContext(): Promise<ToolContext> {
  if (cached) return cached;

  const envAccessToken = process.env.FLAGIFY_ACCESS_TOKEN?.trim() || "";
  const envRefreshToken = process.env.FLAGIFY_REFRESH_TOKEN?.trim() || "";

  if (envAccessToken) {
    if (envAccessToken.startsWith("pk_") || envAccessToken.startsWith("sk_")) {
      throw new InvalidTokenError(envAccessToken.slice(0, 3));
    }
    // Env token path still reads the store for apiUrl / scope defaults, but
    // persistence and profile pinning are suppressed.
    const loaded = await loadLoadedConfig();
    const apiUrl = resolveApiUrl(loaded.config);
    const scope = resolveScope(loaded.config);
    const client = new FlagifyApiClient({
      apiUrl,
      accessToken: envAccessToken,
      refreshToken: envRefreshToken || undefined,
      cacheTtlSeconds: 30,
      // No onTokenRotation: env tokens are ephemeral by contract.
    });
    cached = {
      client,
      config: loaded.config,
      scope,
      apiUrl,
      profile: "",
      ephemeral: true,
    };
    return cached;
  }

  const loaded = await loadLoadedConfig();

  // v2 with FLAGIFY_PROFILE requested but missing → fail loud instead of
  // silently falling through to the current profile.
  if (loaded.schema === 2) {
    const requested = process.env.FLAGIFY_PROFILE?.trim();
    if (requested && !getAccessToken(loaded.config)) {
      throw new UnknownProfileError(requested);
    }
  }

  const accessToken = getAccessToken(loaded.config);
  if (!accessToken) throw new MissingAuthError();
  if (accessToken.startsWith("pk_") || accessToken.startsWith("sk_")) {
    throw new InvalidTokenError(accessToken.slice(0, 3));
  }

  const apiUrl = resolveApiUrl(loaded.config);
  const scope = resolveScope(loaded.config);

  // Capture the resolved schema + profile in the closure so later refreshes
  // write into the pinned slot even if the user flips `current` elsewhere.
  const { schema, profile } = loaded;

  const client = new FlagifyApiClient({
    apiUrl,
    accessToken,
    refreshToken: loaded.config.refreshToken,
    cacheTtlSeconds: 30,
    onTokenRotation: async (newAccess, newRefresh) => {
      await persistRotatedTokensForProfile(profile, schema, newAccess, newRefresh);
    },
  });

  cached = {
    client,
    config: loaded.config,
    scope,
    apiUrl,
    profile,
    ephemeral: false,
  };
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
