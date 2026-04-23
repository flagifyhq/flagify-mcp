import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as process from "node:process";

/**
 * Flat v1 projection of ~/.flagify/config.json. Consumers of the MCP (tools,
 * API client) have always seen this shape; with multi-account (v2) it becomes
 * a projection of the selected profile rather than the whole file.
 */
export interface FlagifyConfig {
  accessToken?: string;
  refreshToken?: string;
  apiUrl?: string;
  consoleUrl?: string;
  workspace?: string;
  workspaceId?: string;
  project?: string;
  projectId?: string;
  environment?: string;
  token?: string;
}

export interface StoreV2UserInfo {
  id?: string;
  email?: string;
  name?: string;
}

export interface StoreV2Defaults {
  workspace?: string;
  workspaceId?: string;
  project?: string;
  projectId?: string;
  environment?: string;
}

export interface StoreV2Account {
  accessToken?: string;
  refreshToken?: string;
  apiUrl?: string;
  consoleUrl?: string;
  user?: StoreV2UserInfo;
  defaults?: StoreV2Defaults;
}

export interface StoreV2 {
  version: 2;
  current?: string;
  accounts?: Record<string, StoreV2Account>;
  bindings?: Record<string, { profile: string }>;
}

/**
 * LoadedConfig wraps the flat projection plus the metadata the MCP needs to
 * write back into the right slot during token rotation: which schema the file
 * uses and, for v2, which profile the MCP is pinned to.
 */
export interface LoadedConfig {
  schema: 1 | 2;
  profile: string; // "" when schema=1 (no profiles exist in v1)
  config: FlagifyConfig;
}

export const DEFAULT_API_URL = "https://api.flagify.dev";
export const DEFAULT_CONSOLE_URL = "https://console.flagify.dev";

export function configPath(): string {
  return path.join(os.homedir(), ".flagify", "config.json");
}

/** Raw file read + JSON parse. Missing file → null; other errors propagate. */
async function readRaw(): Promise<unknown | null> {
  try {
    const text = await fs.readFile(configPath(), "utf8");
    return JSON.parse(text) as unknown;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Read ~/.flagify/config.json and return the active-profile projection.
 * Understands both v1 (flat) and v2 (multi-account) schemas. Never writes to
 * disk — migration is the CLI's job, not the MCP's.
 *
 * Profile resolution for v2:
 *   FLAGIFY_PROFILE env var → store.current → single-account fallback.
 *
 * When the env-requested profile does not exist in the store, returns an
 * empty FlagifyConfig with profile=<requested>; callers can detect the
 * missing-profile case by checking accessToken.
 */
export async function loadLoadedConfig(): Promise<LoadedConfig> {
  const raw = await readRaw();
  if (!raw || typeof raw !== "object") {
    return { schema: 1, profile: "", config: {} };
  }

  if (isStoreV2(raw)) {
    const profile = pickProfileForStore(raw);
    const account = profile ? raw.accounts?.[profile] : undefined;
    return {
      schema: 2,
      profile,
      config: account ? projectAccount(account) : {},
    };
  }

  // Flat v1
  return { schema: 1, profile: "", config: raw as FlagifyConfig };
}

/** Legacy entrypoint kept for callers that only care about the flat config. */
export async function loadConfig(): Promise<FlagifyConfig> {
  const loaded = await loadLoadedConfig();
  return loaded.config;
}

/**
 * Overwrites the flat v1 shape. Only safe to call on a v1 file — v2 writes
 * must go through persistRotatedTokensForProfile so other accounts in the
 * store are not clobbered.
 */
export async function saveConfig(cfg: FlagifyConfig): Promise<void> {
  await atomicWrite(cfg);
}

async function atomicWrite(payload: unknown): Promise<void> {
  const target = configPath();
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
  await fs.rename(tmp, target);
}

/**
 * Updates the access/refresh tokens for the captured profile without touching
 * any sibling profile. Re-reads the store before writing so concurrent CLI
 * logins/logouts on other profiles are preserved. If the profile disappeared
 * mid-flight (removed via `flagify auth remove`), this is a no-op — we don't
 * resurrect a ghost profile from the MCP.
 */
export async function persistRotatedTokensForProfile(
  profile: string,
  schema: 1 | 2,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  try {
    if (schema === 1) {
      const cfg = await loadConfig();
      cfg.accessToken = accessToken;
      cfg.refreshToken = refreshToken;
      await saveConfig(cfg);
      return;
    }

    const raw = await readRaw();
    if (!raw || !isStoreV2(raw) || !raw.accounts) return;
    const account = raw.accounts[profile];
    if (!account) return;
    account.accessToken = accessToken;
    account.refreshToken = refreshToken;
    await atomicWrite(raw);
  } catch {
    // Best-effort: if the filesystem is read-only or the file was edited into
    // an unparseable state mid-rotation, keep the new tokens in memory for the
    // current process and move on.
  }
}

export function getAccessToken(cfg: FlagifyConfig): string | undefined {
  return cfg.accessToken || cfg.token || undefined;
}

export function resolveApiUrl(cfg: FlagifyConfig): string {
  return process.env.FLAGIFY_API_URL || cfg.apiUrl || DEFAULT_API_URL;
}

export function resolveConsoleUrl(cfg: FlagifyConfig): string {
  if (cfg.consoleUrl) return cfg.consoleUrl;
  const api = resolveApiUrl(cfg);
  if (api.includes("localhost") || api.startsWith("http://local-")) {
    return "https://local-console.flagify.dev";
  }
  return DEFAULT_CONSOLE_URL;
}

export interface ResolvedScope {
  workspaceId?: string;
  workspace?: string;
  projectId?: string;
  project?: string;
  environment?: string;
}

export function resolveScope(cfg: FlagifyConfig): ResolvedScope {
  return {
    workspaceId: process.env.FLAGIFY_WORKSPACE_ID || cfg.workspaceId,
    workspace: process.env.FLAGIFY_WORKSPACE || cfg.workspace,
    projectId: process.env.FLAGIFY_PROJECT_ID || cfg.projectId,
    project: process.env.FLAGIFY_PROJECT || cfg.project,
    environment: process.env.FLAGIFY_ENVIRONMENT || cfg.environment,
  };
}

// --- helpers --------------------------------------------------------------

function isStoreV2(raw: unknown): raw is StoreV2 {
  return (
    typeof raw === "object" &&
    raw !== null &&
    (raw as { version?: unknown }).version === 2
  );
}

/**
 * Encapsulates the precedence from the decision doc for the MCP pin-at-start:
 *   FLAGIFY_PROFILE (if it exists in the store) → store.current (if valid)
 *   → the sole account when there's exactly one → "".
 *
 * A requested-but-missing FLAGIFY_PROFILE returns the raw name so callers
 * surface a clear "profile not found" error rather than silently falling
 * through to the wrong account.
 */
export function pickProfileForStore(store: StoreV2): string {
  const accounts = store.accounts ?? {};
  const requested = process.env.FLAGIFY_PROFILE?.trim();

  if (requested) {
    return requested;
  }
  if (store.current && store.current in accounts) {
    return store.current;
  }
  const keys = Object.keys(accounts);
  if (keys.length === 1) {
    return keys[0];
  }
  return "";
}

function projectAccount(account: StoreV2Account): FlagifyConfig {
  const defaults = account.defaults ?? {};
  return {
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    apiUrl: account.apiUrl,
    consoleUrl: account.consoleUrl,
    workspace: defaults.workspace,
    workspaceId: defaults.workspaceId,
    project: defaults.project,
    projectId: defaults.projectId,
    environment: defaults.environment,
  };
}
