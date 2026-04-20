import * as http from "node:http";
import * as os from "node:os";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { saveConfig, loadConfig } from "./config.js";

export interface BrowserLoginOptions {
  consoleUrl: string;
  timeoutMs?: number;
  openBrowser?: boolean;
}

export interface BrowserLoginResult {
  accessToken: string;
  refreshToken: string;
  authUrl: string;
}

/**
 * Ports cli/cmd/login.go:82 loginBrowser to TS. Binds localhost:<random>,
 * opens the console's /auth/cli-auth page with p=<port>&did=<deviceID>, and
 * resolves when the console redirects to /callback with tokens.
 */
export async function browserLogin(
  opts: BrowserLoginOptions,
): Promise<BrowserLoginResult> {
  const deviceID = `mcp-${os.hostname()}`;
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  let authUrl = "";

  return new Promise<BrowserLoginResult>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith("/callback")) {
        res.writeHead(404).end();
        return;
      }
      const url = new URL(req.url, "http://localhost");
      const accessToken = url.searchParams.get("access_token");
      const refreshToken = url.searchParams.get("refresh_token");

      if (!accessToken || !refreshToken) {
        redirectTo(res, `${opts.consoleUrl}/auth/cli-auth?status=error`);
        cleanup();
        reject(new Error("missing tokens in callback"));
        return;
      }
      redirectTo(res, `${opts.consoleUrl}/auth/cli-auth?status=success`);
      cleanup();
      persistLogin(accessToken, refreshToken).then(
        () => resolve({ accessToken, refreshToken, authUrl }),
        (err) => reject(err),
      );
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("authentication timed out"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      server.close();
    }

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      const params = new URLSearchParams({ p: String(port), did: deviceID });
      authUrl = `${opts.consoleUrl}/auth/cli-auth?${params.toString()}`;
      if (opts.openBrowser !== false) {
        openInBrowser(authUrl);
      }
    });
  });
}

function redirectTo(res: http.ServerResponse, target: string): void {
  res.writeHead(307, { Location: target }).end();
}

function openInBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  const args = platform === "win32" ? ["", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // Opening the browser is best-effort; the caller still has the URL.
  }
}

async function persistLogin(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const cfg = await loadConfig();
  cfg.accessToken = accessToken;
  cfg.refreshToken = refreshToken;
  cfg.token = undefined;
  await saveConfig(cfg);
}
