import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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

export const DEFAULT_API_URL = "https://api.flagify.dev";
export const DEFAULT_CONSOLE_URL = "https://console.flagify.dev";

export function configPath(): string {
  return path.join(os.homedir(), ".flagify", "config.json");
}

export async function loadConfig(): Promise<FlagifyConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    return JSON.parse(raw) as FlagifyConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export async function saveConfig(cfg: FlagifyConfig): Promise<void> {
  const target = configPath();
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  await fs.rename(tmp, target);
}

export function getAccessToken(cfg: FlagifyConfig): string | undefined {
  return cfg.accessToken || cfg.token || undefined;
}

export function resolveApiUrl(cfg: FlagifyConfig): string {
  return (
    process.env.FLAGIFY_API_URL ||
    cfg.apiUrl ||
    DEFAULT_API_URL
  );
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
}

export function resolveScope(cfg: FlagifyConfig): ResolvedScope {
  return {
    workspaceId: process.env.FLAGIFY_WORKSPACE_ID || cfg.workspaceId,
    workspace: process.env.FLAGIFY_WORKSPACE || cfg.workspace,
    projectId: process.env.FLAGIFY_PROJECT_ID || cfg.projectId,
    project: process.env.FLAGIFY_PROJECT || cfg.project,
  };
}
