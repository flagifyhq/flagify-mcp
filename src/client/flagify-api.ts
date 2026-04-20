import { loadConfig, saveConfig } from "../auth/config.js";
import { PACKAGE_VERSION } from "../version.js";

export interface ApiClientOptions {
  apiUrl: string;
  accessToken?: string;
  refreshToken?: string;
  userAgent?: string;
  timeoutMs?: number;
  cacheTtlSeconds?: number;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiResponse<T> {
  status: number;
  body?: T;
  errorMessage?: string;
}

interface CacheEntry<T> {
  value: ApiResponse<T>;
  expiresAt: number;
}

export class FlagifyApiClient {
  private apiUrl: string;
  private accessToken?: string;
  private refreshToken?: string;
  private userAgent: string;
  private timeoutMs: number;
  private cacheTtlMs: number;
  private cache = new Map<string, CacheEntry<unknown>>();

  constructor(options: ApiClientOptions) {
    this.apiUrl = options.apiUrl;
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.userAgent = options.userAgent ?? `flagify-mcp/${PACKAGE_VERSION}`;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.cacheTtlMs = Math.max(0, options.cacheTtlSeconds ?? 0) * 1000;
  }

  async get<T>(path: string, opts: { cache?: boolean } = {}): Promise<ApiResponse<T>> {
    if (opts.cache && this.cacheTtlMs > 0) {
      const hit = this.readCache<T>(path);
      if (hit) return hit;
    }
    const res = await this.authedRequest<T>("GET", path);
    if (opts.cache && this.cacheTtlMs > 0 && res.status === 200) {
      this.writeCache(path, res);
    }
    return res;
  }

  post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.authedRequest<T>("POST", path, body);
  }

  put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    this.invalidateCache();
    return this.authedRequest<T>("PUT", path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    this.invalidateCache();
    return this.authedRequest<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<ApiResponse<T>> {
    this.invalidateCache();
    return this.authedRequest<T>("DELETE", path);
  }

  invalidateCache(): void {
    this.cache.clear();
  }

  private async authedRequest<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    let res = await this.rawRequest<T>(method, path, body, this.accessToken);
    if (res.status !== 401) return res;

    const refreshed = await this.tryRefresh();
    if (!refreshed) return res;

    this.accessToken = refreshed.accessToken;
    this.refreshToken = refreshed.refreshToken;
    await persistRotatedTokens(refreshed.accessToken, refreshed.refreshToken);

    res = await this.rawRequest<T>(method, path, body, refreshed.accessToken);
    return res;
  }

  private async tryRefresh(): Promise<{ accessToken: string; refreshToken: string } | null> {
    if (!this.refreshToken) return null;
    const res = await this.rawRequest<{ accessToken: string; refreshToken: string }>(
      "POST",
      "/v1/auth/refresh",
      { refreshToken: this.refreshToken },
      undefined,
    );
    if (
      res.status === 200 &&
      res.body?.accessToken &&
      res.body.refreshToken
    ) {
      return {
        accessToken: res.body.accessToken,
        refreshToken: res.body.refreshToken,
      };
    }
    return null;
  }

  private async rawRequest<T>(
    method: HttpMethod,
    path: string,
    body: unknown,
    token: string | undefined,
  ): Promise<ApiResponse<T>> {
    let url: URL;
    try {
      url = new URL(path, this.apiUrl);
    } catch {
      return { status: 0, errorMessage: "invalid apiUrl" };
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": this.userAgent,
      "X-Flagify-Source": "mcp",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload: string | undefined;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });
      const raw = await response.text();
      const status = response.status;
      if (status >= 200 && status < 300) {
        if (!raw.length) return { status };
        try {
          return { status, body: JSON.parse(raw) as T };
        } catch {
          return { status, errorMessage: "invalid JSON response" };
        }
      }
      return { status, errorMessage: redactSecrets(raw).slice(0, 500) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 0, errorMessage: redactSecrets(message) };
    } finally {
      clearTimeout(timer);
    }
  }

  private readCache<T>(path: string): ApiResponse<T> | null {
    const entry = this.cache.get(path);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(path);
      return null;
    }
    return entry.value as ApiResponse<T>;
  }

  private writeCache<T>(path: string, value: ApiResponse<T>): void {
    this.cache.set(path, {
      value: value as ApiResponse<unknown>,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }
}

/**
 * Strip anything that smells like a bearer token or Authorization header out
 * of error strings before they land in a tool response (which the LLM may
 * repeat to the user, and the host will log). Belt-and-suspenders against
 * misbehaving gateways that echo request headers in their 5xx bodies.
 */
function redactSecrets(text: string): string {
  return text
    .replace(/[Bb]earer\s+[A-Za-z0-9._\-~+/=]+/g, "Bearer [redacted]")
    .replace(/[Aa]uthorization:\s*[^\s,"}]+/g, "Authorization: [redacted]")
    .replace(/\b[ps]k_(?:live|test|dev|prod)_[A-Za-z0-9]+/g, "[redacted-api-key]");
}

async function persistRotatedTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  try {
    const cfg = await loadConfig();
    cfg.accessToken = accessToken;
    cfg.refreshToken = refreshToken;
    await saveConfig(cfg);
  } catch {
    // Token rotation is best-effort — if we can't write the config (e.g. CWD
    // has no home, read-only FS), the in-memory client state still has the
    // new tokens for the current session.
  }
}
